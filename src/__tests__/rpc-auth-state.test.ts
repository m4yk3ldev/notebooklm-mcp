import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  refreshCookiesHeadless: vi.fn(),
  runBrowserAuthFlow: vi.fn(),
  saveTokens: vi.fn(),
  loadTokensFromCache: vi.fn(),
}));

vi.mock("../browser-auth.js", () => ({
  refreshCookiesHeadless: hoisted.refreshCookiesHeadless,
  runBrowserAuthFlow: hoisted.runBrowserAuthFlow,
}));
vi.mock("../auth.js", () => ({
  saveTokens: hoisted.saveTokens,
  loadTokensFromCache: hoisted.loadTokensFromCache,
}));

import { AuthState } from "../rpc/auth-state.js";

function seed() {
  return {
    cookies: { SID: "a", HSID: "b", SSID: "c", APISID: "d", SAPISID: "e" },
    csrf_token: "csrf-0",
    session_id: "sid-0",
    extracted_at: 1700000000,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AuthState", () => {
  it("getters expose tokens / csrf / sessionId / cookies", () => {
    const s = new AuthState(seed());
    expect(s.tokens.csrf_token).toBe("csrf-0");
    expect(s.csrfToken).toBe("csrf-0");
    expect(s.sessionId).toBe("sid-0");
    expect(s.cookies.SID).toBe("a");
  });

  it("recordSessionId mutates and persists", () => {
    const s = new AuthState(seed());
    s.recordSessionId("new-sid");
    expect(s.sessionId).toBe("new-sid");
    expect(s.tokens.session_id).toBe("new-sid");
    expect(hoisted.saveTokens).toHaveBeenCalled();
  });

  it("recordCsrfToken mutates and persists", () => {
    const s = new AuthState(seed());
    s.recordCsrfToken("new-csrf");
    expect(s.csrfToken).toBe("new-csrf");
    expect(hoisted.saveTokens).toHaveBeenCalled();
  });

  it("recordSetCookies merges name/value pairs into the jar", () => {
    const s = new AuthState(seed());
    s.recordSetCookies(["NEW=v1; Path=/", "SID=updated; HttpOnly"]);
    expect(s.cookies.NEW).toBe("v1");
    expect(s.cookies.SID).toBe("updated");
    expect(hoisted.saveTokens).toHaveBeenCalled();
  });

  it("recordSetCookies short-circuits on empty input (no save)", () => {
    const s = new AuthState(seed());
    s.recordSetCookies([]);
    expect(hoisted.saveTokens).not.toHaveBeenCalled();
  });

  it("recordSetCookies ignores malformed cookie strings with no '='", () => {
    const s = new AuthState(seed());
    s.recordSetCookies(["MALFORMED; Path=/"]);
    // No cookie added — saveTokens still runs because the loop completed.
    expect(s.cookies.MALFORMED).toBeUndefined();
    expect(hoisted.saveTokens).toHaveBeenCalled();
  });

  it("replaceTokens swaps the whole bundle", () => {
    const s = new AuthState(seed());
    s.replaceTokens({ ...seed(), csrf_token: "x", extracted_at: 1700000100 });
    expect(s.csrfToken).toBe("x");
  });

  it("reloadIfNewer returns true and updates when disk has a fresher bundle", async () => {
    const s = new AuthState(seed());
    hoisted.loadTokensFromCache.mockReturnValue({
      ...seed(),
      csrf_token: "fresh",
      extracted_at: 1700000999,
    });
    expect(await s.reloadIfNewer()).toBe(true);
    expect(s.csrfToken).toBe("fresh");
  });

  it("reloadIfNewer returns false when disk has nothing fresher", async () => {
    const s = new AuthState(seed());
    hoisted.loadTokensFromCache.mockReturnValue({ ...seed(), extracted_at: 1 });
    expect(await s.reloadIfNewer()).toBe(false);
  });

  it("reloadIfNewer returns false when cache returns null", async () => {
    const s = new AuthState(seed());
    hoisted.loadTokensFromCache.mockReturnValue(null);
    expect(await s.reloadIfNewer()).toBe(false);
  });

  it("refreshOnce single-flights concurrent callers", async () => {
    hoisted.refreshCookiesHeadless.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return { ...seed(), csrf_token: "csrf-1", extracted_at: 1700000001 };
    });
    const s = new AuthState(seed());
    await Promise.all([s.refreshOnce(), s.refreshOnce(), s.refreshOnce()]);
    expect(hoisted.refreshCookiesHeadless).toHaveBeenCalledTimes(1);
    expect(s.csrfToken).toBe("csrf-1");
  });

  it("refreshOnce falls back to runBrowserAuthFlow when headless throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    hoisted.refreshCookiesHeadless.mockRejectedValueOnce(new Error("headless down"));
    hoisted.runBrowserAuthFlow.mockResolvedValueOnce({
      ...seed(),
      csrf_token: "csrf-fallback",
    });
    const s = new AuthState(seed());
    await s.refreshOnce();
    expect(hoisted.runBrowserAuthFlow).toHaveBeenCalled();
    expect(s.csrfToken).toBe("csrf-fallback");
  });

  it("refreshOnce clears its slot after settle (next failure retries)", async () => {
    hoisted.refreshCookiesHeadless.mockResolvedValue({ ...seed(), csrf_token: "x" });
    const s = new AuthState(seed());
    await s.refreshOnce();
    await s.refreshOnce();
    expect(hoisted.refreshCookiesHeadless).toHaveBeenCalledTimes(2);
  });
});

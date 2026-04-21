import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tempHome = "";
const originalEnv = { ...process.env };

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => tempHome };
});

async function importAuth() {
  vi.resetModules();
  return import("../auth.js");
}

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "notebooklm-auth-test-"));
  process.env = { ...originalEnv };
  delete process.env.NOTEBOOKLM_COOKIES;
  delete process.env.NOTEBOOKLM_CSRF_TOKEN;
  delete process.env.NOTEBOOKLM_SESSION_ID;
});

afterEach(() => {
  rmSync(tempHome, { recursive: true, force: true });
  process.env = { ...originalEnv };
});

describe("validateCookies", () => {
  it("returns true when every required cookie present", async () => {
    const { validateCookies } = await importAuth();
    const cookies = { SID: "x", HSID: "x", SSID: "x", APISID: "x", SAPISID: "x" };
    expect(validateCookies(cookies)).toBe(true);
  });

  it("returns false when any required cookie missing", async () => {
    const { validateCookies } = await importAuth();
    expect(validateCookies({ SID: "x" })).toBe(false);
  });

  it("returns false for empty object", async () => {
    const { validateCookies } = await importAuth();
    expect(validateCookies({})).toBe(false);
  });
});

describe("buildCookieHeader", () => {
  it("joins entries with semicolons", async () => {
    const { buildCookieHeader } = await importAuth();
    expect(buildCookieHeader({ a: "1", b: "2" })).toBe("a=1; b=2");
  });

  it("returns empty string for empty cookies", async () => {
    const { buildCookieHeader } = await importAuth();
    expect(buildCookieHeader({})).toBe("");
  });
});

describe("extractCsrfFromPage", () => {
  it("matches SNlM0e pattern", async () => {
    const { extractCsrfFromPage } = await importAuth();
    expect(extractCsrfFromPage('"SNlM0e":"abc123"')).toBe("abc123");
  });

  it("falls back to at= pattern", async () => {
    const { extractCsrfFromPage } = await importAuth();
    expect(extractCsrfFromPage("at=xyz&other=x")).toBe("xyz");
  });

  it("returns null when no pattern matches", async () => {
    const { extractCsrfFromPage } = await importAuth();
    expect(extractCsrfFromPage("<html>no tokens</html>")).toBeNull();
  });
});

describe("extractSessionIdFromPage", () => {
  it("matches FdrFJe pattern", async () => {
    const { extractSessionIdFromPage } = await importAuth();
    expect(extractSessionIdFromPage('"FdrFJe":"sess-42"')).toBe("sess-42");
  });

  it("matches f.sid numeric pattern", async () => {
    const { extractSessionIdFromPage } = await importAuth();
    expect(extractSessionIdFromPage("f.sid=123456")).toBe("123456");
  });

  it("returns null when absent", async () => {
    const { extractSessionIdFromPage } = await importAuth();
    expect(extractSessionIdFromPage("nothing here")).toBeNull();
  });
});

describe("loadTokensFromEnv", () => {
  it("returns null when NOTEBOOKLM_COOKIES unset", async () => {
    const { loadTokensFromEnv } = await importAuth();
    expect(loadTokensFromEnv()).toBeNull();
  });

  it("returns null when required cookies missing", async () => {
    process.env.NOTEBOOKLM_COOKIES = "SID=only-this";
    const { loadTokensFromEnv } = await importAuth();
    expect(loadTokensFromEnv()).toBeNull();
  });

  it("parses env cookie string with all required cookies", async () => {
    process.env.NOTEBOOKLM_COOKIES =
      "SID=a; HSID=b; SSID=c; APISID=d; SAPISID=e; EXTRA=x";
    process.env.NOTEBOOKLM_CSRF_TOKEN = "csrf-1";
    process.env.NOTEBOOKLM_SESSION_ID = "sid-1";

    const { loadTokensFromEnv } = await importAuth();
    const tokens = loadTokensFromEnv();
    expect(tokens).not.toBeNull();
    expect(tokens!.cookies.SID).toBe("a");
    expect(tokens!.cookies.EXTRA).toBe("x");
    expect(tokens!.csrf_token).toBe("csrf-1");
    expect(tokens!.session_id).toBe("sid-1");
  });
});

describe("loadTokensFromCache / saveTokens", () => {
  it("returns null when auth file missing", async () => {
    const { loadTokensFromCache } = await importAuth();
    expect(loadTokensFromCache()).toBeNull();
  });

  it("returns null on malformed JSON", async () => {
    const dir = join(tempHome, ".notebooklm-mcp");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "auth.json"), "{not json");
    const { loadTokensFromCache } = await importAuth();
    expect(loadTokensFromCache()).toBeNull();
  });

  it("returns null when cookies incomplete on disk", async () => {
    const dir = join(tempHome, ".notebooklm-mcp");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "auth.json"),
      JSON.stringify({ cookies: { SID: "x" } }),
    );
    const { loadTokensFromCache } = await importAuth();
    expect(loadTokensFromCache()).toBeNull();
  });

  it("round-trips tokens via saveTokens -> loadTokensFromCache", async () => {
    const tokens = {
      cookies: { SID: "a", HSID: "b", SSID: "c", APISID: "d", SAPISID: "e" },
      csrf_token: "t",
      session_id: "s",
      extracted_at: 1700000000,
    };
    const { saveTokens, loadTokensFromCache } = await importAuth();
    saveTokens(tokens);
    expect(loadTokensFromCache()).toEqual(tokens);
  });
});

describe("loadTokens resolution order", () => {
  it("prefers env over cache", async () => {
    const dir = join(tempHome, ".notebooklm-mcp");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "auth.json"),
      JSON.stringify({
        cookies: { SID: "disk", HSID: "b", SSID: "c", APISID: "d", SAPISID: "e" },
        csrf_token: "disk-csrf",
        session_id: "disk-sid",
        extracted_at: 1,
      }),
    );

    process.env.NOTEBOOKLM_COOKIES =
      "SID=env; HSID=b; SSID=c; APISID=d; SAPISID=e";

    const { loadTokens } = await importAuth();
    expect(loadTokens().cookies.SID).toBe("env");
  });

  it("falls back to cache when env absent", async () => {
    const dir = join(tempHome, ".notebooklm-mcp");
    mkdirSync(dir, { recursive: true });
    const saved = {
      cookies: { SID: "disk", HSID: "b", SSID: "c", APISID: "d", SAPISID: "e" },
      csrf_token: "t",
      session_id: "s",
      extracted_at: 1,
    };
    writeFileSync(join(dir, "auth.json"), JSON.stringify(saved));
    const { loadTokens } = await importAuth();
    expect(loadTokens().cookies.SID).toBe("disk");
  });

  it("throws when neither env nor cache present", async () => {
    const { loadTokens } = await importAuth();
    expect(() => loadTokens()).toThrow(/No authentication tokens found/);
  });
});

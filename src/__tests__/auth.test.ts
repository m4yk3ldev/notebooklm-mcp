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

  it("ignores cookie segments with no '=' separator", async () => {
    // Add a malformed pair (no `=`) alongside the required cookies; the
    // malformed segment should be skipped, not treated as a name-only cookie.
    process.env.NOTEBOOKLM_COOKIES =
      "SID=a; HSID=b; SSID=c; APISID=d; SAPISID=e; MALFORMED";
    const { loadTokensFromEnv } = await importAuth();
    const tokens = loadTokensFromEnv();
    expect(tokens).not.toBeNull();
    expect(tokens!.cookies.MALFORMED).toBeUndefined();
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

  it("writes auth.json with mode 0600 and config dir with mode 0700", async () => {
    const tokens = {
      cookies: { SID: "a", HSID: "b", SSID: "c", APISID: "d", SAPISID: "e" },
      csrf_token: "t",
      session_id: "s",
      extracted_at: 1700000000,
    };
    const { saveTokens } = await importAuth();
    saveTokens(tokens);
    const { statSync } = await import("node:fs");
    const dirMode = statSync(join(tempHome, ".notebooklm-mcp")).mode & 0o777;
    const fileMode =
      statSync(join(tempHome, ".notebooklm-mcp", "auth.json")).mode & 0o777;
    expect(dirMode).toBe(0o700);
    expect(fileMode).toBe(0o600);
  });
});

describe("showTokens", () => {
  it("logs a warning when no cached tokens", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { showTokens } = await importAuth();
    showTokens();
    expect(spy).toHaveBeenCalledWith("No cached tokens found.");
    spy.mockRestore();
  });

  it("logs cookie count and required presence when cache exists", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { saveTokens, showTokens } = await importAuth();
    saveTokens({
      cookies: { SID: "a", HSID: "b", SSID: "c", APISID: "d", SAPISID: "e" },
      csrf_token: "t",
      session_id: "s",
      extracted_at: Date.now() / 1000,
    });
    showTokens();
    const log = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(log).toContain("5 (SID");
    expect(log).toContain("Required cookies present: yes");
    expect(log).toContain("CSRF token: present");
    spy.mockRestore();
  });

  it("reports missing csrf/session and 'unknown' age when extracted_at is falsy", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { saveTokens, showTokens } = await importAuth();
    saveTokens({
      cookies: { SID: "a", HSID: "b", SSID: "c", APISID: "d", SAPISID: "e" },
      csrf_token: "",
      session_id: "",
      extracted_at: 0,
    });
    showTokens();
    const log = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(log).toContain("CSRF token: missing");
    expect(log).toContain("Session ID: missing");
    expect(log).toContain("Age: unknown hours");
    spy.mockRestore();
  });
});

describe("runFileImport", () => {
  it("throws when no path supplied", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runFileImport } = await importAuth();
    await expect(runFileImport()).rejects.toThrow(/cookie file path/);
    spy.mockRestore();
  });

  it("throws when file lacks required cookies", async () => {
    const filePath = join(tempHome, "cookies.txt");
    writeFileSync(filePath, "SID=only-this");
    const { runFileImport } = await importAuth();
    await expect(runFileImport(filePath)).rejects.toThrow(/Missing required cookies/);
  });

  it("parses multi-line cookie file, ignores comments, saves tokens", async () => {
    const filePath = join(tempHome, "cookies.txt");
    writeFileSync(
      filePath,
      "# a comment\nSID=a; HSID=b; SSID=c\nAPISID=d; SAPISID=e\n",
    );
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runFileImport, loadTokensFromCache } = await importAuth();
    const tokens = await runFileImport(filePath);
    expect(tokens.cookies.SID).toBe("a");
    expect(tokens.cookies.APISID).toBe("d");
    expect(loadTokensFromCache()!.cookies.SID).toBe("a");
    spy.mockRestore();
  });

  it("parseCookieString (via runFileImport) skips segments with no '=' separator", async () => {
    // Drop a malformed token (no `=`) into the file so the
    // `eq > 0` false branch in parseCookieString is exercised.
    const filePath = join(tempHome, "cookies-malformed.txt");
    writeFileSync(
      filePath,
      "SID=a; HSID=b; SSID=c; APISID=d; SAPISID=e; ORPHAN\n",
    );
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runFileImport } = await importAuth();
    const tokens = await runFileImport(filePath);
    expect(tokens.cookies.ORPHAN).toBeUndefined();
    expect(tokens.cookies.SID).toBe("a");
    spy.mockRestore();
  });
});

describe("runAuthFlow", () => {
  const originalPlatform = process.platform;
  let readlineMock: any;
  let execSyncMock: any;

  beforeEach(() => {
    readlineMock = { createInterface: vi.fn() };
    execSyncMock = vi.fn();
  });

  it("saves cookies from stdin and returns tokens", async () => {
    vi.doMock("node:readline", () => readlineMock);
    vi.doMock("node:child_process", () => ({ execSync: execSyncMock }));
    readlineMock.createInterface.mockReturnValue({
      question: (_prompt: string, cb: (ans: string) => void) =>
        cb("SID=a; HSID=b; SSID=c; APISID=d; SAPISID=e"),
      close: vi.fn(),
    });

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runAuthFlow, loadTokensFromCache } = await importAuth();
    const tokens = await runAuthFlow();
    expect(tokens.cookies.SID).toBe("a");
    expect(loadTokensFromCache()).not.toBeNull();
    expect(execSyncMock).toHaveBeenCalled(); // opened browser
    spy.mockRestore();
    vi.doUnmock("node:readline");
    vi.doUnmock("node:child_process");
  });

  it("throws when stdin returns empty cookie", async () => {
    vi.doMock("node:readline", () => readlineMock);
    vi.doMock("node:child_process", () => ({ execSync: execSyncMock }));
    readlineMock.createInterface.mockReturnValue({
      question: (_p: string, cb: (ans: string) => void) => cb(""),
      close: vi.fn(),
    });

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runAuthFlow } = await importAuth();
    await expect(runAuthFlow()).rejects.toThrow(/No cookie string/);
    spy.mockRestore();
    vi.doUnmock("node:readline");
    vi.doUnmock("node:child_process");
  });

  it("throws when stdin cookies missing required fields", async () => {
    vi.doMock("node:readline", () => readlineMock);
    vi.doMock("node:child_process", () => ({ execSync: execSyncMock }));
    readlineMock.createInterface.mockReturnValue({
      question: (_p: string, cb: (ans: string) => void) => cb("SID=only"),
      close: vi.fn(),
    });
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runAuthFlow } = await importAuth();
    await expect(runAuthFlow()).rejects.toThrow(/Invalid cookie string/);
    spy.mockRestore();
    vi.doUnmock("node:readline");
    vi.doUnmock("node:child_process");
  });

  it("falls back gracefully when browser open fails", async () => {
    vi.doMock("node:readline", () => readlineMock);
    vi.doMock("node:child_process", () => ({
      execSync: vi.fn(() => {
        throw new Error("no xdg-open");
      }),
    }));
    readlineMock.createInterface.mockReturnValue({
      question: (_p: string, cb: (ans: string) => void) =>
        cb("SID=a; HSID=b; SSID=c; APISID=d; SAPISID=e"),
      close: vi.fn(),
    });

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runAuthFlow } = await importAuth();
    await expect(runAuthFlow()).resolves.toBeDefined();
    spy.mockRestore();
    vi.doUnmock("node:readline");
    vi.doUnmock("node:child_process");
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it.each(["linux", "darwin", "win32"])(
    "openInBrowser handles %s platform",
    async (platform) => {
      Object.defineProperty(process, "platform", { value: platform });
      vi.doMock("node:readline", () => readlineMock);
      vi.doMock("node:child_process", () => ({ execSync: execSyncMock }));
      readlineMock.createInterface.mockReturnValue({
        question: (_p: string, cb: (ans: string) => void) =>
          cb("SID=a; HSID=b; SSID=c; APISID=d; SAPISID=e"),
        close: vi.fn(),
      });

      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      const { runAuthFlow } = await importAuth();
      await runAuthFlow();
      expect(execSyncMock).toHaveBeenCalled();
      spy.mockRestore();
      vi.doUnmock("node:readline");
      vi.doUnmock("node:child_process");
    },
  );

  it("openInBrowser silently no-ops on unknown platforms (e.g. freebsd)", async () => {
    Object.defineProperty(process, "platform", { value: "freebsd" });
    vi.doMock("node:readline", () => readlineMock);
    vi.doMock("node:child_process", () => ({ execSync: execSyncMock }));
    readlineMock.createInterface.mockReturnValue({
      question: (_p: string, cb: (ans: string) => void) =>
        cb("SID=a; HSID=b; SSID=c; APISID=d; SAPISID=e"),
      close: vi.fn(),
    });

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runAuthFlow } = await importAuth();
    await runAuthFlow();
    // No execSync call because no branch matched.
    expect(execSyncMock).not.toHaveBeenCalled();
    spy.mockRestore();
    vi.doUnmock("node:readline");
    vi.doUnmock("node:child_process");
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

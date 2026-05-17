import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const hoisted = vi.hoisted(() => {
  const execSyncMock = vi.fn();
  const spawnMock = vi.fn();
  const mkdirSyncMock = vi.fn();
  const homedirMock = vi.fn(() => "/tmp/fake-home");
  const saveTokensMock = vi.fn();
  const validateCookiesMock = vi.fn();

  class FakeWebSocket {
    static OPEN = 1;
    static instances: FakeWebSocket[] = [];
    private listeners: Record<string, Array<(arg: any) => void>> = {};
    readyState = 1;
    sent: any[] = [];
    closed = false;
    constructor(public url: string) {
      FakeWebSocket.instances.push(this);
    }
    on(event: string, cb: (arg: any) => void) {
      (this.listeners[event] ||= []).push(cb);
      return this;
    }
    emit(event: string, arg?: any) {
      for (const cb of this.listeners[event] || []) cb(arg);
    }
    send(data: string) {
      this.sent.push(data);
    }
    close() {
      this.closed = true;
    }
  }

  return {
    execSyncMock,
    spawnMock,
    mkdirSyncMock,
    homedirMock,
    saveTokensMock,
    validateCookiesMock,
    FakeWebSocket,
  };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execSync: hoisted.execSyncMock, spawn: hoisted.spawnMock };
});
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, mkdirSync: hoisted.mkdirSyncMock };
});
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: hoisted.homedirMock };
});
vi.mock("ws", () => ({ default: hoisted.FakeWebSocket }));
vi.mock("../auth.js", () => ({
  saveTokens: hoisted.saveTokensMock,
  validateCookies: hoisted.validateCookiesMock,
}));

import {
  findChrome,
  launchChrome,
  refreshCookiesHeadless,
  runBrowserAuthFlow,
} from "../browser-auth.js";

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

// Helper: build a fake ChildProcess whose stderr immediately emits the
// DevTools "listening on" line so launchChrome's port discovery resolves
// without waiting on a real Chrome.
function fakeChromeProcess(port = 51234) {
  const listeners: Record<string, Array<(arg: any) => void>> = {};
  const stderr = {
    on(event: string, cb: (arg: any) => void) {
      (listeners[event] ||= []).push(cb);
      // Defer the emit one tick so the caller has time to attach listeners.
      if (event === "data") {
        setTimeout(() => {
          cb(Buffer.from(`DevTools listening on ws://127.0.0.1:${port}/devtools/browser/abc\n`));
        }, 0);
      }
      return stderr;
    },
    off() {},
  };
  return {
    stderr,
    unref: vi.fn(),
    kill: vi.fn(),
    on: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.FakeWebSocket.instances.length = 0;
  hoisted.validateCookiesMock.mockReturnValue(true);
  hoisted.execSyncMock.mockImplementation(() => Buffer.from(""));
  hoisted.spawnMock.mockReturnValue(fakeChromeProcess());
  globalThis.fetch = fetchMock as any;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const originalPlatform = process.platform;

function setPlatform(platform: string) {
  Object.defineProperty(process, "platform", { value: platform });
}

afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform });
});

describe("findChrome", () => {
  it.each(["darwin", "linux", "win32"] as const)(
    "returns the first candidate that responds to --version on %s",
    (platform) => {
      setPlatform(platform);
      hoisted.execSyncMock.mockImplementationOnce(() => Buffer.from("Chrome 120"));
      const result = findChrome();
      expect(result).toBeTruthy();
    },
  );

  it("returns null when no candidate works", () => {
    setPlatform("linux");
    hoisted.execSyncMock.mockImplementation(() => {
      throw new Error("not installed");
    });
    expect(findChrome()).toBeNull();
  });
});

describe("launchChrome", () => {
  it("throws when Chrome not found", async () => {
    setPlatform("linux");
    hoisted.execSyncMock.mockImplementation(() => {
      throw new Error("not installed");
    });
    await expect(launchChrome(false)).rejects.toThrow(/Could not find Google Chrome/);
  });

  it("spawns Chrome with port 0 (OS-assigned) + loopback bind + headed", async () => {
    setPlatform("linux");
    hoisted.execSyncMock.mockImplementationOnce(() => Buffer.from("Chrome 120"));
    const { port } = await launchChrome(false);
    expect(hoisted.spawnMock).toHaveBeenCalledOnce();
    const [, args, opts] = hoisted.spawnMock.mock.calls[0];
    expect(args).toContain("--remote-debugging-port=0");
    expect(args).toContain("--remote-debugging-address=127.0.0.1");
    expect(args).not.toContain("--headless=new");
    // stdio must pipe stderr so port discovery can read it.
    expect(opts.stdio).toEqual(["ignore", "ignore", "pipe"]);
    // Port is whatever the fake stderr printed (default 51234).
    expect(port).toBe(51234);
  });

  it("spawns Chrome with --headless=new when requested", async () => {
    setPlatform("linux");
    hoisted.execSyncMock.mockImplementationOnce(() => Buffer.from("Chrome 120"));
    await launchChrome(true);
    const [, args] = hoisted.spawnMock.mock.calls[0];
    expect(args).toContain("--headless=new");
  });

  it("returns different ports across runs (no fixed port collision)", async () => {
    setPlatform("linux");
    hoisted.execSyncMock.mockImplementation(() => Buffer.from("Chrome 120"));
    hoisted.spawnMock.mockReturnValueOnce(fakeChromeProcess(40001));
    hoisted.spawnMock.mockReturnValueOnce(fakeChromeProcess(40002));
    const a = await launchChrome(false);
    const b = await launchChrome(false);
    expect(a.port).not.toBe(b.port);
  });

  it("rejects (and kills child) when Chrome never prints the DevTools URL", async () => {
    setPlatform("linux");
    hoisted.execSyncMock.mockImplementationOnce(() => Buffer.from("Chrome 120"));
    // Stderr that never emits the DevTools line.
    const killSpy = vi.fn();
    const silentStderr = {
      on(_event: string, _cb: (arg: any) => void) {
        return silentStderr;
      },
      off() {},
    };
    hoisted.spawnMock.mockReturnValueOnce({
      stderr: silentStderr,
      unref: vi.fn(),
      kill: killSpy,
      on: vi.fn(),
    });
    // Real timeout is 10s; jump time forward to settle fast.
    vi.useFakeTimers();
    const promise = launchChrome(false);
    vi.advanceTimersByTime(11_000);
    await expect(promise).rejects.toThrow(/Timed out.*DevTools URL/);
    expect(killSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

function mockDebuggerUrl(body?: unknown) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () =>
      body ??
      [
        {
          type: "page",
          url: "https://notebooklm.google.com",
          webSocketDebuggerUrl: "ws://localhost:9229/devtools/page/ABC",
        },
      ],
  });
}

async function waitForInstance() {
  for (let i = 0; i < 20; i++) {
    if (hoisted.FakeWebSocket.instances.length > 0) return hoisted.FakeWebSocket.instances[0];
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("WebSocket never created");
}

describe("runBrowserAuthFlow / refreshCookiesHeadless success paths", () => {
  beforeEach(() => {
    setPlatform("linux");
    hoisted.execSyncMock.mockImplementation(() => Buffer.from("Chrome 120"));
    mockDebuggerUrl();
  });

  it("runBrowserAuthFlow resolves when cookies + page check succeed", async () => {
    const promise = runBrowserAuthFlow();
    const ws = await waitForInstance();
    ws.emit("open");

    // simulate the intervals immediately — skip real setTimeout with fake cookies response
    setTimeout(() => {
      ws.emit("message", Buffer.from(JSON.stringify({
        id: 1,
        result: {
          cookies: [
            { name: "SID", value: "a" },
            { name: "HSID", value: "b" },
          ],
        },
      })));
    }, 10);

    setTimeout(() => {
      ws.emit("message", Buffer.from(JSON.stringify({
        id: 2,
        result: {
          result: {
            value: JSON.stringify({
              href: "https://notebooklm.google.com/notebook/n1",
              csrf: "csrf-x",
              sid: "sid-y",
              bl: "bl-z",
            }),
          },
        },
      })));
    }, 20);

    const tokens = await Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("test-timeout")), 2000)),
    ]);

    expect(tokens).toMatchObject({
      csrf_token: "csrf-x",
      session_id: "sid-y",
      bl: "bl-z",
    });
    expect(hoisted.saveTokensMock).toHaveBeenCalled();
  }, 10000);

  it("refreshCookiesHeadless succeeds with same CDP path", async () => {
    const promise = refreshCookiesHeadless();
    const ws = await waitForInstance();
    ws.emit("open");

    setTimeout(() => {
      ws.emit("message", Buffer.from(JSON.stringify({
        result: { cookies: [{ name: "SID", value: "a" }] },
      })));
    }, 10);

    setTimeout(() => {
      ws.emit("message", Buffer.from(JSON.stringify({
        result: {
          result: {
            value: JSON.stringify({
              href: "https://notebooklm.google.com/",
              csrf: "c",
              sid: "s",
              bl: "bl",
            }),
          },
        },
      })));
    }, 20);

    const tokens = await promise;
    expect(tokens.csrf_token).toBe("c");
  }, 10000);
});

describe("runBrowserAuthFlow error paths", () => {
  beforeEach(() => {
    setPlatform("linux");
    hoisted.execSyncMock.mockImplementation(() => Buffer.from("Chrome 120"));
  });

  it("rejects when the WebSocket closes mid-flow", async () => {
    mockDebuggerUrl();
    const promise = runBrowserAuthFlow();
    const ws = await waitForInstance();
    ws.emit("close");
    await expect(promise).rejects.toThrow(/connection closed|Smart Auth failed/);
  });

  it("rejects when the WebSocket errors", async () => {
    mockDebuggerUrl();
    const promise = runBrowserAuthFlow();
    const ws = await waitForInstance();
    ws.emit("error", new Error("socket-fail"));
    await expect(promise).rejects.toThrow(/Smart Auth failed/);
  });

  it("rejects when getDebuggerUrl never gets a 200 response", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(runBrowserAuthFlow()).rejects.toThrow(/Smart Auth failed/);
  }, 15000);

  it("resets tokens when current page is still the Google chooser", async () => {
    mockDebuggerUrl();
    const promise = runBrowserAuthFlow();
    const ws = await waitForInstance();
    ws.emit("open");

    // cookies ok
    setTimeout(() => {
      ws.emit("message", Buffer.from(JSON.stringify({
        result: { cookies: [{ name: "SID", value: "a" }] },
      })));
    }, 10);

    // first evaluate: on accounts chooser — should NOT resolve
    setTimeout(() => {
      ws.emit("message", Buffer.from(JSON.stringify({
        result: {
          result: {
            value: JSON.stringify({
              href: "https://accounts.google.com/chooser",
              csrf: null,
              sid: null,
            }),
          },
        },
      })));
    }, 20);

    // cookies ok again
    setTimeout(() => {
      ws.emit("message", Buffer.from(JSON.stringify({
        result: { cookies: [{ name: "SID", value: "a" }] },
      })));
    }, 30);

    // page now NotebookLM
    setTimeout(() => {
      ws.emit("message", Buffer.from(JSON.stringify({
        result: {
          result: {
            value: JSON.stringify({
              href: "https://notebooklm.google.com/",
              csrf: "c",
              sid: "s",
              bl: "",
            }),
          },
        },
      })));
    }, 40);

    const tokens = await promise;
    expect(tokens.session_id).toBe("s");
  }, 10000);

  it("ignores incomplete cookie sets (validateCookies=false)", async () => {
    hoisted.validateCookiesMock.mockReturnValueOnce(false).mockReturnValue(true);
    mockDebuggerUrl();
    const promise = runBrowserAuthFlow();
    const ws = await waitForInstance();
    ws.emit("open");

    setTimeout(() => {
      ws.emit("message", Buffer.from(JSON.stringify({
        result: { cookies: [{ name: "SID", value: "partial" }] },
      })));
    }, 10);
    setTimeout(() => {
      ws.emit("message", Buffer.from(JSON.stringify({
        result: { cookies: [{ name: "SID", value: "a" }] },
      })));
    }, 20);
    setTimeout(() => {
      ws.emit("message", Buffer.from(JSON.stringify({
        result: {
          result: {
            value: JSON.stringify({
              href: "https://notebooklm.google.com/",
              csrf: "c", sid: "s", bl: "",
            }),
          },
        },
      })));
    }, 30);

    const tokens = await promise;
    expect(tokens.csrf_token).toBe("c");
  }, 10000);

  it("tolerates malformed CDP messages", async () => {
    mockDebuggerUrl();
    const promise = runBrowserAuthFlow();
    const ws = await waitForInstance();
    ws.emit("open");

    setTimeout(() => ws.emit("message", Buffer.from("not-json")), 10);
    setTimeout(() => ws.emit("message", Buffer.from(JSON.stringify({ error: { message: "foo" } }))), 15);
    setTimeout(() => {
      ws.emit("message", Buffer.from(JSON.stringify({
        result: { cookies: [{ name: "SID", value: "a" }] },
      })));
    }, 20);
    setTimeout(() => {
      ws.emit("message", Buffer.from(JSON.stringify({
        result: { result: { value: JSON.stringify({ href: "https://notebooklm.google.com/", csrf: "c", sid: "s", bl: "" }) } },
      })));
    }, 30);

    await expect(promise).resolves.toBeDefined();
  }, 10000);
});

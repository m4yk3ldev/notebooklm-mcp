import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const hoisted = vi.hoisted(() => {
  const execSyncMock = vi.fn();
  const spawnMock = vi.fn();
  const mkdirSyncMock = vi.fn();
  const existsSyncMock = vi.fn();
  const readlinkSyncMock = vi.fn();
  const rmSyncMock = vi.fn();
  const readFileSyncMock = vi.fn();
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
    existsSyncMock,
    readlinkSyncMock,
    rmSyncMock,
    readFileSyncMock,
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
  return {
    ...actual,
    mkdirSync: hoisted.mkdirSyncMock,
    existsSync: hoisted.existsSyncMock,
    readlinkSync: hoisted.readlinkSyncMock,
    rmSync: hoisted.rmSyncMock,
    readFileSync: hoisted.readFileSyncMock,
  };
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
  releaseProfile,
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
  // releaseProfile fs defaults: no leftover lock → no kill, rmSync is a no-op.
  hoisted.existsSyncMock.mockReturnValue(false);
  hoisted.readlinkSyncMock.mockReturnValue("");
  hoisted.rmSyncMock.mockImplementation(() => {});
  hoisted.readFileSyncMock.mockReturnValue("");
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

  it("returns null on platforms with no candidate list (e.g. freebsd)", () => {
    setPlatform("freebsd");
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

  it("discoverDevtoolsPort accumulates partial stderr before the DevTools line", async () => {
    setPlatform("linux");
    hoisted.execSyncMock.mockImplementationOnce(() => Buffer.from("Chrome 120"));
    // stderr emits a few unrelated lines before the DevTools listening line.
    // This exercises the `if (m)` false branch where `re.exec(buf)` returns null.
    const callbacks: Array<(arg: any) => void> = [];
    const stderr: any = {
      on(event: string, cb: (arg: any) => void) {
        if (event === "data") {
          callbacks.push(cb);
          setTimeout(() => cb(Buffer.from("[INFO] starting up\n")), 0);
          setTimeout(() => cb(Buffer.from("[INFO] loading profile\n")), 5);
          setTimeout(() => cb(Buffer.from("DevTools listening on ws://127.0.0.1:55555/devtools/browser/x\n")), 10);
        }
        return stderr;
      },
      off() {},
    };
    hoisted.spawnMock.mockReturnValueOnce({
      stderr,
      unref: vi.fn(),
      kill: vi.fn(),
      on: vi.fn(),
    });
    const { port } = await launchChrome(false);
    expect(port).toBe(55555);
  });

  it("rejects (and kills child) when Chrome spawns without stderr", async () => {
    setPlatform("linux");
    hoisted.execSyncMock.mockImplementationOnce(() => Buffer.from("Chrome 120"));
    const killSpy = vi.fn();
    hoisted.spawnMock.mockReturnValueOnce({
      stderr: null,
      unref: vi.fn(),
      kill: killSpy,
      on: vi.fn(),
    });
    await expect(launchChrome(false)).rejects.toThrow(
      /Chrome process did not expose stderr/,
    );
    expect(killSpy).toHaveBeenCalled();
  });
});

describe("releaseProfile", () => {
  const DIR = "/tmp/fake-home/.notebooklm-mcp/chrome-profile";

  it("kills the Chrome named in SingletonLock and removes lock files (linux)", () => {
    setPlatform("linux");
    hoisted.existsSyncMock.mockReturnValue(true);
    hoisted.readlinkSyncMock.mockReturnValue("host-96665");
    hoisted.readFileSyncMock.mockReturnValue("/opt/google/chrome/chrome\0--foo");
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    releaseProfile(DIR);

    expect(killSpy).toHaveBeenCalledWith(96665, "SIGKILL");
    // All four singleton / port files are removed.
    expect(hoisted.rmSyncMock).toHaveBeenCalledTimes(4);
    killSpy.mockRestore();
  });

  it("assumes Chrome on non-linux platforms (no /proc inspection)", () => {
    setPlatform("darwin");
    hoisted.existsSyncMock.mockReturnValue(true);
    hoisted.readlinkSyncMock.mockReturnValue("host-4321");
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    releaseProfile(DIR);

    expect(killSpy).toHaveBeenCalledWith(4321, "SIGKILL");
    killSpy.mockRestore();
  });

  it("does not kill when the locked pid is not a Chrome process (linux)", () => {
    setPlatform("linux");
    hoisted.existsSyncMock.mockReturnValue(true);
    hoisted.readlinkSyncMock.mockReturnValue("host-777");
    // /proc read fails → isChromeProcess false.
    hoisted.readFileSyncMock.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    releaseProfile(DIR);

    expect(killSpy).not.toHaveBeenCalled();
    killSpy.mockRestore();
  });

  it("does not kill when the lock target has no numeric pid", () => {
    setPlatform("linux");
    hoisted.existsSyncMock.mockReturnValue(true);
    hoisted.readlinkSyncMock.mockReturnValue("garbage-target");
    hoisted.readFileSyncMock.mockReturnValue("chrome");
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    releaseProfile(DIR);

    expect(killSpy).not.toHaveBeenCalled();
    killSpy.mockRestore();
  });

  it("skips the kill path entirely when no SingletonLock exists", () => {
    hoisted.existsSyncMock.mockReturnValue(false);
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    releaseProfile(DIR);

    expect(killSpy).not.toHaveBeenCalled();
    expect(hoisted.rmSyncMock).toHaveBeenCalledTimes(4);
    killSpy.mockRestore();
  });

  it("tolerates process.kill throwing (process already gone)", () => {
    setPlatform("linux");
    hoisted.existsSyncMock.mockReturnValue(true);
    hoisted.readlinkSyncMock.mockReturnValue("host-555");
    hoisted.readFileSyncMock.mockReturnValue("chromium");
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
      throw new Error("ESRCH");
    });

    expect(() => releaseProfile(DIR)).not.toThrow();
    expect(hoisted.rmSyncMock).toHaveBeenCalledTimes(4);
    killSpy.mockRestore();
  });

  it("tolerates readlinkSync throwing and still removes files", () => {
    hoisted.existsSyncMock.mockReturnValue(true);
    hoisted.readlinkSyncMock.mockImplementation(() => {
      throw new Error("EINVAL");
    });

    expect(() => releaseProfile(DIR)).not.toThrow();
    expect(hoisted.rmSyncMock).toHaveBeenCalledTimes(4);
  });

  it("ignores rmSync failures", () => {
    hoisted.existsSyncMock.mockReturnValue(false);
    hoisted.rmSyncMock.mockImplementation(() => {
      throw new Error("EBUSY");
    });

    expect(() => releaseProfile(DIR)).not.toThrow();
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

  it("logs the wrong-page href when NOTEBOOKLM_DEBUG is set", async () => {
    mockDebuggerUrl();
    const prev = process.env.NOTEBOOKLM_DEBUG;
    process.env.NOTEBOOKLM_DEBUG = "1";
    const writeSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      const promise = runBrowserAuthFlow();
      const ws = await waitForInstance();
      ws.emit("open");
      setTimeout(() => {
        ws.emit("message", Buffer.from(JSON.stringify({
          result: { cookies: [{ name: "SID", value: "a" }] },
        })));
      }, 10);
      // On the Google chooser → debug line should fire.
      setTimeout(() => {
        ws.emit("message", Buffer.from(JSON.stringify({
          result: { result: { value: JSON.stringify({ href: "https://accounts.google.com/chooser" }) } },
        })));
      }, 20);
      // Then land on NotebookLM so the flow settles.
      setTimeout(() => {
        ws.emit("message", Buffer.from(JSON.stringify({
          result: { cookies: [{ name: "SID", value: "a" }] },
        })));
      }, 30);
      setTimeout(() => {
        ws.emit("message", Buffer.from(JSON.stringify({
          result: { result: { value: JSON.stringify({ href: "https://notebooklm.google.com/", csrf: "c", sid: "s", bl: "" }) } },
        })));
      }, 40);
      await promise;
      expect(
        writeSpy.mock.calls.some(([m]) => String(m).includes("[debug] href=https://accounts.google.com/chooser")),
      ).toBe(true);
    } finally {
      writeSpy.mockRestore();
      if (prev === undefined) delete process.env.NOTEBOOKLM_DEBUG;
      else process.env.NOTEBOOKLM_DEBUG = prev;
    }
  }, 10000);

  it("getDebuggerUrl retries when /json/list returns non-OK", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => [] })
      .mockResolvedValue({
        ok: true,
        json: async () => [
          { type: "page", url: "https://notebooklm.google.com", webSocketDebuggerUrl: "ws://retry" },
        ],
      });
    const promise = runBrowserAuthFlow();
    const ws = await waitForInstance();
    expect(ws.url).toBe("ws://retry");
    // Drive to settlement so the promise doesn't hang.
    ws.emit("open");
    setTimeout(() => {
      ws.emit("message", Buffer.from(JSON.stringify({
        result: { cookies: [{ name: "SID", value: "a" }] },
      })));
    }, 10);
    setTimeout(() => {
      ws.emit("message", Buffer.from(JSON.stringify({
        result: { result: { value: JSON.stringify({ href: "https://notebooklm.google.com/", csrf: "c", sid: "s", bl: "" }) } },
      })));
    }, 20);
    await expect(promise).resolves.toBeDefined();
  }, 10000);

  it("getDebuggerUrl retries when /json/list returns a non-array body", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ unexpected: "shape" }) })
      .mockResolvedValue({
        ok: true,
        json: async () => [
          { type: "page", url: "https://notebooklm.google.com", webSocketDebuggerUrl: "ws://recovered" },
        ],
      });
    const promise = runBrowserAuthFlow();
    const ws = await waitForInstance();
    expect(ws.url).toBe("ws://recovered");
    ws.emit("open");
    setTimeout(() => {
      ws.emit("message", Buffer.from(JSON.stringify({
        result: { cookies: [{ name: "SID", value: "a" }] },
      })));
    }, 10);
    setTimeout(() => {
      ws.emit("message", Buffer.from(JSON.stringify({
        result: { result: { value: JSON.stringify({ href: "https://notebooklm.google.com/", csrf: "c", sid: "s", bl: "" }) } },
      })));
    }, 20);
    await expect(promise).resolves.toBeDefined();
  }, 10000);

  it("getDebuggerUrl retries when no page-typed tab is present", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          // Type 'background_page' — neither the notebookTab nor firstPage finders match.
          { type: "background_page", url: "https://example.com", webSocketDebuggerUrl: "ws://bg" },
        ],
      })
      .mockResolvedValue({
        ok: true,
        json: async () => [
          { type: "page", url: "https://notebooklm.google.com", webSocketDebuggerUrl: "ws://eventual" },
        ],
      });
    const promise = runBrowserAuthFlow();
    const ws = await waitForInstance();
    expect(ws.url).toBe("ws://eventual");
    ws.emit("open");
    setTimeout(() => {
      ws.emit("message", Buffer.from(JSON.stringify({
        result: { cookies: [{ name: "SID", value: "a" }] },
      })));
    }, 10);
    setTimeout(() => {
      ws.emit("message", Buffer.from(JSON.stringify({
        result: { result: { value: JSON.stringify({ href: "https://notebooklm.google.com/", csrf: "c", sid: "s", bl: "" }) } },
      })));
    }, 20);
    await expect(promise).resolves.toBeDefined();
  }, 10000);

  it("getDebuggerUrl falls back to first page tab when no NotebookLM tab present", async () => {
    // Simulate /json/list returning a tab that is NOT on the NotebookLM origin.
    // The implementation should still pick it up via the firstPage fallback.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          type: "page",
          url: "https://example.com/",
          webSocketDebuggerUrl: "ws://localhost:9229/devtools/page/FALLBACK",
        },
      ],
    });
    const promise = runBrowserAuthFlow();
    const ws = await waitForInstance();
    expect(ws.url).toContain("FALLBACK");
    // Drive the flow to completion so the promise settles cleanly.
    ws.emit("open");
    setTimeout(() => {
      ws.emit("message", Buffer.from(JSON.stringify({
        result: { cookies: [{ name: "SID", value: "a" }] },
      })));
    }, 10);
    setTimeout(() => {
      ws.emit("message", Buffer.from(JSON.stringify({
        result: { result: { value: JSON.stringify({ href: "https://notebooklm.google.com/", csrf: "c", sid: "s", bl: "" }) } },
      })));
    }, 20);
    await expect(promise).resolves.toBeDefined();
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

  it("falls back to JSON.stringify when CDP error has no message property", async () => {
    mockDebuggerUrl();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const promise = runBrowserAuthFlow();
    const ws = await waitForInstance();
    // Error has no `.message` field — the `|| JSON.stringify(...)` fallback should fire.
    ws.emit("message", Buffer.from(JSON.stringify({ error: { code: -32601 } })));
    vi.advanceTimersByTime(125_000);
    await expect(promise).rejects.toThrow(/CDP error: \{"code":-32601\}/);
    vi.useRealTimers();
  }, 10000);

  it("send() no-ops when WebSocket is not in OPEN state (readyState != 1)", async () => {
    mockDebuggerUrl();
    const promise = runBrowserAuthFlow();
    const ws = await waitForInstance();
    // Flip the WS into CONNECTING before "open" fires; send() should
    // silently skip the JSON write.
    ws.readyState = 0;
    ws.emit("open");
    // Then unblock by going OPEN and providing complete tokens.
    ws.readyState = 1;
    setTimeout(() => {
      ws.emit("message", Buffer.from(JSON.stringify({
        result: { cookies: [{ name: "SID", value: "a" }] },
      })));
    }, 10);
    setTimeout(() => {
      ws.emit("message", Buffer.from(JSON.stringify({
        result: { result: { value: JSON.stringify({ href: "https://notebooklm.google.com/", csrf: "c", sid: "s", bl: "" }) } },
      })));
    }, 20);
    await expect(promise).resolves.toBeDefined();
    // At least one send was attempted while CONNECTING — verify it was skipped.
    expect(ws.sent.find((m: string) => m.includes("Runtime.enable"))).toBeUndefined();
  }, 10000);

  it("defaults csrf/sid to '' when the page evaluate result omits them", async () => {
    mockDebuggerUrl();
    const promise = runBrowserAuthFlow();
    const ws = await waitForInstance();
    ws.emit("open");
    setTimeout(() => {
      ws.emit("message", Buffer.from(JSON.stringify({
        result: { cookies: [{ name: "SID", value: "a" }] },
      })));
    }, 10);
    setTimeout(() => {
      // Evaluate result returns href (on NotebookLM) but no csrf / sid fields.
      ws.emit("message", Buffer.from(JSON.stringify({
        result: { result: { value: JSON.stringify({ href: "https://notebooklm.google.com/" }) } },
      })));
    }, 20);
    const tokens = await promise;
    expect(tokens.csrf_token).toBe("");
    expect(tokens.session_id).toBe("");
  }, 10000);

  it("global CDP timeout rejects with the configured timeout message", async () => {
    mockDebuggerUrl();
    // Use fake timers so we can fast-forward past the 120s global timeout
    // without actually waiting in real time. WebSocket "open" never fires
    // → no progress → timer fires the rejection path.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const promise = runBrowserAuthFlow();
    await waitForInstance();
    vi.advanceTimersByTime(125_000);
    await expect(promise).rejects.toThrow(/timed out after/i);
    vi.useRealTimers();
  }, 10000);

  it("includes last CDP error in the timeout message when one was recorded", async () => {
    mockDebuggerUrl();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const promise = runBrowserAuthFlow();
    const ws = await waitForInstance();
    // Surface a CDP-level error reply (no cookies returned).
    ws.emit("message", Buffer.from(JSON.stringify({ error: { message: "perm-denied" } })));
    vi.advanceTimersByTime(125_000);
    await expect(promise).rejects.toThrow(/CDP error: perm-denied/);
    vi.useRealTimers();
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

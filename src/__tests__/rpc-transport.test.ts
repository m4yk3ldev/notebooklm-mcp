import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

vi.mock("../browser-auth.js", () => ({
  refreshCookiesHeadless: vi.fn(),
  runBrowserAuthFlow: vi.fn(),
}));

vi.mock("../auth.js", () => ({
  buildCookieHeader: (c: Record<string, string>) =>
    Object.entries(c).map(([k, v]) => `${k}=${v}`).join("; "),
  extractCsrfFromPage: vi.fn(() => "csrf"),
  extractSessionIdFromPage: vi.fn(() => "sid"),
  saveTokens: vi.fn(),
  loadTokensFromCache: vi.fn(() => null),
}));

import { RpcTransport } from "../rpc/transport.js";
import {
  BASE_URL,
  BATCHEXECUTE_PATH,
  QUERY_PATH,
  RPC_IDS,
} from "../constants.js";

const server = setupServer();
beforeEach(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());

function encodeBatchexecute(rpcId: string, payload: unknown) {
  const bundle = [
    "wrb.fr",
    rpcId,
    payload === undefined ? null : JSON.stringify(payload),
    null,
    null,
    null,
    "generic",
  ];
  const json = JSON.stringify([bundle]);
  return `)]}'\n\n${json.length}\n${json}`;
}

/**
 * Fake AuthState satisfying the structural interface that RpcTransport
 * actually touches (tokens.bl, csrfToken, sessionId, cookies, recordSetCookies).
 */
function fakeAuth() {
  return {
    tokens: {
      cookies: { SID: "a", HSID: "b", SSID: "c", APISID: "d", SAPISID: "e" },
      csrf_token: "csrf-1",
      session_id: "sid-1",
      extracted_at: 1700000000,
      bl: "test-bl",
    },
    csrfToken: "csrf-1",
    sessionId: "sid-1",
    cookies: { SID: "a", HSID: "b", SSID: "c", APISID: "d", SAPISID: "e" },
    recordedSetCookies: [] as string[][],
    recordSetCookies(lines: readonly string[]) {
      this.recordedSetCookies.push([...lines]);
    },
  };
}

describe("RpcTransport URL/body builders edge cases", () => {
  it("buildRequestBody omits at= when csrfToken empty", async () => {
    let capturedBody = "";
    server.use(
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, async ({ request }) => {
        capturedBody = await request.text();
        return HttpResponse.text(encodeBatchexecute(RPC_IDS.LIST_NOTEBOOKS, [[]]));
      }),
    );
    const auth = fakeAuth();
    auth.csrfToken = "";
    auth.sessionId = "";
    const t = new RpcTransport(auth as any, 30_000);
    await t.callBatchexecute(RPC_IDS.LIST_NOTEBOOKS, []);
    expect(capturedBody.startsWith("f.req=")).toBe(true);
    expect(capturedBody).not.toContain("at=");
    expect(capturedBody).not.toContain("f.sid=");
  });

  it("buildUrl omits f.sid when AuthState has no sessionId", async () => {
    let capturedUrl = "";
    server.use(
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, async ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.text(encodeBatchexecute(RPC_IDS.LIST_NOTEBOOKS, [[]]));
      }),
    );
    const auth = fakeAuth();
    auth.sessionId = "";
    const t = new RpcTransport(auth as any, 30_000);
    await t.callBatchexecute(RPC_IDS.LIST_NOTEBOOKS, []);
    expect(capturedUrl).not.toContain("f.sid=");
  });

  it("buildUrl falls back to NOTEBOOKLM_BL env when tokens.bl missing", async () => {
    const oldBl = process.env.NOTEBOOKLM_BL;
    process.env.NOTEBOOKLM_BL = "env-bl-value";
    try {
      let capturedUrl = "";
      server.use(
        http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, async ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.text(encodeBatchexecute(RPC_IDS.LIST_NOTEBOOKS, [[]]));
        }),
      );
      const auth = fakeAuth();
      auth.tokens.bl = "";
      const t = new RpcTransport(auth as any, 30_000);
      await t.callBatchexecute(RPC_IDS.LIST_NOTEBOOKS, []);
      expect(capturedUrl).toContain("bl=env-bl-value");
    } finally {
      if (oldBl === undefined) delete process.env.NOTEBOOKLM_BL;
      else process.env.NOTEBOOKLM_BL = oldBl;
    }
  });

  it("buildUrl falls back to DEFAULT_BL when both tokens.bl and env are unset", async () => {
    const oldBl = process.env.NOTEBOOKLM_BL;
    delete process.env.NOTEBOOKLM_BL;
    try {
      let capturedUrl = "";
      server.use(
        http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, async ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.text(encodeBatchexecute(RPC_IDS.LIST_NOTEBOOKS, [[]]));
        }),
      );
      const auth = fakeAuth();
      auth.tokens.bl = "";
      const t = new RpcTransport(auth as any, 30_000);
      await t.callBatchexecute(RPC_IDS.LIST_NOTEBOOKS, []);
      // Just need to verify a bl= param was emitted; the actual default is in
      // constants and is not under test here.
      expect(capturedUrl).toMatch(/bl=[^&]+/);
    } finally {
      if (oldBl !== undefined) process.env.NOTEBOOKLM_BL = oldBl;
    }
  });
});

describe("RpcTransport.callBatchexecute", () => {
  it("returns parsed envelopes on a happy-path 200 response", async () => {
    server.use(
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, () =>
        HttpResponse.text(encodeBatchexecute(RPC_IDS.LIST_NOTEBOOKS, [[]])),
      ),
    );
    const auth = fakeAuth();
    const t = new RpcTransport(auth as any, 30_000);

    const parsed = await t.callBatchexecute(RPC_IDS.LIST_NOTEBOOKS, [null, 10]);

    expect(parsed).toHaveLength(1);
    const chunk = parsed[0] as unknown[];
    expect(Array.isArray(chunk)).toBe(true);
    const tuple = (chunk[0] as unknown[]);
    expect(tuple[0]).toBe("wrb.fr");
    expect(tuple[1]).toBe(RPC_IDS.LIST_NOTEBOOKS);
  });

  it("throws on non-2xx HTTP", async () => {
    server.use(
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, () =>
        new HttpResponse(null, { status: 503, statusText: "Service Unavailable" }),
      ),
    );
    const auth = fakeAuth();
    const t = new RpcTransport(auth as any, 30_000);

    await expect(t.callBatchexecute(RPC_IDS.LIST_NOTEBOOKS, [])).rejects.toThrow(
      /HTTP 503/,
    );
  });

  it("merges Set-Cookie response headers into the auth state", async () => {
    server.use(
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, () =>
        HttpResponse.text(
          encodeBatchexecute(RPC_IDS.LIST_NOTEBOOKS, [[]]),
          { headers: { "Set-Cookie": "NEW=v1; Path=/" } },
        ),
      ),
    );
    const auth = fakeAuth();
    const t = new RpcTransport(auth as any, 30_000);

    await t.callBatchexecute(RPC_IDS.LIST_NOTEBOOKS, []);

    expect(auth.recordedSetCookies.length).toBeGreaterThan(0);
    expect(auth.recordedSetCookies[0].join(" ")).toMatch(/NEW=v1/);
  });
});

describe("RpcTransport.callQuery", () => {
  it("omits f.sid when AuthState has no sessionId", async () => {
    let capturedUrl = "";
    server.use(
      http.post(`${BASE_URL}${QUERY_PATH}`, async ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.text(encodeBatchexecute("q", "ok"));
      }),
    );
    const auth = fakeAuth();
    auth.sessionId = "";
    auth.csrfToken = "";
    const t = new RpcTransport(auth as any, 30_000);
    await t.callQuery("nb", "f.req=x");
    expect(capturedUrl).not.toContain("f.sid=");
  });

  it("POSTs to QUERY_PATH and returns parsed envelopes", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    server.use(
      http.post(`${BASE_URL}${QUERY_PATH}`, async ({ request }) => {
        capturedUrl = request.url;
        capturedBody = await request.text();
        return HttpResponse.text(encodeBatchexecute("query", "ok"));
      }),
    );
    const auth = fakeAuth();
    const t = new RpcTransport(auth as any, 30_000);

    const parsed = await t.callQuery("nbid", "f.req=raw", 30_000);

    expect(capturedUrl).toContain(QUERY_PATH);
    expect(capturedBody).toBe("f.req=raw");
    expect(parsed).toHaveLength(1);
  });

  it("throws on non-2xx HTTP", async () => {
    server.use(
      http.post(`${BASE_URL}${QUERY_PATH}`, () =>
        new HttpResponse(null, { status: 502, statusText: "Bad Gateway" }),
      ),
    );
    const auth = fakeAuth();
    const t = new RpcTransport(auth as any, 30_000);

    await expect(t.callQuery("nbid", "f.req=raw")).rejects.toThrow(/HTTP 502/);
  });
});

describe("RpcTransport request-level abort timer", () => {
  it("callBatchexecute aborts the underlying fetch when the timeout fires", async () => {
    server.use(
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, async () => {
        // Never respond; the per-request timer should fire AbortController.
        await new Promise((r) => setTimeout(r, 500));
        return HttpResponse.text("never");
      }),
    );
    const auth = fakeAuth();
    const t = new RpcTransport(auth as any, 30_000);
    await expect(
      t.callBatchexecute(RPC_IDS.LIST_NOTEBOOKS, [], "/", 5),
    ).rejects.toThrow();
  });

  it("callQuery aborts the underlying fetch when the timeout fires", async () => {
    server.use(
      http.post(`${BASE_URL}${QUERY_PATH}`, async () => {
        await new Promise((r) => setTimeout(r, 1000));
        return HttpResponse.text("never");
      }),
    );
    const auth = fakeAuth();
    const t = new RpcTransport(auth as any, 30_000);
    // Pass an explicit short per-call timeout via the public signature
    // (callQuery accepts a third arg).
    await expect(t.callQuery("nb", "f.req=x", 5)).rejects.toThrow();
  });
});

describe("RpcTransport.fetchLandingHtml", () => {
  it("returns the body string from the landing GET", async () => {
    server.use(
      http.get(`${BASE_URL}/`, () =>
        HttpResponse.text("<html><body>land</body></html>"),
      ),
    );
    const auth = fakeAuth();
    const t = new RpcTransport(auth as any, 30_000);

    const html = await t.fetchLandingHtml();
    expect(html).toContain("<body>land</body>");
  });

  it("aborts the landing GET when the per-call timeout fires", async () => {
    server.use(
      http.get(`${BASE_URL}/`, async () => {
        await new Promise((r) => setTimeout(r, 1000));
        return HttpResponse.text("late");
      }),
    );
    const auth = fakeAuth();
    const t = new RpcTransport(auth as any, 30_000);
    await expect(t.fetchLandingHtml(5)).rejects.toThrow();
  });
});

describe("RpcTransport.readBodyWithAbort", () => {
  it("rejects synchronously when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fakeResponse = {
      text: () => Promise.resolve("never-read"),
    } as unknown as Response;

    await expect(
      RpcTransport.readBodyWithAbort(fakeResponse, controller.signal),
    ).rejects.toThrow(/Aborted before body read/);
  });

  it("rejects when the signal fires before body resolves", async () => {
    const controller = new AbortController();
    const fakeResponse = {
      text: () => new Promise<string>((resolve) => setTimeout(() => resolve("late"), 50)),
    } as unknown as Response;

    setTimeout(() => controller.abort(), 5);

    await expect(
      RpcTransport.readBodyWithAbort(fakeResponse, controller.signal),
    ).rejects.toThrow(/aborted/i);
  });

  it("propagates response.text() rejection (network error mid-stream)", async () => {
    const controller = new AbortController();
    const fakeResponse = {
      text: () => Promise.reject(new Error("stream-broken")),
    } as unknown as Response;

    await expect(
      RpcTransport.readBodyWithAbort(fakeResponse, controller.signal),
    ).rejects.toThrow(/stream-broken/);
  });

  it("resolves normally when the signal does not fire", async () => {
    const controller = new AbortController();
    const fakeResponse = {
      text: () => Promise.resolve("happy"),
    } as unknown as Response;

    const out = await RpcTransport.readBodyWithAbort(fakeResponse, controller.signal);
    expect(out).toBe("happy");
  });

  it("ignores late abort after body already resolved (settled=true)", async () => {
    // text() resolves first; aborting afterwards must not double-settle.
    const controller = new AbortController();
    let abortLater!: () => void;
    const fakeResponse = {
      text: () =>
        new Promise<string>((resolve) => {
          setTimeout(() => {
            resolve("first");
            // Abort AFTER resolution so onAbort fires but settled=true short-circuits.
            abortLater = () => controller.abort();
          }, 5);
        }),
    } as unknown as Response;

    const result = await RpcTransport.readBodyWithAbort(
      fakeResponse,
      controller.signal,
    );
    expect(result).toBe("first");
    // Firing the abort post-settle must not throw or change anything.
    expect(() => abortLater()).not.toThrow();
  });

  it("ignores late text rejection after abort already settled", async () => {
    // abort fires first; text() rejects later — second settle is a no-op.
    const controller = new AbortController();
    let rejectText!: (err: Error) => void;
    const fakeResponse = {
      text: () => new Promise<string>((_resolve, reject) => {
        rejectText = reject;
      }),
    } as unknown as Response;

    setTimeout(() => controller.abort(), 5);

    const promise = RpcTransport.readBodyWithAbort(
      fakeResponse,
      controller.signal,
    );
    await expect(promise).rejects.toThrow(/aborted/i);
    // Reject the still-pending text() — handler must not double-settle.
    expect(() => rejectText(new Error("too-late"))).not.toThrow();
  });

  it("ignores late text resolution after abort already settled", async () => {
    // abort fires first; text() resolves later — second settle is a no-op.
    const controller = new AbortController();
    let resolveText!: (v: string) => void;
    const fakeResponse = {
      text: () => new Promise<string>((resolve) => {
        resolveText = resolve;
      }),
    } as unknown as Response;

    setTimeout(() => controller.abort(), 5);

    const promise = RpcTransport.readBodyWithAbort(
      fakeResponse,
      controller.signal,
    );
    await expect(promise).rejects.toThrow(/aborted/i);
    expect(() => resolveText("too-late")).not.toThrow();
  });
});

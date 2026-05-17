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
});

describe("RpcTransport.readBodyWithAbort", () => {
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

  it("resolves normally when the signal does not fire", async () => {
    const controller = new AbortController();
    const fakeResponse = {
      text: () => Promise.resolve("happy"),
    } as unknown as Response;

    const out = await RpcTransport.readBodyWithAbort(fakeResponse, controller.signal);
    expect(out).toBe("happy");
  });
});

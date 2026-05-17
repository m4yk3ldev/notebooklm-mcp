import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { NotebookLMClient } from "../client.js";
import { BASE_URL, BATCHEXECUTE_PATH, QUERY_PATH, RPC_IDS } from "../constants.js";

// Mock browser-auth.ts
vi.mock("../browser-auth.js", () => ({
  refreshCookiesHeadless: vi.fn(),
  runBrowserAuthFlow: vi.fn(),
}));

// Mock auth.js
vi.mock("../auth.js", () => ({
  buildCookieHeader: vi.fn((cookies) => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ")),
  extractCsrfFromPage: vi.fn(() => "mock-csrf"),
  extractSessionIdFromPage: vi.fn(() => "mock-sid"),
  saveTokens: vi.fn(),
}));

import { refreshCookiesHeadless } from "../browser-auth.js";

const server = setupServer();

describe("NotebookLMClient", () => {
  beforeEach(() => {
    server.listen();
    vi.clearAllMocks();
  });

  afterEach(() => {
    server.resetHandlers();
  });
  
  afterAll(() => server.close());

  const mockTokens = {
    cookies: { SID: "valid-sid" },
    csrf_token: "old-csrf",
    session_id: "old-sid",
    extracted_at: Date.now() / 1000,
  };

  it("should list notebooks successfully", async () => {
    const mockBundle = [
      "wrb.fr",
      RPC_IDS.LIST_NOTEBOOKS,
      JSON.stringify([[["Notebook 1", [], "nb-id-1", null, null, [1, false, 8, null, null, null, null, null, [1740520000], null, null, [1740520000]]]]]),
      null, null, null, "generic"
    ];

    server.use(
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, () => {
        const json = JSON.stringify([mockBundle]);
        return HttpResponse.text(`)]}'\n\n${json.length}\n${json}`);
      })
    );

    const client = new NotebookLMClient(mockTokens);
    const notebooks = await client.listNotebooks();
    expect(notebooks).toHaveLength(1);
    expect(notebooks[0].title).toBe("Notebook 1");
  });

  it("should handle session expiration and retry in execute", async () => {
    let callCount = 0;

    server.use(
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, ({ request }) => {
        const url = new URL(request.url);
        const rpcId = url.searchParams.get("rpcids");

        if (rpcId === RPC_IDS.LIST_NOTEBOOKS) {
          callCount++;
          if (callCount <= 2) {
            const authErrorBundle = ["wrb.fr", RPC_IDS.LIST_NOTEBOOKS, null, null, null, [16], "generic"];
            const json = JSON.stringify([authErrorBundle]);
            return HttpResponse.text(`)]}'\n\n${json.length}\n${json}`);
          }

          const successBundle = [
            "wrb.fr",
            RPC_IDS.LIST_NOTEBOOKS,
            JSON.stringify([[["Notebook 1", [], "nb-id-1", null, null, [1, false, 8, null, null, null, null, null, [1740520000], null, null, [1740520000]]]]]),
            null, null, null, "generic"
          ];
          const json = JSON.stringify([successBundle]);
          return HttpResponse.text(`)]}'\n\n${json.length}\n${json}`);
        }

        if (rpcId === RPC_IDS.SETTINGS) {
          const successBundle = ["wrb.fr", RPC_IDS.SETTINGS, JSON.stringify([null, 1]), null, null, null, "generic"];
          const json = JSON.stringify([successBundle]);
          return HttpResponse.text(`)]}'\n\n${json.length}\n${json}`);
        }

        return HttpResponse.text("<html>CSRF</html>");
      }),
      http.get(`${BASE_URL}`, () => {
        return HttpResponse.text(`<html>CSRF</html>`);
      })
    );

    (refreshCookiesHeadless as any).mockResolvedValue({
      cookies: { SID: "new-sid" },
      csrf_token: "new-csrf",
      session_id: "new-sid",
      extracted_at: Date.now() / 1000,
    });

    const client = new NotebookLMClient(mockTokens);
    const notebooks = await client.listNotebooks();

    expect(notebooks).toHaveLength(1);
    expect(refreshCookiesHeadless).toHaveBeenCalled();
  });

  it("should handle session expiration and retry in query", async () => {
    let callCount = 0;

    server.use(
      http.post(`${BASE_URL}${QUERY_PATH}`, () => {
        callCount++;
        if (callCount <= 2) {
          const authErrorBundle = ["wrb.fr", "rpc-query", null, null, null, [16], "generic"];
          const json = JSON.stringify([authErrorBundle]);
          return HttpResponse.text(`)]}'\n\n${json.length}\n${json}`);
        }

        const successBundle = [
          "wrb.fr",
          "rpc-query",
          JSON.stringify([["This is the answer", null, 1, null, null, null, null, null, null, null, "conv-123"]]),
          null, null, null, "generic"
        ];
        const json = JSON.stringify([successBundle]);
        return HttpResponse.text(`)]}'\n\n${json.length}\n${json}`);
      }),
      http.get(`${BASE_URL}`, () => {
        return HttpResponse.text(`<html>CSRF</html>`);
      }),
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("rpcids") === RPC_IDS.SETTINGS) {
          const successBundle = ["wrb.fr", RPC_IDS.SETTINGS, JSON.stringify([null, 1]), null, null, null, "generic"];
          const json = JSON.stringify([successBundle]);
          return HttpResponse.text(`)]}'\n\n${json.length}\n${json}`);
        }
        return new HttpResponse(null, { status: 404 });
      })
    );

    (refreshCookiesHeadless as any).mockResolvedValue({
      cookies: { SID: "new-sid" },
      csrf_token: "new-csrf",
      session_id: "new-sid",
      extracted_at: Date.now() / 1000,
    });

    const client = new NotebookLMClient(mockTokens);
    const response = await client.query("nb-123", "Hello");

    expect(response.answer).toBe("This is the answer");
    expect(response.conversation_id).toBe("conv-123");
    expect(refreshCookiesHeadless).toHaveBeenCalled();
  });

  it("surfaces HTTP 5xx from batchexecute as an error (no silent swallow)", async () => {
    server.use(
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, () =>
        HttpResponse.text("upstream blew up", { status: 503, statusText: "Service Unavailable" }),
      ),
    );
    const client = new NotebookLMClient(mockTokens);
    await expect(client.listNotebooks()).rejects.toThrow(/HTTP 503 Service Unavailable/);
  });

  it("checkFreshness rethrows AuthenticationError instead of returning null", async () => {
    let calls = 0;
    server.use(
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, ({ request }) => {
        calls++;
        const url = new URL(request.url);
        if (url.searchParams.get("rpcids") === RPC_IDS.CHECK_FRESHNESS) {
          // Every call returns auth-error so the refresh path is engaged
          // and checkFreshness should not silently return null.
          const bundle = ["wrb.fr", RPC_IDS.CHECK_FRESHNESS, null, null, null, [16], "generic"];
          const json = JSON.stringify([bundle]);
          return HttpResponse.text(`)]}'\n\n${json.length}\n${json}`);
        }
        return HttpResponse.text("<html>CSRF</html>");
      }),
      http.get(`${BASE_URL}`, () => HttpResponse.text("<html>CSRF</html>")),
    );
    (refreshCookiesHeadless as any).mockRejectedValue(new Error("refresh broken"));
    // Stub stderr writes from the browser-auth fallback path to keep test output clean.
    vi.spyOn(console, "error").mockImplementation(() => {});

    const client = new NotebookLMClient(mockTokens);
    // The auth-refresh path will eventually throw the original AuthenticationError;
    // we expect checkFreshness to rethrow it rather than swallow.
    await expect(client.checkFreshness("src-1", "nb-1")).rejects.toThrow(
      /Authentication expired/,
    );
    expect(calls).toBeGreaterThan(0);
  });

  it("shares one refresh across concurrent failing requests (mutex)", async () => {
    let listCalls = 0;

    server.use(
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, ({ request }) => {
        const url = new URL(request.url);
        const rpcId = url.searchParams.get("rpcids");
        if (rpcId === RPC_IDS.LIST_NOTEBOOKS) {
          listCalls++;
          // First call from each concurrent caller fails with auth error.
          // listCalls 1+2 = the two parallel original requests.
          // listCalls 3+ = retries after refresh succeed.
          if (listCalls <= 2) {
            const bundle = ["wrb.fr", RPC_IDS.LIST_NOTEBOOKS, null, null, null, [16], "generic"];
            const json = JSON.stringify([bundle]);
            return HttpResponse.text(`)]}'\n\n${json.length}\n${json}`);
          }
          const ok = [
            "wrb.fr",
            RPC_IDS.LIST_NOTEBOOKS,
            JSON.stringify([[["NB", [], "id", null, null, [1, false, 8, null, null, null, null, null, [1], null, null, [1]]]]]),
            null, null, null, "generic",
          ];
          const json = JSON.stringify([ok]);
          return HttpResponse.text(`)]}'\n\n${json.length}\n${json}`);
        }
        if (rpcId === RPC_IDS.SETTINGS) {
          const ok = ["wrb.fr", RPC_IDS.SETTINGS, JSON.stringify([null, 1]), null, null, null, "generic"];
          const json = JSON.stringify([ok]);
          return HttpResponse.text(`)]}'\n\n${json.length}\n${json}`);
        }
        return HttpResponse.text("<html>CSRF</html>");
      }),
      http.get(`${BASE_URL}`, () => HttpResponse.text("<html>CSRF</html>")),
    );

    let refreshes = 0;
    (refreshCookiesHeadless as any).mockImplementation(async () => {
      refreshes++;
      // small delay so two concurrent callers both reach the mutex before resolve.
      await new Promise((r) => setTimeout(r, 30));
      return {
        cookies: { SID: "new" },
        csrf_token: "new-csrf",
        session_id: "new-sid",
        extracted_at: Date.now() / 1000,
      };
    });

    const client = new NotebookLMClient(mockTokens);
    const [a, b] = await Promise.all([client.listNotebooks(), client.listNotebooks()]);

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    // Two original failing requests + (at least) two retries → ≥4 list calls.
    expect(listCalls).toBeGreaterThanOrEqual(4);
    // The mutex guarantees only one refresh ran despite two parallel auth failures.
    expect(refreshes).toBe(1);
  });
});

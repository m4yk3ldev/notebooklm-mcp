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
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, () => {
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
          JSON.stringify(["This is the answer", null, 1, null, "conv-123"]),
          null, null, null, "generic"
        ];
        const json = JSON.stringify([successBundle]);
        return HttpResponse.text(`)]}'\n\n${json.length}\n${json}`);
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
    const response = await client.query("nb-123", "Hello");

    expect(response.answer).toBe("This is the answer");
    expect(response.conversation_id).toBe("conv-123");
    expect(refreshCookiesHeadless).toHaveBeenCalled();
  });
});

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

  it("should send deleteSource with triple-nested sourceId format", async () => {
    let capturedBody = "";
    let capturedUrl = "";

    server.use(
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, async ({ request }) => {
        capturedUrl = request.url;
        capturedBody = await request.text();
        const url = new URL(request.url);
        const rpcId = url.searchParams.get("rpcids");

        if (rpcId === RPC_IDS.DELETE_SOURCE) {
          const successBundle = ["wrb.fr", RPC_IDS.DELETE_SOURCE, JSON.stringify([]), null, null, null, "generic"];
          const json = JSON.stringify([successBundle]);
          return HttpResponse.text(`)]}'\n\n${json.length}\n${json}`);
        }
        return new HttpResponse(null, { status: 404 });
      })
    );

    const client = new NotebookLMClient(mockTokens);
    await client.deleteSource("src-123", "nb-456");

    // Verify the URL includes source-path
    expect(capturedUrl).toContain("source-path");
    expect(capturedUrl).toContain(encodeURIComponent("/notebook/nb-456"));

    // Verify the request body contains triple-nested sourceId: [[[sourceId]], [2]]
    const decodedBody = decodeURIComponent(capturedBody);
    expect(decodedBody).toContain(RPC_IDS.DELETE_SOURCE);
    // The params should be [[["src-123"],[2]]]
    expect(decodedBody).toContain('[[[\\\"src-123\\\"]],[2]]');
  });

  it("should send importResearch with full source objects", async () => {
    let importBody = "";
    let callIndex = 0;

    server.use(
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, async ({ request }) => {
        const url = new URL(request.url);
        const rpcId = url.searchParams.get("rpcids");

        if (rpcId === RPC_IDS.POLL_RESEARCH) {
          // Return mock research results with sources
          const researchData = [[
            ["task-abc", [
              null,
              ["test query", 1],
              null,
              [
                [
                  ["https://example.com", "Example Site", "A description", 1],
                  ["https://test.com", "Test Page", "Another desc", 1],
                ],
                "Research summary",
              ],
              2, // status: completed
            ]],
          ]];
          const successBundle = ["wrb.fr", RPC_IDS.POLL_RESEARCH, JSON.stringify(researchData), null, null, null, "generic"];
          const json = JSON.stringify([successBundle]);
          return HttpResponse.text(`)]}'\n\n${json.length}\n${json}`);
        }

        if (rpcId === RPC_IDS.IMPORT_RESEARCH) {
          importBody = await request.text();
          const successBundle = ["wrb.fr", RPC_IDS.IMPORT_RESEARCH, JSON.stringify([]), null, null, null, "generic"];
          const json = JSON.stringify([successBundle]);
          return HttpResponse.text(`)]}'\n\n${json.length}\n${json}`);
        }

        return new HttpResponse(null, { status: 404 });
      })
    );

    const client = new NotebookLMClient(mockTokens);
    await client.importResearch("nb-789", "task-abc");

    // Verify the import body contains the correct format
    const decodedBody = decodeURIComponent(importBody);
    expect(decodedBody).toContain(RPC_IDS.IMPORT_RESEARCH);
    // Should contain source URL data
    expect(decodedBody).toContain("example.com");
    expect(decodedBody).toContain("test.com");
    // Should contain the 5-element format: [null, [1], taskId, notebookId, sources]
    expect(decodedBody).toContain("task-abc");
    expect(decodedBody).toContain("nb-789");
  });

  it("should throw when importResearch task not found", async () => {
    server.use(
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, async ({ request }) => {
        const url = new URL(request.url);
        const rpcId = url.searchParams.get("rpcids");

        if (rpcId === RPC_IDS.POLL_RESEARCH) {
          const researchData = [[]]; // empty results
          const successBundle = ["wrb.fr", RPC_IDS.POLL_RESEARCH, JSON.stringify(researchData), null, null, null, "generic"];
          const json = JSON.stringify([successBundle]);
          return HttpResponse.text(`)]}'\n\n${json.length}\n${json}`);
        }
        return new HttpResponse(null, { status: 404 });
      })
    );

    const client = new NotebookLMClient(mockTokens);
    await expect(client.importResearch("nb-789", "nonexistent-task")).rejects.toThrow("Research task nonexistent-task not found");
  });

  it("should filter deep_report sources during importResearch", async () => {
    let importBody = "";

    server.use(
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, async ({ request }) => {
        const url = new URL(request.url);
        const rpcId = url.searchParams.get("rpcids");

        if (rpcId === RPC_IDS.POLL_RESEARCH) {
          const researchData = [[
            ["task-deep", [
              null,
              ["deep query", 1],
              null,
              [
                [
                  ["https://example.com", "Web Source", "desc", 1],  // web = importable
                  [null, "Deep Report", "generated", 5],             // deep_report = skip
                ],
                "Summary",
              ],
              2,
            ]],
          ]];
          const successBundle = ["wrb.fr", RPC_IDS.POLL_RESEARCH, JSON.stringify(researchData), null, null, null, "generic"];
          const json = JSON.stringify([successBundle]);
          return HttpResponse.text(`)]}'\n\n${json.length}\n${json}`);
        }

        if (rpcId === RPC_IDS.IMPORT_RESEARCH) {
          importBody = await request.text();
          const successBundle = ["wrb.fr", RPC_IDS.IMPORT_RESEARCH, JSON.stringify([]), null, null, null, "generic"];
          const json = JSON.stringify([successBundle]);
          return HttpResponse.text(`)]}'\n\n${json.length}\n${json}`);
        }
        return new HttpResponse(null, { status: 404 });
      })
    );

    const client = new NotebookLMClient(mockTokens);
    await client.importResearch("nb-789", "task-deep");

    const decodedBody = decodeURIComponent(importBody);
    // Should contain the web source
    expect(decodedBody).toContain("example.com");
    // Should NOT contain the deep report (it has null URL and type=5)
    expect(decodedBody).not.toContain("Deep Report");
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
});

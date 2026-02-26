import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { NotebookLMClient } from "../client.js";
import { BASE_URL, BATCHEXECUTE_PATH, RPC_IDS } from "../constants.js";

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

describe("NotebookLMClient Integration", () => {
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
    csrf_token: "mock-csrf",
    session_id: "mock-sid",
    extracted_at: Date.now() / 1000,
  };

  const createMockResponse = (rpcId: string, data: any) => {
    const bundle = ["wrb.fr", rpcId, JSON.stringify(data), null, null, null, "generic"];
    const json = JSON.stringify([bundle]);
    return HttpResponse.text(`)]}'\n\n${json.length}\n${json}`);
  };

  it("should poll studio artifacts successfully", async () => {
    // pollStudio expects results in the first item of the array
    const studioData = [
      [
        ["art-789", null, 1, 3, "https://download.url"]
      ]
    ];
    
    server.use(
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, () => {
        return createMockResponse(RPC_IDS.POLL_STUDIO, studioData);
      })
    );

    const client = new NotebookLMClient(mockTokens);
    const artifacts = await client.pollStudio("nb-123");

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].id).toBe("art-789");
    expect(artifacts[0].status).toBe("completed");
  });

  it("should handle error 16 during research start", async () => {
    let callCount = 0;
    server.use(
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("rpcids") === RPC_IDS.START_DEEP_RESEARCH) {
          callCount++;
          // Double count in test environment
          if (callCount <= 2) {
            const authErrorBundle = ["wrb.fr", RPC_IDS.START_DEEP_RESEARCH, null, null, null, [16], "generic"];
            const json = JSON.stringify([authErrorBundle]);
            return HttpResponse.text(`)]}'\n\n${json.length}\n${json}`);
          }
          return createMockResponse(RPC_IDS.START_DEEP_RESEARCH, ["task-deep-789"]);
        }
        return HttpResponse.text("<html>CSRF</html>");
      }),
      http.get(`${BASE_URL}`, () => HttpResponse.text("<html>CSRF</html>"))
    );

    (refreshCookiesHeadless as any).mockResolvedValue({
      cookies: { SID: "new-sid" },
      csrf_token: "new-csrf",
      session_id: "new-sid",
      extracted_at: Date.now() / 1000,
    });

    const client = new NotebookLMClient(mockTokens);
    const result = await client.startResearch("nb-123", "deep query", "web", "deep");

    expect(result.taskId).toBe("task-deep-789");
    expect(refreshCookiesHeadless).toHaveBeenCalled();
  });
});

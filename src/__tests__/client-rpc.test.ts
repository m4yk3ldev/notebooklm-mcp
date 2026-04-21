import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { NotebookLMClient } from "../client.js";
import { BASE_URL, BATCHEXECUTE_PATH, RPC_IDS } from "../constants.js";

vi.mock("../browser-auth.js", () => ({
  refreshCookiesHeadless: vi.fn(),
  runBrowserAuthFlow: vi.fn(),
}));

vi.mock("../auth.js", () => ({
  buildCookieHeader: (c: Record<string, string>) =>
    Object.entries(c).map(([k, v]) => `${k}=${v}`).join("; "),
  extractCsrfFromPage: () => "csrf",
  extractSessionIdFromPage: () => "sid",
  saveTokens: vi.fn(),
}));

const server = setupServer();
beforeEach(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const tokens = {
  cookies: { SID: "a", HSID: "b", SSID: "c", APISID: "d", SAPISID: "e" },
  csrf_token: "csrf",
  session_id: "sid",
  extracted_at: Date.now() / 1000,
};

// Encode a single RPC response in Google's "chunked prefix length" wrapper.
function encodeResponse(rpcId: string, payload: unknown) {
  const bundle = [
    "wrb.fr",
    rpcId,
    JSON.stringify(payload),
    null,
    null,
    null,
    "generic",
  ];
  const json = JSON.stringify([bundle]);
  return `)]}'\n\n${json.length}\n${json}`;
}

/**
 * Installs a batchexecute handler that dispatches responses per rpcId.
 * Handlers can capture the raw form body for assertions.
 */
function mockBatchexecute(routes: Record<string, unknown>) {
  const captured: { rpcId: string; body: string }[] = [];
  server.use(
    http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, async ({ request }) => {
      const url = new URL(request.url);
      const rpcId = url.searchParams.get("rpcids") ?? "";
      const body = await request.text();
      captured.push({ rpcId, body });
      if (rpcId in routes) {
        return HttpResponse.text(encodeResponse(rpcId, routes[rpcId]));
      }
      // Always answer SETTINGS (warmup) politely to avoid noisy errors.
      if (rpcId === RPC_IDS.SETTINGS) {
        return HttpResponse.text(encodeResponse(rpcId, [null, 1]));
      }
      return new HttpResponse(null, { status: 404 });
    }),
    http.get(`${BASE_URL}`, () => HttpResponse.text("<html></html>")),
  );
  return captured;
}

describe("NotebookLMClient RPC methods", () => {
  it("createNotebook parses response", async () => {
    mockBatchexecute({
      [RPC_IDS.CREATE_NOTEBOOK]: [
        "New Title",
        [],
        "nb-created",
        null,
        null,
        [1, false, 0, null, null, null, null, null, [1700000000], null, null, [1700000000]],
      ],
    });

    const client = new NotebookLMClient(tokens);
    const nb = await client.createNotebook("New Title");
    expect(nb.title).toBe("New Title");
    expect(nb.id).toBe("nb-created");
  });

  it("renameNotebook sends rename payload without error", async () => {
    const captured = mockBatchexecute({
      [RPC_IDS.RENAME_NOTEBOOK]: [],
    });

    const client = new NotebookLMClient(tokens);
    await expect(
      client.renameNotebook("nb-1", "New Name"),
    ).resolves.toBeUndefined();
    expect(
      captured.find((c) => c.rpcId === RPC_IDS.RENAME_NOTEBOOK),
    ).toBeDefined();
  });

  it("deleteNotebook completes", async () => {
    mockBatchexecute({ [RPC_IDS.DELETE_NOTEBOOK]: [] });
    const client = new NotebookLMClient(tokens);
    await expect(client.deleteNotebook("nb-1")).resolves.toBeUndefined();
  });

  it("describeNotebook returns summary text", async () => {
    mockBatchexecute({
      [RPC_IDS.GET_SUMMARY]: ["This notebook is about cats."],
    });
    const client = new NotebookLMClient(tokens);
    const summary = await client.describeNotebook("nb-1");
    expect(summary).toBe("This notebook is about cats.");
  });

  it("describeNotebook falls back to empty string when result empty", async () => {
    mockBatchexecute({ [RPC_IDS.GET_SUMMARY]: [] });
    const client = new NotebookLMClient(tokens);
    expect(await client.describeNotebook("nb-1")).toBe("");
  });

  it("addUrlSource flags youtube URLs", async () => {
    const captured = mockBatchexecute({
      [RPC_IDS.ADD_SOURCE]: [[["yt-id", "Some Video"]]],
    });
    const client = new NotebookLMClient(tokens);
    const src = await client.addUrlSource("nb-1", "https://youtube.com/watch?v=x");
    expect(src.type).toBe("youtube");
    expect(src.title).toBe("Some Video");
    expect(captured.some((c) => c.rpcId === RPC_IDS.ADD_SOURCE)).toBe(true);
  });

  it("addUrlSource treats non-youtube URLs as web_page", async () => {
    mockBatchexecute({
      [RPC_IDS.ADD_SOURCE]: [[["web-id", "Blog"]]],
    });
    const client = new NotebookLMClient(tokens);
    const src = await client.addUrlSource("nb-1", "https://example.com/post");
    expect(src.type).toBe("web_page");
  });

  it("addTextSource returns pasted_text type", async () => {
    mockBatchexecute({
      [RPC_IDS.ADD_SOURCE]: [[["txt-id", "My doc"]]],
    });
    const client = new NotebookLMClient(tokens);
    const src = await client.addTextSource("nb-1", "body", "My doc");
    expect(src.type).toBe("pasted_text");
    expect(src.title).toBe("My doc");
  });

  it("addDriveSource returns google_docs type", async () => {
    mockBatchexecute({
      [RPC_IDS.ADD_SOURCE]: [[["drv-id", "Spec"]]],
    });
    const client = new NotebookLMClient(tokens);
    const src = await client.addDriveSource(
      "nb-1",
      "file-id",
      "Spec",
      "application/vnd.google-apps.document",
    );
    expect(src.type).toBe("google_docs");
  });

  it("listNotebooks returns empty array when response malformed", async () => {
    mockBatchexecute({ [RPC_IDS.LIST_NOTEBOOKS]: null });
    const client = new NotebookLMClient(tokens);
    expect(await client.listNotebooks()).toEqual([]);
  });

  it("listNotebooks clamps result to maxResults", async () => {
    const three = Array.from({ length: 3 }, (_, i) => [
      `Title ${i}`,
      [],
      `nb-${i}`,
      null,
      null,
      [1, false, 0, null, null, null, null, null, [1], null, null, [1]],
    ]);
    mockBatchexecute({ [RPC_IDS.LIST_NOTEBOOKS]: [three] });
    const client = new NotebookLMClient(tokens);
    const list = await client.listNotebooks(2);
    expect(list).toHaveLength(2);
  });

  it("getNotebook parses single notebook response", async () => {
    mockBatchexecute({
      [RPC_IDS.GET_NOTEBOOK]: [
        [
          [
            "Notebook",
            [],
            "nb-1",
            null,
            null,
            [1, false, 0, null, null, null, null, null, [1], null, null, [1]],
          ],
        ],
      ],
    });
    const client = new NotebookLMClient(tokens);
    const nb = await client.getNotebook("nb-1");
    expect(nb).toBeDefined();
  });
});

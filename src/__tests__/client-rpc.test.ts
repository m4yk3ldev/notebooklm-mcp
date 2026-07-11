import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { NotebookLMClient, AuthenticationError } from "../client.js";
import { BASE_URL, BATCHEXECUTE_PATH, QUERY_PATH, RPC_IDS } from "../constants.js";

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

import { refreshCookiesHeadless, runBrowserAuthFlow } from "../browser-auth.js";

const server = setupServer();
beforeEach(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());

const tokens = {
  cookies: { SID: "a", HSID: "b", SSID: "c", APISID: "d", SAPISID: "e" },
  csrf_token: "csrf",
  session_id: "sid",
  extracted_at: Date.now() / 1000,
};

function encodeBatchexecute(rpcId: string, payload: unknown, errorCodes: number[] | null = null) {
  const bundle = [
    "wrb.fr",
    rpcId,
    payload === undefined ? null : JSON.stringify(payload),
    null,
    null,
    errorCodes,
    "generic",
  ];
  const json = JSON.stringify([bundle]);
  return `)]}'\n\n${json.length}\n${json}`;
}

/**
 * Handler factory for batchexecute + query paths.
 * `routes`: rpcId -> payload (batchexecute only).
 * `errors`: rpcId -> error codes array.
 * `queryBody`: body to return from QUERY_PATH.
 */
function mockBatchexecute(
  routes: Record<string, unknown> = {},
  opts: {
    errors?: Record<string, number[]>;
    queryBody?: string;
    setCookie?: string[];
  } = {},
) {
  const captured: { rpcId: string; body: string }[] = [];
  server.use(
    http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, async ({ request }) => {
      const url = new URL(request.url);
      const rpcId = url.searchParams.get("rpcids") ?? "";
      const body = await request.text();
      captured.push({ rpcId, body });

      const headers: Record<string, string> = {};
      if (opts.setCookie && opts.setCookie.length) {
        // MSW needs multi-valued Set-Cookie via separate headers
        return HttpResponse.text(
          rpcId in opts.errors! ? encodeBatchexecute(rpcId, null, opts.errors![rpcId]) :
          rpcId in routes ? encodeBatchexecute(rpcId, routes[rpcId]) :
          encodeBatchexecute(rpcId, null),
          { headers: { "Set-Cookie": opts.setCookie.join(", ") } },
        );
      }

      if (opts.errors && rpcId in opts.errors) {
        return HttpResponse.text(encodeBatchexecute(rpcId, null, opts.errors[rpcId]));
      }
      if (rpcId in routes) {
        return HttpResponse.text(encodeBatchexecute(rpcId, routes[rpcId]));
      }
      if (rpcId === RPC_IDS.SETTINGS) {
        return HttpResponse.text(encodeBatchexecute(rpcId, [null, 1]));
      }
      return new HttpResponse(null, { status: 404 });
    }),
    http.post(`${BASE_URL}${QUERY_PATH}`, () =>
      HttpResponse.text(opts.queryBody ?? ""),
    ),
    http.get(`${BASE_URL}`, () => HttpResponse.text("<html></html>")),
  );
  return captured;
}

describe("notebook RPCs", () => {
  it("createNotebook parses response", async () => {
    mockBatchexecute({
      [RPC_IDS.CREATE_NOTEBOOK]: [
        "New Title", [], "nb-created", null, null,
        [1, false, 0, null, null, null, null, null, [1700000000], null, null, [1700000000]],
      ],
    });
    const c = new NotebookLMClient(tokens);
    const nb = await c.createNotebook("New Title");
    expect(nb.title).toBe("New Title");
    expect(nb.id).toBe("nb-created");
  });

  it("renameNotebook resolves void", async () => {
    mockBatchexecute({ [RPC_IDS.RENAME_NOTEBOOK]: [] });
    await expect(new NotebookLMClient(tokens).renameNotebook("n1", "X")).resolves.toBeUndefined();
  });

  it("deleteNotebook resolves void", async () => {
    mockBatchexecute({ [RPC_IDS.DELETE_NOTEBOOK]: [] });
    await expect(new NotebookLMClient(tokens).deleteNotebook("n1")).resolves.toBeUndefined();
  });

  it("deleteNotebook sends the [[id],[2]] wire payload (not bare [id])", async () => {
    const captured = mockBatchexecute({ [RPC_IDS.DELETE_NOTEBOOK]: [] });
    await new NotebookLMClient(tokens).deleteNotebook("n1");
    const body = captured.find((c) => c.rpcId === RPC_IDS.DELETE_NOTEBOOK)!.body;
    const fReq = decodeURIComponent(body.split("f.req=")[1].split("&")[0]);
    // f.req is [[[rpcId, JSON.stringify(params), null, "generic"]]] — the
    // inner params must be [["n1"],[2]]; the bare ["n1"] form is rejected
    // by Google with INVALID_ARGUMENT.
    const params = JSON.parse(JSON.parse(fReq)[0][0][1]);
    expect(params).toEqual([["n1"], [2]]);
  });

  it("describeNotebook returns text or empty", async () => {
    mockBatchexecute({ [RPC_IDS.GET_SUMMARY]: ["s"] });
    expect(await new NotebookLMClient(tokens).describeNotebook("n1")).toBe("s");
    server.resetHandlers();
    mockBatchexecute({ [RPC_IDS.GET_SUMMARY]: [] });
    expect(await new NotebookLMClient(tokens).describeNotebook("n1")).toBe("");
  });

  it("listNotebooks handles empty and clamps maxResults", async () => {
    mockBatchexecute({ [RPC_IDS.LIST_NOTEBOOKS]: null });
    expect(await new NotebookLMClient(tokens).listNotebooks()).toEqual([]);
    server.resetHandlers();
    const three = Array.from({ length: 3 }, (_, i) => [
      `T${i}`, [], `n${i}`, null, null,
      [1, false, 0, null, null, null, null, null, [1], null, null, [1]],
    ]);
    mockBatchexecute({ [RPC_IDS.LIST_NOTEBOOKS]: [three] });
    expect(await new NotebookLMClient(tokens).listNotebooks(2)).toHaveLength(2);
  });

  it("getNotebook parses sources and metadata", async () => {
    // Notebook IDs must contain '-' so parseNotebook's unwrap heuristic triggers.
    mockBatchexecute({
      [RPC_IDS.GET_NOTEBOOK]: [
        ["NB", [
          ["s1", "S1", null, 1],
          ["s2", "S2", null, 5],
        ], "nb-1", "📓", null,
        [1, true, 2, null, null, [1700000100], null, null, [1700000000]]],
      ],
    });
    const nb = await new NotebookLMClient(tokens).getNotebook("nb-1");
    expect(nb.id).toBe("nb-1");
    expect(nb.emoji).toBe("📓");
    expect(nb.is_shared).toBe(true);
    expect(nb.ownership).toBe("mine");
    expect(nb.sources).toHaveLength(2);
    expect(nb.sources[0].title).toBe("S1");
    expect(nb.created_at).toMatch(/^2023-/);
  });

  it("getNotebook applies all defensive fallbacks for sparse notebook payload", async () => {
    // Every field that has a `|| default` / `?? null` branch is intentionally
    // missing so the fallback path runs. The outer wrapper is mandatory so
    // the unwrap heuristic (d[0][2] contains "-") fires.
    mockBatchexecute({
      [RPC_IDS.GET_NOTEBOOK]: [
        [null, [[["raw-id"], null, null, null]], "nb-bare", null, null, [99, false, 0]],
      ],
    });
    const nb = await new NotebookLMClient(tokens).getNotebook("nb-bare");
    expect(nb.title).toBe("Untitled");
    expect(nb.emoji).toBeNull();
    expect(nb.is_shared).toBe(false);
    expect(nb.ownership).toBe("shared");
    expect(nb.sources[0].title).toBe("Untitled");
  });

  it("getNotebook tolerates payload with no meta block (created_at/modified_at null)", async () => {
    // Same unwrap requirement: a notebook id containing '-' at d[0][2].
    mockBatchexecute({
      [RPC_IDS.GET_NOTEBOOK]: [
        ["NB-Title", [], "nb-without-meta"],
      ],
    });
    const nb = await new NotebookLMClient(tokens).getNotebook("nb-without-meta");
    expect(nb.created_at).toBeNull();
    expect(nb.modified_at).toBeNull();
    expect(nb.is_shared).toBe(false);
    expect(nb.ownership).toBe("shared");
  });

  it("getNotebook skips non-array source rows and ones with falsy s[0]", async () => {
    mockBatchexecute({
      [RPC_IDS.GET_NOTEBOOK]: [
        ["NB-Title", [
          "not-an-array",
          [null, "no-id"],
          ["good-id", "Good", null, 1],
        ], "nb-sparse"],
      ],
    });
    const nb = await new NotebookLMClient(tokens).getNotebook("nb-sparse");
    expect(nb.sources).toHaveLength(1);
    expect(nb.sources[0].id).toBe("good-id");
  });

  it("getNotebook applies d[2] || '' fallback when id is undefined", async () => {
    // Send an outer wrapper whose inner d[0][2] does NOT contain '-' so the
    // unwrap heuristic doesn't fire. Then d itself is the wrapper, d[2] is
    // undefined → the `|| ""` fallback runs.
    mockBatchexecute({
      [RPC_IDS.GET_NOTEBOOK]: [["T", []]],
    });
    const nb = await new NotebookLMClient(tokens).getNotebook("any");
    expect(nb.id).toBe("");
  });

  it("getNotebook tolerates d[1] not being an array (skips source parsing)", async () => {
    mockBatchexecute({
      [RPC_IDS.GET_NOTEBOOK]: [
        ["NB-Title", "not-an-array-sources", "nb-noarr", null, null,
         [1, false, 0, null, null, null, null, null, [1], null, null, [1]]],
      ],
    });
    const nb = await new NotebookLMClient(tokens).getNotebook("nb-noarr");
    expect(nb.sources).toEqual([]);
  });

  it("listNotebooks skips non-array items in result[0]", async () => {
    const valid = [
      "NB-1", [], "nb-id-good", null, null,
      [1, false, 0, null, null, null, null, null, [1], null, null, [1]],
    ];
    mockBatchexecute({ [RPC_IDS.LIST_NOTEBOOKS]: [[ "not-array-item", valid ]] });
    const list = await new NotebookLMClient(tokens).listNotebooks();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("nb-id-good");
  });

  it("parseNotebook throws on non-array input", async () => {
    mockBatchexecute({ [RPC_IDS.GET_NOTEBOOK]: "not-array" as any });
    await expect(new NotebookLMClient(tokens).getNotebook("n1")).rejects.toThrow(
      /Invalid notebook data/,
    );
  });
});

describe("source RPCs", () => {
  it("addUrlSource recognises youtube", async () => {
    mockBatchexecute({ [RPC_IDS.ADD_SOURCE]: [[["yt", "Video"]]] });
    const s = await new NotebookLMClient(tokens).addUrlSource("n1", "https://youtu.be/x");
    expect(s.type).toBe("youtube");
  });

  it("addUrlSource defaults to web_page", async () => {
    mockBatchexecute({ [RPC_IDS.ADD_SOURCE]: [[["web", "Blog"]]] });
    const s = await new NotebookLMClient(tokens).addUrlSource("n1", "https://example.com");
    expect(s.type).toBe("web_page");
  });

  it("addTextSource returns pasted_text", async () => {
    mockBatchexecute({ [RPC_IDS.ADD_SOURCE]: [[["t", "T"]]] });
    const s = await new NotebookLMClient(tokens).addTextSource("n1", "body", "T");
    expect(s.type).toBe("pasted_text");
  });

  it("addDriveSource returns google_docs", async () => {
    mockBatchexecute({ [RPC_IDS.ADD_SOURCE]: [[["d", "Doc"]]] });
    const s = await new NotebookLMClient(tokens).addDriveSource("n1", "f", "Doc", "application/vnd.google-apps.document");
    expect(s.type).toBe("google_docs");
  });

  it("getSource maps metadata and content blocks", async () => {
    // Content path: data[3][0][N][2][2][0][0][2][0] — each block shape:
    //   [_, _, [_, _, [ [ [_, _, ["text"]] ] ]]]
    const block = (t: string) => [null, null, [null, null, [[[null, null, [t]]]]]];
    mockBatchexecute({
      [RPC_IDS.GET_SOURCE]: [
        ["s1", "Title", null, 5],
        null,
        null,
        [[block("part1"), block("part2")]],
      ],
    });
    const s = await new NotebookLMClient(tokens).getSource("s1", "n1");
    expect(s.title).toBe("Title");
    expect(s.content).toBe("part1part2");
    expect(s.type).toBe("web_page");
  });

  it("getSource returns empty string when blocks malformed", async () => {
    mockBatchexecute({ [RPC_IDS.GET_SOURCE]: [null, null, null, "not-array"] });
    const s = await new NotebookLMClient(tokens).getSource("s1", "n1");
    expect(s.content).toBe("");
  });

  it("getSourceGuide returns summary and keywords", async () => {
    mockBatchexecute({
      [RPC_IDS.GET_SOURCE_GUIDE]: ["Summary here", ["a", "b"]],
    });
    const g = await new NotebookLMClient(tokens).getSourceGuide("s1", "n1");
    expect(g.summary).toBe("Summary here");
    expect(g.keywords).toEqual(["a", "b"]);
  });

  it("getSourceGuide defaults when empty", async () => {
    mockBatchexecute({ [RPC_IDS.GET_SOURCE_GUIDE]: [] });
    const g = await new NotebookLMClient(tokens).getSourceGuide("s1", "n1");
    expect(g).toEqual({ summary: "", keywords: [] });
  });

  it("addUrlSource applies defensive fallbacks when the API returns sparse source data", async () => {
    // source?.[0] is missing → String(source?.[0] || "") fallback fires.
    // source?.[1] missing → title falls back to the input URL.
    mockBatchexecute({ [RPC_IDS.ADD_SOURCE]: [[[null, null]]] });
    const s = await new NotebookLMClient(tokens).addUrlSource("n1", "https://example.com");
    expect(s.id).toBe("");
    expect(s.title).toBe("https://example.com");
  });

  it("addUrlSource unwraps id when API returns it as a nested array", async () => {
    // source[0] is an array → the Array.isArray(...) ? source[0][0] : ... branch.
    mockBatchexecute({ [RPC_IDS.ADD_SOURCE]: [[[["nested-id"], "T"]]] });
    const s = await new NotebookLMClient(tokens).addUrlSource("n1", "https://example.com");
    expect(s.id).toBe("nested-id");
  });

  it("addTextSource applies defensive fallbacks when API returns sparse data", async () => {
    mockBatchexecute({ [RPC_IDS.ADD_SOURCE]: [[[null, null]]] });
    const s = await new NotebookLMClient(tokens).addTextSource("n1", "body", "Title");
    expect(s.id).toBe("");
    expect(s.title).toBe("Title");
  });

  it("addTextSource unwraps id when API returns it as a nested array", async () => {
    mockBatchexecute({ [RPC_IDS.ADD_SOURCE]: [[[["nested-text-id"], "T"]]] });
    const s = await new NotebookLMClient(tokens).addTextSource("n1", "body", "T");
    expect(s.id).toBe("nested-text-id");
  });

  it("addDriveSource applies defensive fallbacks when API returns sparse data", async () => {
    mockBatchexecute({ [RPC_IDS.ADD_SOURCE]: [[[null, null]]] });
    const s = await new NotebookLMClient(tokens).addDriveSource(
      "n1",
      "doc-id",
      "Doc",
      "application/vnd.google-apps.document",
    );
    expect(s.id).toBe("");
    expect(s.title).toBe("Doc");
  });

  it("addDriveSource unwraps id when API returns it as a nested array", async () => {
    mockBatchexecute({ [RPC_IDS.ADD_SOURCE]: [[[["nested-drive-id"], "T"]]] });
    const s = await new NotebookLMClient(tokens).addDriveSource(
      "n1",
      "doc-id",
      "Doc",
      "application/vnd.google-apps.document",
    );
    expect(s.id).toBe("nested-drive-id");
  });

  it("getSource unwraps type code when API returns meta[3] as an array", async () => {
    mockBatchexecute({
      [RPC_IDS.GET_SOURCE]: [["s1", "Title", null, [null, 5]], null, null, null],
    });
    const s = await new NotebookLMClient(tokens).getSource("s1", "n1");
    expect(s.title).toBe("Title");
  });

  it("getSource falls back when meta type is not an array (uses raw code)", async () => {
    // meta[3] is a single number, not an array → meta?.[3] branch (else) runs.
    mockBatchexecute({
      [RPC_IDS.GET_SOURCE]: [["s1", "Title", null, 1], null, null, null],
    });
    const s = await new NotebookLMClient(tokens).getSource("s1", "n1");
    expect(s.title).toBe("Title");
  });

  it("syncDrive loops through every source id", async () => {
    const captured = mockBatchexecute({ [RPC_IDS.SYNC_DRIVE]: [] });
    await new NotebookLMClient(tokens).syncDrive(["s1", "s2", "s3"], "n1");
    const syncs = captured.filter((c) => c.rpcId === RPC_IDS.SYNC_DRIVE);
    expect(syncs).toHaveLength(3);
  });

  it("deleteSource completes", async () => {
    mockBatchexecute({ [RPC_IDS.DELETE_SOURCE]: [] });
    await expect(new NotebookLMClient(tokens).deleteSource("s1", "n1")).resolves.toBeUndefined();
  });
});

describe("query RPC", () => {
  it("returns answer and conversation_id on happy path", async () => {
    const queryBody = `)]}'\n\n${JSON.stringify([
      ["wrb.fr", "q", JSON.stringify([["The answer", null, 1, null, null, null, null, null, null, null, "conv-1"]]), null, null, null, "generic"],
    ]).length}\n${JSON.stringify([
      ["wrb.fr", "q", JSON.stringify([["The answer", null, 1, null, null, null, null, null, null, null, "conv-1"]]), null, null, null, "generic"],
    ])}`;
    mockBatchexecute({}, { queryBody });
    const r = await new NotebookLMClient(tokens).query("n1", "ask");
    expect(r.answer).toBe("The answer");
    expect(r.conversation_id).toBe("conv-1");
  });

  it("forwards source_ids and conversation_id", async () => {
    const queryBody = `)]}'\n\n${JSON.stringify([
      ["wrb.fr", "q", JSON.stringify([["ok", null, 1, null, null, null, null, null, null, null, "c2"]]), null, null, null, "generic"],
    ]).length}\n${JSON.stringify([
      ["wrb.fr", "q", JSON.stringify([["ok", null, 1, null, null, null, null, null, null, null, "c2"]]), null, null, null, "generic"],
    ])}`;
    mockBatchexecute({}, { queryBody });
    const r = await new NotebookLMClient(tokens).query("n1", "q", ["s1"], "c2");
    expect(r.conversation_id).toBe("c2");
  });

  it("query retries after code 16 by falling back to manual auth flow", async () => {
    (refreshCookiesHeadless as any).mockRejectedValue(new Error("no headless"));
    (runBrowserAuthFlow as any).mockResolvedValue({
      cookies: tokens.cookies,
      csrf_token: "recovered-csrf",
      session_id: "recovered-sid",
      extracted_at: Date.now() / 1000 + 100,
    });

    let calls = 0;
    const successBody = JSON.stringify([
      ["wrb.fr", "q", JSON.stringify([["ok", null, 1, null, null, null, null, null, null, null, "c"]]), null, null, null, "generic"],
    ]);
    const errorBody = JSON.stringify([
      ["wrb.fr", "q", null, null, null, [16], "generic"],
    ]);

    server.use(
      http.post(`${BASE_URL}${QUERY_PATH}`, () => {
        calls++;
        const body = calls === 1 ? errorBody : successBody;
        return HttpResponse.text(`)]}'\n\n${body.length}\n${body}`);
      }),
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("rpcids") === RPC_IDS.SETTINGS) {
          return HttpResponse.text(encodeBatchexecute(RPC_IDS.SETTINGS, [null, 1]));
        }
        return new HttpResponse(null, { status: 404 });
      }),
      http.get(`${BASE_URL}`, () => HttpResponse.text("<html></html>")),
    );

    const r = await new NotebookLMClient(tokens).query("n1", "q");
    expect(r.answer).toBe("ok");
    expect(runBrowserAuthFlow).toHaveBeenCalled();
  });

  it("query throws when both headless and manual auth flows fail", async () => {
    (refreshCookiesHeadless as any).mockRejectedValue(new Error("no headless"));
    (runBrowserAuthFlow as any).mockRejectedValue(new Error("no manual"));

    const errorBody = JSON.stringify([
      ["wrb.fr", "q", null, null, null, [16], "generic"],
    ]);
    server.use(
      http.post(`${BASE_URL}${QUERY_PATH}`, () =>
        HttpResponse.text(`)]}'\n\n${errorBody.length}\n${errorBody}`),
      ),
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, () => new HttpResponse(null, { status: 404 })),
      http.get(`${BASE_URL}`, () => HttpResponse.text("<html></html>")),
    );

    await expect(new NotebookLMClient(tokens).query("n1", "q")).rejects.toThrow(
      /Authentication expired/,
    );
  });

  it("query retries with fresher cached tokens from disk on code 16", async () => {
    const authMod = await import("../auth.js");
    (authMod.loadTokensFromCache as any).mockReturnValueOnce({
      cookies: tokens.cookies,
      csrf_token: "newer-csrf",
      session_id: "newer-sid",
      extracted_at: Date.now() / 1000 + 100,
    });

    let calls = 0;
    const bundle = (payload: unknown, err: number[] | null = null) =>
      JSON.stringify([["wrb.fr", "q", payload === null ? null : JSON.stringify(payload), null, null, err, "generic"]]);

    server.use(
      http.post(`${BASE_URL}${QUERY_PATH}`, () => {
        calls++;
        const body = calls === 1
          ? bundle(null, [16])
          : bundle([["ok", null, 1, null, null, null, null, null, null, null, "c1"]]);
        return HttpResponse.text(`)]}'\n\n${body.length}\n${body}`);
      }),
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, () => new HttpResponse(null, { status: 404 })),
      http.get(`${BASE_URL}`, () => HttpResponse.text("<html></html>")),
    );

    const r = await new NotebookLMClient(tokens).query("n1", "q");
    expect(r.answer).toBe("ok");
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it("query persists cookies from Set-Cookie response header", async () => {
    const body = JSON.stringify([
      ["wrb.fr", "q", JSON.stringify([["ok", null, 1, null, null, null, null, null, null, null, "c"]]), null, null, null, "generic"],
    ]);
    server.use(
      http.post(`${BASE_URL}${QUERY_PATH}`, () =>
        HttpResponse.text(`)]}'\n\n${body.length}\n${body}`, {
          headers: [
            ["Set-Cookie", "SID=fresh-sid; Path=/"],
            ["Set-Cookie", "HSID=fresh-hsid; Path=/"],
          ],
        }),
      ),
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, () => new HttpResponse(null, { status: 404 })),
      http.get(`${BASE_URL}`, () => HttpResponse.text("<html></html>")),
    );

    const authMod = await import("../auth.js");
    await new NotebookLMClient(tokens).query("n1", "q");
    expect(authMod.saveTokens).toHaveBeenCalled();
  });

  it("maps AbortError to timeout error", async () => {
    server.use(
      http.post(`${BASE_URL}${QUERY_PATH}`, async () => {
        // Never responds within a tick — force the client to abort.
        await new Promise((r) => setTimeout(r, 500));
        return HttpResponse.text("");
      }),
      http.get(`${BASE_URL}`, () => HttpResponse.text("<html></html>")),
    );
    const c = new NotebookLMClient(tokens, 10); // 10 ms timeout
    await expect(c.query("n1", "q")).rejects.toThrow(/timed out/);
  });
});

describe("research RPCs", () => {
  it("startResearch fast mode", async () => {
    mockBatchexecute({ [RPC_IDS.START_FAST_RESEARCH]: ["t-fast"] });
    const r = await new NotebookLMClient(tokens).startResearch("n1", "q", "web", "fast");
    expect(r.taskId).toBeDefined();
  });

  it("startResearch deep mode", async () => {
    mockBatchexecute({ [RPC_IDS.START_DEEP_RESEARCH]: ["t-deep"] });
    const r = await new NotebookLMClient(tokens).startResearch("n1", "q", "web", "deep");
    expect(r.taskId).toBeDefined();
  });

  it("pollResearch maps statuses and sources", async () => {
    // Shape: task = [task_id, taskInfo]. taskInfo[3] = [sourcesArray, summary].
    mockBatchexecute({
      [RPC_IDS.POLL_RESEARCH]: [[
        [
          "task-1",
          [
            null,
            ["original query"],
            null,
            [
              [
                ["https://x", "Title", "desc", 1],
                [null, "No URL", null, 2],
              ],
              "summary body",
            ],
            2, // status
          ],
        ],
        [
          "task-2",
          [null, ["q2"], null, [[], null], 1],
        ],
        "not-array",
      ]],
    });
    const results = await new NotebookLMClient(tokens).pollResearch("n1");
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe("completed");
    expect(results[0].sources[0].url).toBe("https://x");
    expect(results[0].summary).toBe("summary body");
    expect(results[1].status).toBe("in_progress");
  });

  it("pollResearch filters by task_id", async () => {
    mockBatchexecute({
      [RPC_IDS.POLL_RESEARCH]: [[
        ["task-1", [null, ["q"], null, [[], null], 2]],
        ["task-2", [null, ["q"], null, [[], null], 2]],
      ]],
    });
    const results = await new NotebookLMClient(tokens).pollResearch("n1", "task-2");
    expect(results).toHaveLength(1);
    expect(results[0].task_id).toBe("task-2");
  });

  it("pollResearch returns empty when malformed", async () => {
    mockBatchexecute({ [RPC_IDS.POLL_RESEARCH]: [null] });
    expect(await new NotebookLMClient(tokens).pollResearch("n1")).toEqual([]);
  });

  it("importResearch forwards indices", async () => {
    mockBatchexecute({ [RPC_IDS.IMPORT_RESEARCH]: [] });
    await expect(
      new NotebookLMClient(tokens).importResearch("n1", "t1", [0, 2]),
    ).resolves.toBeUndefined();
  });

  it("importResearch defaults indices to null when omitted", async () => {
    mockBatchexecute({ [RPC_IDS.IMPORT_RESEARCH]: [] });
    await expect(
      new NotebookLMClient(tokens).importResearch("n1", "t1"),
    ).resolves.toBeUndefined();
  });

  it("startResearch fast mode defaults taskId to empty when API returns []", async () => {
    mockBatchexecute({ [RPC_IDS.START_FAST_RESEARCH]: [] });
    const r = await new NotebookLMClient(tokens).startResearch("n1", "q", "web", "fast");
    expect(r.taskId).toBe("");
  });

  it("pollResearch applies defensive fallbacks for missing fields", async () => {
    mockBatchexecute({
      [RPC_IDS.POLL_RESEARCH]: [[
        ["task-x", [
          null,
          null, // query missing → ""
          null,
          [[ [null, null, null, null] ], null], // source with no title / no type code
          99, // unknown status → statusMap fallback "in_progress"
        ]],
      ]],
    });
    const results = await new NotebookLMClient(tokens).pollResearch("n1");
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("in_progress");
    expect(results[0].query).toBe("");
    expect(results[0].sources[0].title).toBe("");
  });

  it("pollResearch skips non-array source rows", async () => {
    mockBatchexecute({
      [RPC_IDS.POLL_RESEARCH]: [[
        ["task-y", [
          null,
          ["q"],
          null,
          [["not-an-array-source", ["https://x", "Title", "desc", 1]], null],
          2,
        ]],
      ]],
    });
    const r = await new NotebookLMClient(tokens).pollResearch("n1");
    expect(r[0].sources).toHaveLength(1);
    expect(r[0].sources[0].url).toBe("https://x");
  });
});

describe("studio create RPCs", () => {
  it.each([
    ["createAudioOverview", {}],
    ["createVideoOverview", {}],
    ["createInfographic", {}],
    ["createSlideDeck", {}],
    ["createFlashcards", "easy"],
  ] as const)("%s returns artifact id", async (method, extra) => {
    mockBatchexecute({ [RPC_IDS.CREATE_STUDIO]: ["art"] });
    const c = new NotebookLMClient(tokens);
    const id = await (c as any)[method]("n1", ["s1"], extra);
    expect(id).toBe("art");
  });

  it("createReport uses custom prompt when format=Create Your Own", async () => {
    const captured = mockBatchexecute({ [RPC_IDS.CREATE_STUDIO]: ["art"] });
    await new NotebookLMClient(tokens).createReport("n1", ["s1"], {
      report_format: "Create Your Own",
      custom_prompt: "my-prompt",
    });
    const call = captured.find((c) => c.rpcId === RPC_IDS.CREATE_STUDIO)!;
    expect(call.body).toContain("my-prompt");
  });

  it("createReport falls back to Briefing Doc on unknown format", async () => {
    mockBatchexecute({ [RPC_IDS.CREATE_STUDIO]: ["art"] });
    const id = await new NotebookLMClient(tokens).createReport("n1", ["s1"], {
      report_format: "Not A Real Format",
    });
    expect(id).toBe("art");
  });

  it("createReport uses empty custom_prompt fallback when 'Create Your Own' selected without prompt", async () => {
    mockBatchexecute({ [RPC_IDS.CREATE_STUDIO]: ["art"] });
    const id = await new NotebookLMClient(tokens).createReport("n1", ["s1"], {
      report_format: "Create Your Own",
    });
    expect(id).toBe("art");
  });

  it.each([
    "createAudioOverview",
    "createVideoOverview",
    "createInfographic",
    "createSlideDeck",
    "createFlashcards",
    "createReport",
  ] as const)("%s defaults to empty string when RPC returns []", async (method) => {
    mockBatchexecute({ [RPC_IDS.CREATE_STUDIO]: [] });
    const c = new NotebookLMClient(tokens);
    const id = await (c as any)[method]("n1", ["s1"]);
    expect(id).toBe("");
  });

  it("createQuiz defaults to empty string when RPC returns []", async () => {
    mockBatchexecute({ [RPC_IDS.CREATE_STUDIO]: [] });
    const id = await new NotebookLMClient(tokens).createQuiz("n1", ["s1"]);
    expect(id).toBe("");
  });

  it("createQuiz passes question_count", async () => {
    mockBatchexecute({ [RPC_IDS.CREATE_STUDIO]: ["art"] });
    const id = await new NotebookLMClient(tokens).createQuiz("n1", ["s1"], 7, "hard");
    expect(id).toBe("art");
  });

  it("pollStudio parses artifacts and status codes", async () => {
    mockBatchexecute({
      [RPC_IDS.POLL_STUDIO]: [[
        ["a1", "T", 1, null, 3, "http://dl/a1"],
        ["a2", "T", 3, null, 2, null],
        ["a3", "T", 9, null, 99, null],
        "not-array",
      ]],
    });
    const arts = await new NotebookLMClient(tokens).pollStudio("n1");
    expect(arts).toHaveLength(3);
    expect(arts[0].status).toBe("completed");
    expect(arts[0].download_url).toBe("http://dl/a1");
    expect(arts[1].status).toBe("generating");
    expect(arts[2].status).toBe("pending");
  });

  it("pollStudio returns empty for non-array response", async () => {
    mockBatchexecute({ [RPC_IDS.POLL_STUDIO]: "not-array" as any });
    expect(await new NotebookLMClient(tokens).pollStudio("n1")).toEqual([]);
  });

  it("pollStudio applies item-level defensive fallbacks", async () => {
    // Top-level data[0] is NOT an array (string) → items = data branch fires.
    // Items have null id / null type → "" / 'unknown' / null fallbacks fire.
    mockBatchexecute({
      [RPC_IDS.POLL_STUDIO]: [
        "scalar-not-array",
        [null, "T", null, null, null, null],
      ],
    });
    const arts = await new NotebookLMClient(tokens).pollStudio("n1");
    expect(arts).toHaveLength(1);
    expect(arts[0].id).toBe("");
    expect(arts[0].download_url).toBeNull();
  });

});

describe("refresh", () => {
  it("refreshAuth fetches page and extracts tokens", async () => {
    mockBatchexecute();
    const c = new NotebookLMClient({ ...tokens, csrf_token: "", session_id: "" });
    await expect(c.refreshAuth()).resolves.toBeUndefined();
  });

  it("refreshAuth logs warnings when CSRF/SID extraction returns null", async () => {
    const authMod = await import("../auth.js");
    (authMod.extractCsrfFromPage as any).mockReturnValueOnce(null);
    (authMod.extractSessionIdFromPage as any).mockReturnValueOnce(null);
    mockBatchexecute();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = new NotebookLMClient({ ...tokens, csrf_token: "", session_id: "" });
    await c.refreshAuth();
    const logged = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toMatch(/Failed to extract CSRF token/);
    expect(logged).toMatch(/Failed to extract Session ID/);
    errSpy.mockRestore();
  });

  it("query triggers refreshAuthTokens when csrfToken/sessionId initially empty", async () => {
    const queryBody = `)]}'\n\n${JSON.stringify([
      ["wrb.fr", "q", JSON.stringify([["A", null, 1, null, null, null, null, null, null, null, "c"]]), null, null, null, "generic"],
    ]).length}\n${JSON.stringify([
      ["wrb.fr", "q", JSON.stringify([["A", null, 1, null, null, null, null, null, null, null, "c"]]), null, null, null, "generic"],
    ])}`;
    mockBatchexecute({}, { queryBody });
    const authMod = await import("../auth.js");
    const c = new NotebookLMClient({ ...tokens, csrf_token: "", session_id: "" });
    const r = await c.query("nb-1", "ask");
    expect(r.answer).toBe("A");
    // refreshAuthTokens must have parsed the landing page at least once.
    expect(authMod.extractCsrfFromPage).toHaveBeenCalled();
  });

  it("execute() triggers refreshAuthTokens when csrf/session initially empty", async () => {
    mockBatchexecute({ [RPC_IDS.LIST_NOTEBOOKS]: null });
    const authMod = await import("../auth.js");
    (authMod.extractCsrfFromPage as any).mockClear();
    const c = new NotebookLMClient({ ...tokens, csrf_token: "", session_id: "" });
    await c.listNotebooks();
    expect(authMod.extractCsrfFromPage).toHaveBeenCalled();
  });

  it("extractRpcResult tolerates non-array chunks and non-array items", async () => {
    server.use(
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, () => {
        // Emit multiple framed envelopes: a scalar chunk, a chunk with a non-array item,
        // an item that's too short, and finally the real success bundle.
        const successBundle = JSON.stringify([
          ["wrb.fr", RPC_IDS.LIST_NOTEBOOKS, JSON.stringify([[["NB-Title", [], "nb-x", null, null, [1, false, 8, null, null, null, null, null, [1], null, null, [1]]]]]), null, null, null, "generic"],
        ]);
        const scalarChunk = JSON.stringify("scalar");
        const chunkWithBadItem = JSON.stringify(["non-array-item"]);
        const chunkWithShortItem = JSON.stringify([["wrb.fr"]]); // length < 3
        const bodyText = [scalarChunk, chunkWithBadItem, chunkWithShortItem, successBundle]
          .map((s) => `${s.length}\n${s}`)
          .join("\n");
        const body = `)]}'\n\n${bodyText}`;
        return HttpResponse.text(body);
      }),
      http.get(`${BASE_URL}`, () => HttpResponse.text("<html></html>")),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await new NotebookLMClient(tokens).listNotebooks();
    expect(out).toHaveLength(1);
    warn.mockRestore();
  });

  it("extractRpcResult records af.httprm session id when present in response", async () => {
    // Hand-craft a response where the envelope includes an af.httprm item
    // that should trigger AuthState.recordSessionId.
    server.use(
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, () => {
        const payload = [
          ["af.httprm", null, "new-session-from-google"],
          [
            "wrb.fr",
            RPC_IDS.LIST_NOTEBOOKS,
            JSON.stringify([[["Notebook", [], "nb-x", null, null, [1, false, 8, null, null, null, null, null, [1], null, null, [1]]]]]),
            null, null, null, "generic",
          ],
        ];
        const json = JSON.stringify(payload);
        return HttpResponse.text(`)]}'\n\n${json.length}\n${json}`);
      }),
      http.get(`${BASE_URL}`, () => HttpResponse.text("<html></html>")),
    );
    const authMod = await import("../auth.js");
    (authMod.saveTokens as any).mockClear();
    const c = new NotebookLMClient(tokens);
    const out = await c.listNotebooks();
    expect(out).toHaveLength(1);
    // saveTokens runs as part of AuthState.recordSessionId persistence.
    expect(authMod.saveTokens).toHaveBeenCalled();
  });

  it("extractRpcResult returns raw string when wrb.fr payload is not valid JSON", async () => {
    server.use(
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, () => {
        // resultStr is a non-JSON string — the catch branch returns it raw.
        const payload = [["wrb.fr", RPC_IDS.GET_SUMMARY, "raw-not-json", null, null, null, "generic"]];
        const json = JSON.stringify(payload);
        return HttpResponse.text(`)]}'\n\n${json.length}\n${json}`);
      }),
      http.get(`${BASE_URL}`, () => HttpResponse.text("<html></html>")),
    );
    const c = new NotebookLMClient(tokens);
    // describeNotebook returns data?.[0] || "" from the parsed result;
    // when result is the raw string "raw-not-json", data[0] is "r".
    const out = await c.describeNotebook("n1");
    expect(out).toBe("r");
  });

  it("extractRpcResult returns null when no wrb.fr envelope matches", async () => {
    server.use(
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, () => {
        // No wrb.fr item at all — extractRpcResult should fall through to return null.
        const json = JSON.stringify([[["wrb.fr", "different.rpc.id", "{}", null, null, null, "generic"]]]);
        return HttpResponse.text(`)]}'\n\n${json.length}\n${json}`);
      }),
      http.get(`${BASE_URL}`, () => HttpResponse.text("<html></html>")),
    );
    const c = new NotebookLMClient(tokens);
    const out = await c.listNotebooks();
    expect(out).toEqual([]);
  });

  it("extractRpcResult returns non-string resultStr unchanged (line 100)", async () => {
    server.use(
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, () => {
        // resultStr is null (not a string) — the function returns it directly.
        const payload = [["wrb.fr", RPC_IDS.LIST_NOTEBOOKS, null, null, null, null, "generic"]];
        const json = JSON.stringify(payload);
        return HttpResponse.text(`)]}'\n\n${json.length}\n${json}`);
      }),
      http.get(`${BASE_URL}`, () => HttpResponse.text("<html></html>")),
    );
    const c = new NotebookLMClient(tokens);
    const out = await c.listNotebooks();
    expect(out).toEqual([]);
  });

  it("query body omits at= and f.sid= when AuthState has no csrf/sid", async () => {
    const authMod = await import("../auth.js");
    // After refreshAuthTokens, both extracts return null → state stays empty.
    (authMod.extractCsrfFromPage as any).mockReturnValueOnce(null);
    (authMod.extractSessionIdFromPage as any).mockReturnValueOnce(null);

    let capturedBody = "";
    const okBody = JSON.stringify([
      ["wrb.fr", "q", JSON.stringify([["ans", null, 1, null, null, null, null, null, null, null, "c"]]), null, null, null, "generic"],
    ]);
    server.use(
      http.post(`${BASE_URL}${QUERY_PATH}`, async ({ request }) => {
        capturedBody = await request.text();
        return HttpResponse.text(`)]}'\n\n${okBody.length}\n${okBody}`);
      }),
      http.get(`${BASE_URL}`, () => HttpResponse.text("<html></html>")),
    );
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = new NotebookLMClient({ ...tokens, csrf_token: "", session_id: "" });
    await c.query("nb-1", "ask");
    expect(capturedBody.startsWith("f.req=")).toBe(true);
    expect(capturedBody).not.toContain("at=");
    expect(capturedBody).not.toContain("f.sid=");
    errSpy.mockRestore();
  });

  it("query rethrows non-auth, non-abort errors directly", async () => {
    server.use(
      http.post(`${BASE_URL}${QUERY_PATH}`, () =>
        // 500 surfaces as a thrown Error (not AuthenticationError, not AbortError).
        new HttpResponse(null, { status: 500, statusText: "Server Error" }),
      ),
      http.get(`${BASE_URL}`, () => HttpResponse.text("<html></html>")),
    );
    const c = new NotebookLMClient(tokens);
    await expect(c.query("nb-1", "ask")).rejects.toThrow(/HTTP 500/);
  });

  it("query tolerates non-array chunks / items / non-wrb.fr items in the response", async () => {
    // Hand-craft a parsed response with multiple defensive branches:
    //  - one non-array chunk (parseResponse returns it from a stray JSON line)
    //  - one chunk containing a non-array item
    //  - one wrb.fr item with non-string resultStr (number)
    //  - one wrb.fr item with non-JSON resultStr (parse throws)
    //  - one wrb.fr item with a short answer (shorter than bestAnswer)
    //  - one wrb.fr item whose data shape is array-but-data[0]-not-array
    //  - the final wrb.fr item carries the longest answer + convId.
    const okPayload = JSON.stringify([
      ["short", null, 1, null, null, null, null, null, null, null, "conv-final"],
    ]);
    const wrbBundles = [
      "non-array-chunk",
      [["not-an-item-array"]],
      [["af.httprm", null, "ignored-by-query"]], // non-wrb.fr item — query loop should skip
      [["wrb.fr", "q", 12345, null, null, null, "generic"]],
      [["wrb.fr", "q", "not-valid-json{", null, null, null, "generic"]],
      [["wrb.fr", "q", JSON.stringify("scalar-shape"), null, null, null, "generic"]],
      [["wrb.fr", "q", JSON.stringify([["x", null, 1, null, null, null, null, null, null, null, null]]), null, null, null, "generic"]],
      [["wrb.fr", "q", JSON.stringify([["longest-answer", null, 1, null, null, null, null, null, null, null, "conv-final"]]), null, null, null, "generic"]],
      [["wrb.fr", "q", okPayload, null, null, null, "generic"]],
    ];
    // Frame each bundle individually so parseResponse emits separate chunks.
    const framed = wrbBundles
      .map((b) => {
        const json = JSON.stringify(b);
        return `${json.length}\n${json}`;
      })
      .join("\n");
    const body = `)]}'\n\n${framed}`;
    server.use(
      http.post(`${BASE_URL}${QUERY_PATH}`, () => HttpResponse.text(body)),
      http.get(`${BASE_URL}`, () => HttpResponse.text("<html></html>")),
    );
    // Silence parseResponse's warn on the non-array chunk.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await new NotebookLMClient(tokens).query("nb-1", "ask");
    expect(r.answer).toBe("longest-answer");
    warn.mockRestore();
  });

  it("query does NOT record history when convId is present but answer is empty", async () => {
    // Answer="" means bestAnswer never updates → `if (convId && bestAnswer)` is false.
    const body = `)]}'\n\n${(() => {
      const bundle = JSON.stringify([
        ["wrb.fr", "q", JSON.stringify([["", null, 1, null, null, null, null, null, null, null, "conv-zero"]]), null, null, null, "generic"],
      ]);
      return `${bundle.length}\n${bundle}`;
    })()}`;
    server.use(
      http.post(`${BASE_URL}${QUERY_PATH}`, () => HttpResponse.text(body)),
      http.get(`${BASE_URL}`, () => HttpResponse.text("<html></html>")),
    );
    const c = new NotebookLMClient(tokens);
    const r = await c.query("nb-1", "ask");
    expect(r.answer).toBe("");
    // conversation_id is still surfaced from inner[10].
    expect(r.conversation_id).toBe("conv-zero");
  });

  it("query reuses prior conversation history when conversationId provided", async () => {
    // First turn populates the history map; the second turn re-uses it.
    const buildBody = (answer: string, conv: string) => {
      const bundle = JSON.stringify([
        ["wrb.fr", "q", JSON.stringify([[answer, null, 1, null, null, null, null, null, null, null, conv]]), null, null, null, "generic"],
      ]);
      return `)]}'\n\n${bundle.length}\n${bundle}`;
    };
    let turn = 0;
    server.use(
      http.post(`${BASE_URL}${QUERY_PATH}`, () => {
        turn++;
        return HttpResponse.text(buildBody(turn === 1 ? "first" : "second", "conv-keep"));
      }),
      http.get(`${BASE_URL}`, () => HttpResponse.text("<html></html>")),
    );
    const c = new NotebookLMClient(tokens);
    const r1 = await c.query("nb-1", "q1");
    const r2 = await c.query("nb-1", "q2", undefined, r1.conversation_id ?? undefined);
    expect(r2.answer).toBe("second");
  });
});

describe("error + auth paths", () => {
  it("execute throws on non-16 error code", async () => {
    mockBatchexecute({}, { errors: { [RPC_IDS.DELETE_NOTEBOOK]: [400] } });
    await expect(new NotebookLMClient(tokens).deleteNotebook("n1")).rejects.toThrow(
      /failed with error code/,
    );
  });

  it("execute retries on code 16 using cached tokens when fresher on disk", async () => {
    const authMod = await import("../auth.js");
    const calls = { count: 0 };
    server.use(
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, ({ request }) => {
        const url = new URL(request.url);
        const rpcId = url.searchParams.get("rpcids") ?? "";
        if (rpcId === RPC_IDS.LIST_NOTEBOOKS) {
          calls.count++;
          if (calls.count === 1) {
            return HttpResponse.text(encodeBatchexecute(rpcId, null, [16]));
          }
          return HttpResponse.text(encodeBatchexecute(rpcId, [[]]));
        }
        if (rpcId === RPC_IDS.SETTINGS) return HttpResponse.text(encodeBatchexecute(rpcId, [null, 1]));
        return new HttpResponse(null, { status: 404 });
      }),
      http.get(`${BASE_URL}`, () => HttpResponse.text("<html></html>")),
    );
    (authMod.loadTokensFromCache as any).mockReturnValueOnce({
      cookies: tokens.cookies,
      csrf_token: "newer",
      session_id: "newer",
      extracted_at: Date.now() / 1000 + 100,
    });

    const c = new NotebookLMClient(tokens);
    await expect(c.listNotebooks()).resolves.toEqual([]);
    expect(calls.count).toBeGreaterThanOrEqual(2);
  });

  it("execute falls back to runBrowserAuthFlow when headless refresh throws", async () => {
    (refreshCookiesHeadless as any).mockRejectedValue(new Error("nope"));
    (runBrowserAuthFlow as any).mockResolvedValue({
      cookies: tokens.cookies,
      csrf_token: "fallback-csrf",
      session_id: "fallback-sid",
      extracted_at: Date.now() / 1000 + 100,
    });

    const calls = { count: 0 };
    server.use(
      http.post(`${BASE_URL}${BATCHEXECUTE_PATH}`, ({ request }) => {
        const url = new URL(request.url);
        const rpcId = url.searchParams.get("rpcids") ?? "";
        if (rpcId === RPC_IDS.LIST_NOTEBOOKS) {
          calls.count++;
          if (calls.count === 1) return HttpResponse.text(encodeBatchexecute(rpcId, null, [16]));
          return HttpResponse.text(encodeBatchexecute(rpcId, [[]]));
        }
        if (rpcId === RPC_IDS.SETTINGS) return HttpResponse.text(encodeBatchexecute(rpcId, [null, 1]));
        return new HttpResponse(null, { status: 404 });
      }),
      http.get(`${BASE_URL}`, () => HttpResponse.text("<html></html>")),
    );

    const c = new NotebookLMClient(tokens);
    await expect(c.listNotebooks()).resolves.toEqual([]);
    expect(runBrowserAuthFlow).toHaveBeenCalled();
  });

  it("AuthenticationError constructor sets name", () => {
    const e = new AuthenticationError("x");
    expect(e.name).toBe("AuthenticationError");
    expect(e.message).toBe("x");
  });
});

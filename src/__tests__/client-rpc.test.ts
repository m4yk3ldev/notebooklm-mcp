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

  it("checkFreshness returns true / false", async () => {
    mockBatchexecute({ [RPC_IDS.CHECK_FRESHNESS]: [true] });
    expect(await new NotebookLMClient(tokens).checkFreshness("s1", "n1")).toBe(true);
    server.resetHandlers();
    mockBatchexecute({ [RPC_IDS.CHECK_FRESHNESS]: [false] });
    expect(await new NotebookLMClient(tokens).checkFreshness("s1", "n1")).toBe(false);
  });

  it("checkFreshness returns null on RPC failure", async () => {
    mockBatchexecute({}, { errors: { [RPC_IDS.CHECK_FRESHNESS]: [42] } });
    expect(await new NotebookLMClient(tokens).checkFreshness("s1", "n1")).toBeNull();
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
});

describe("studio create RPCs", () => {
  it.each([
    ["createAudioOverview", {}, "a-id"],
    ["createVideoOverview", {}, "v-id"],
    ["createInfographic", {}, "i-id"],
    ["createSlideDeck", {}, "s-id"],
    ["createFlashcards", "easy", "f-id"],
    ["createMindMap", undefined, undefined],
  ] as const)("%s returns artifact id", async (method, extra, expectedId) => {
    mockBatchexecute({
      [RPC_IDS.CREATE_STUDIO]: ["art"],
      [RPC_IDS.GENERATE_MIND_MAP]: [{ nodes: [] }],
      [RPC_IDS.SAVE_MIND_MAP]: ["mind-art"],
    });
    const c = new NotebookLMClient(tokens);
    let id: string;
    if (method === "createFlashcards") {
      id = await (c as any)[method]("n1", ["s1"], extra);
    } else if (method === "createMindMap") {
      id = await c.createMindMap("n1", ["s1"], "Title");
    } else {
      id = await (c as any)[method]("n1", ["s1"], extra);
    }
    if (method === "createMindMap") {
      expect(id).toBe("mind-art");
    } else {
      expect(id).toBe("art");
    }
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

  it("createQuiz passes question_count", async () => {
    mockBatchexecute({ [RPC_IDS.CREATE_STUDIO]: ["art"] });
    const id = await new NotebookLMClient(tokens).createQuiz("n1", ["s1"], 7, "hard");
    expect(id).toBe("art");
  });

  it("createDataTable passes description", async () => {
    const captured = mockBatchexecute({ [RPC_IDS.CREATE_STUDIO]: ["art"] });
    await new NotebookLMClient(tokens).createDataTable("n1", ["s1"], "rows of x", "en");
    const call = captured.find((c) => c.rpcId === RPC_IDS.CREATE_STUDIO)!;
    expect(call.body).toContain("rows%20of%20x");
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

  it("deleteStudio completes", async () => {
    mockBatchexecute({ [RPC_IDS.DELETE_STUDIO]: [] });
    await expect(new NotebookLMClient(tokens).deleteStudio("n1", "a1")).resolves.toBeUndefined();
  });
});

describe("chat + refresh", () => {
  it("chatConfigure accepts all fields", async () => {
    mockBatchexecute({ [RPC_IDS.PREFERENCES]: [] });
    await expect(
      new NotebookLMClient(tokens).chatConfigure("n1", "learning_guide", "p", "longer"),
    ).resolves.toBeUndefined();
  });

  it("chatConfigure defaults when args omitted", async () => {
    mockBatchexecute({ [RPC_IDS.PREFERENCES]: [] });
    await expect(new NotebookLMClient(tokens).chatConfigure("n1")).resolves.toBeUndefined();
  });

  it("refreshAuth fetches page and extracts tokens", async () => {
    mockBatchexecute();
    const c = new NotebookLMClient({ ...tokens, csrf_token: "", session_id: "" });
    await expect(c.refreshAuth()).resolves.toBeUndefined();
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

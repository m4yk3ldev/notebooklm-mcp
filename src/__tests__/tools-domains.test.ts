import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { notebookTools } from "../tools/notebook.js";
import { sourceTools } from "../tools/source.js";
import { studioTools } from "../tools/studio.js";
import { queryTools } from "../tools/query.js";
import { researchTools } from "../tools/research.js";
import { authTools } from "../tools/auth.js";

vi.mock("../auth.js", () => ({ saveTokens: vi.fn() }));
import { saveTokens } from "../auth.js";

function findTool(list: any[], name: string) {
  const tool = list.find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} not found`);
  return tool;
}

function noopOpts() {
  return { queryTimeout: undefined };
}

describe("notebookTools", () => {
  it("notebook_list calls client.listNotebooks with limit", async () => {
    const client = { listNotebooks: vi.fn().mockResolvedValue([{ id: "n1" }]) };
    const result = await findTool(notebookTools, "notebook_list").execute(
      client,
      { max_results: 10 },
      noopOpts(),
    );
    expect(client.listNotebooks).toHaveBeenCalledWith(10);
    expect(result).toEqual({ notebooks: [{ id: "n1" }], count: 1 });
  });

  it("notebook_create calls createNotebook", async () => {
    const client = { createNotebook: vi.fn().mockResolvedValue({ id: "n1", title: "T" }) };
    const result = await findTool(notebookTools, "notebook_create").execute(
      client,
      { title: "T" },
      noopOpts(),
    );
    expect(client.createNotebook).toHaveBeenCalledWith("T");
    expect(result.notebook.title).toBe("T");
  });

  it("notebook_delete returns pending_confirmation when confirm=false", async () => {
    const client = { deleteNotebook: vi.fn() };
    const result = await findTool(notebookTools, "notebook_delete").execute(
      client,
      { notebook_id: "n1", confirm: false },
      noopOpts(),
    );
    expect(client.deleteNotebook).not.toHaveBeenCalled();
    expect(result.status).toBe("pending_confirmation");
  });

  it("notebook_delete calls deleteNotebook when confirm=true", async () => {
    const client = { deleteNotebook: vi.fn().mockResolvedValue(undefined) };
    const result = await findTool(notebookTools, "notebook_delete").execute(
      client,
      { notebook_id: "n1", confirm: true },
      noopOpts(),
    );
    expect(client.deleteNotebook).toHaveBeenCalledWith("n1");
    expect(result.message).toBe("Notebook deleted");
  });

  it("notebook_rename calls renameNotebook", async () => {
    const client = { renameNotebook: vi.fn().mockResolvedValue(undefined) };
    const result = await findTool(notebookTools, "notebook_rename").execute(
      client,
      { notebook_id: "n1", new_title: "X" },
      noopOpts(),
    );
    expect(client.renameNotebook).toHaveBeenCalledWith("n1", "X");
    expect(result.message).toContain("X");
  });

  it("notebook_get and notebook_describe pass through", async () => {
    const client = {
      getNotebook: vi.fn().mockResolvedValue({ id: "n1", sources: [] }),
      describeNotebook: vi.fn().mockResolvedValue("summary text"),
    };
    const gotten = await findTool(notebookTools, "notebook_get").execute(
      client,
      { notebook_id: "n1" },
      noopOpts(),
    );
    const described = await findTool(notebookTools, "notebook_describe").execute(
      client,
      { notebook_id: "n1" },
      noopOpts(),
    );
    expect(gotten.notebook.id).toBe("n1");
    expect(described.summary).toBe("summary text");
  });
});

describe("sourceTools", () => {
  it("source_describe calls getSource", async () => {
    const client = { getSource: vi.fn().mockResolvedValue({ id: "s1", content: "c" }) };
    const result = await findTool(sourceTools, "source_describe").execute(
      client,
      { notebook_id: "n1", source_id: "s1" },
      noopOpts(),
    );
    expect(client.getSource).toHaveBeenCalledWith("s1", "n1");
    expect(result.source.id).toBe("s1");
  });

  it("source_get_content returns text from source", async () => {
    const client = { getSource: vi.fn().mockResolvedValue({ id: "s1", content: "body" }) };
    const result = await findTool(sourceTools, "source_get_content").execute(
      client,
      { notebook_id: "n1", source_id: "s1" },
      noopOpts(),
    );
    expect(result.text).toBe("body");
  });

  it("notebook_add_url calls addUrlSource", async () => {
    const client = { addUrlSource: vi.fn().mockResolvedValue(undefined) };
    const result = await findTool(sourceTools, "notebook_add_url").execute(
      client,
      { notebook_id: "n1", url: "https://x" },
      noopOpts(),
    );
    expect(client.addUrlSource).toHaveBeenCalledWith("n1", "https://x");
    expect(result.message).toBe("URL source added");
  });

  describe("notebook_add_text", () => {
    let tempDir: string;
    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "notebooklm-add-text-"));
    });
    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("uses inline content when provided", async () => {
      const client = { addTextSource: vi.fn().mockResolvedValue(undefined) };
      await findTool(sourceTools, "notebook_add_text").execute(
        client,
        { notebook_id: "n1", content: "hello", title: "T" },
        noopOpts(),
      );
      expect(client.addTextSource).toHaveBeenCalledWith("n1", "hello", "T");
    });

    it("reads content from file_path when content omitted", async () => {
      const filePath = join(tempDir, "src.txt");
      writeFileSync(filePath, "from-file");
      const client = { addTextSource: vi.fn().mockResolvedValue(undefined) };
      await findTool(sourceTools, "notebook_add_text").execute(
        client,
        { notebook_id: "n1", file_path: filePath, title: "T" },
        noopOpts(),
      );
      expect(client.addTextSource).toHaveBeenCalledWith("n1", "from-file", "T");
    });

    it("throws when neither content nor file_path given", async () => {
      const client = { addTextSource: vi.fn() };
      await expect(
        findTool(sourceTools, "notebook_add_text").execute(
          client,
          { notebook_id: "n1", title: "T" },
          noopOpts(),
        ),
      ).rejects.toThrow(/content or file_path/);
    });

    it("rejects file_path outside cwd and tmpdir (path traversal)", async () => {
      const client = { addTextSource: vi.fn() };
      // /etc/passwd is outside both cwd and tmpdir on every test host.
      await expect(
        findTool(sourceTools, "notebook_add_text").execute(
          client,
          { notebook_id: "n1", file_path: "/etc/passwd", title: "T" },
          noopOpts(),
        ),
      ).rejects.toThrow(/outside the allowed roots/);
      expect(client.addTextSource).not.toHaveBeenCalled();
    });

    it("rejects relative traversal that escapes cwd", async () => {
      const client = { addTextSource: vi.fn() };
      await expect(
        findTool(sourceTools, "notebook_add_text").execute(
          client,
          {
            notebook_id: "n1",
            file_path: "../../../../etc/shadow",
            title: "T",
          },
          noopOpts(),
        ),
      ).rejects.toThrow(/outside the allowed roots/);
      expect(client.addTextSource).not.toHaveBeenCalled();
    });

    it("accepts file_path under tmpdir", async () => {
      // tempDir already lives under tmpdir() via the suite's beforeEach.
      const filePath = join(tempDir, "src.txt");
      writeFileSync(filePath, "from-tmp");
      const client = { addTextSource: vi.fn().mockResolvedValue(undefined) };
      await findTool(sourceTools, "notebook_add_text").execute(
        client,
        { notebook_id: "n1", file_path: filePath, title: "T" },
        noopOpts(),
      );
      expect(client.addTextSource).toHaveBeenCalledWith("n1", "from-tmp", "T");
    });
  });

  it("notebook_add_drive calls addDriveSource with all args", async () => {
    const client = { addDriveSource: vi.fn().mockResolvedValue(undefined) };
    await findTool(sourceTools, "notebook_add_drive").execute(
      client,
      {
        notebook_id: "n1",
        file_id: "f1",
        title: "T",
        doc_type: "application/vnd.google-apps.document",
      },
      noopOpts(),
    );
    expect(client.addDriveSource).toHaveBeenCalledWith(
      "n1",
      "f1",
      "T",
      "application/vnd.google-apps.document",
    );
  });

  it("source_list_drive checks freshness for each source", async () => {
    const client = {
      getNotebook: vi
        .fn()
        .mockResolvedValue({ sources: [{ id: "s1" }, { id: "s2" }] }),
      checkFreshness: vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false),
    };
    const result = await findTool(sourceTools, "source_list_drive").execute(
      client,
      { notebook_id: "n1" },
      noopOpts(),
    );
    expect(client.checkFreshness).toHaveBeenCalledTimes(2);
    expect(result.sources).toEqual([
      { id: "s1", is_fresh: true },
      { id: "s2", is_fresh: false },
    ]);
  });

  it("source_sync_drive gates on confirm", async () => {
    const client = { syncDrive: vi.fn() };
    const result = await findTool(sourceTools, "source_sync_drive").execute(
      client,
      { notebook_id: "n1", source_ids: ["s1"], confirm: false },
      noopOpts(),
    );
    expect(client.syncDrive).not.toHaveBeenCalled();
    expect(result.status).toBe("pending_confirmation");
  });

  it("source_sync_drive syncs when confirm=true", async () => {
    const client = { syncDrive: vi.fn().mockResolvedValue(undefined) };
    const result = await findTool(sourceTools, "source_sync_drive").execute(
      client,
      { notebook_id: "n1", source_ids: ["s1", "s2"], confirm: true },
      noopOpts(),
    );
    expect(client.syncDrive).toHaveBeenCalledWith(["s1", "s2"], "n1");
    expect(result.message).toContain("2 sources");
  });

  it("source_delete gates on confirm; deletes when true", async () => {
    const client = { deleteSource: vi.fn().mockResolvedValue(undefined) };
    const gated = await findTool(sourceTools, "source_delete").execute(
      client,
      { notebook_id: "n1", source_id: "s1", confirm: false },
      noopOpts(),
    );
    expect(gated.status).toBe("pending_confirmation");

    const executed = await findTool(sourceTools, "source_delete").execute(
      client,
      { notebook_id: "n1", source_id: "s1", confirm: true },
      noopOpts(),
    );
    expect(client.deleteSource).toHaveBeenCalledWith("s1", "n1");
    expect(executed.message).toBe("Source deleted");
  });
});

describe("studioTools", () => {
  it("audio_overview_create gates on confirm", async () => {
    const client = { getNotebook: vi.fn(), createAudioOverview: vi.fn() };
    const result = await findTool(studioTools, "audio_overview_create").execute(
      client,
      { notebook_id: "n1", confirm: false },
      noopOpts(),
    );
    expect(client.createAudioOverview).not.toHaveBeenCalled();
    expect(result.status).toBe("pending_confirmation");
  });

  it("audio_overview_create passes explicit source_ids through", async () => {
    const client = {
      getNotebook: vi.fn(),
      createAudioOverview: vi.fn().mockResolvedValue("art-1"),
    };
    const result = await findTool(studioTools, "audio_overview_create").execute(
      client,
      {
        notebook_id: "n1",
        source_ids: ["s1", "s2"],
        format: "podcast",
        length: "short",
        confirm: true,
      },
      noopOpts(),
    );
    expect(client.getNotebook).not.toHaveBeenCalled();
    expect(client.createAudioOverview).toHaveBeenCalledWith(
      "n1",
      ["s1", "s2"],
      expect.objectContaining({ format: "podcast", length: "short" }),
    );
    expect(result.artifact_id).toBe("art-1");
  });

  it("audio_overview_create defaults to all notebook sources when source_ids omitted", async () => {
    const client = {
      getNotebook: vi.fn().mockResolvedValue({
        sources: [{ id: "a" }, { id: "b" }],
      }),
      createAudioOverview: vi.fn().mockResolvedValue("art"),
    };
    await findTool(studioTools, "audio_overview_create").execute(
      client,
      { notebook_id: "n1", confirm: true },
      noopOpts(),
    );
    expect(client.createAudioOverview).toHaveBeenCalledWith(
      "n1",
      ["a", "b"],
      expect.any(Object),
    );
  });

  it("studio_status polls artifacts", async () => {
    const client = { pollStudio: vi.fn().mockResolvedValue([{ id: "a", ready: true }]) };
    const result = await findTool(studioTools, "studio_status").execute(
      client,
      { notebook_id: "n1" },
      noopOpts(),
    );
    expect(client.pollStudio).toHaveBeenCalledWith("n1");
    expect(result.artifacts).toHaveLength(1);
  });

  it("studio_delete gates on confirm; deletes when true", async () => {
    const client = { deleteStudio: vi.fn().mockResolvedValue(undefined) };
    const gated = await findTool(studioTools, "studio_delete").execute(
      client,
      { notebook_id: "n1", artifact_id: "a1", confirm: false },
      noopOpts(),
    );
    expect(gated.status).toBe("pending_confirmation");

    await findTool(studioTools, "studio_delete").execute(
      client,
      { notebook_id: "n1", artifact_id: "a1", confirm: true },
      noopOpts(),
    );
    expect(client.deleteStudio).toHaveBeenCalledWith("n1", "a1");
  });

  it.each([
    ["video_overview_create", "createVideoOverview"],
    ["infographic_create", "createInfographic"],
    ["slide_deck_create", "createSlideDeck"],
    ["report_create", "createReport"],
    ["mind_map_create", "createMindMap"],
  ])("%s routes to client.%s with confirm=true", async (toolName, clientMethod) => {
    const client: any = {
      getNotebook: vi.fn().mockResolvedValue({ sources: [{ id: "s" }] }),
      [clientMethod]: vi.fn().mockResolvedValue("art"),
    };
    const result = await findTool(studioTools, toolName).execute(
      client,
      { notebook_id: "n1", confirm: true },
      noopOpts(),
    );
    expect(client[clientMethod]).toHaveBeenCalled();
    expect(result.artifact_id).toBe("art");
  });

  it("flashcards_create routes through createFlashcards", async () => {
    const client = {
      getNotebook: vi.fn().mockResolvedValue({ sources: [{ id: "s" }] }),
      createFlashcards: vi.fn().mockResolvedValue("art"),
    };
    await findTool(studioTools, "flashcards_create").execute(
      client,
      { notebook_id: "n1", difficulty: "easy", confirm: true },
      noopOpts(),
    );
    expect(client.createFlashcards).toHaveBeenCalledWith("n1", ["s"], "easy");
  });

  it("quiz_create routes through createQuiz with count + difficulty", async () => {
    const client = {
      getNotebook: vi.fn().mockResolvedValue({ sources: [{ id: "s" }] }),
      createQuiz: vi.fn().mockResolvedValue("art"),
    };
    await findTool(studioTools, "quiz_create").execute(
      client,
      { notebook_id: "n1", question_count: 5, difficulty: "hard", confirm: true },
      noopOpts(),
    );
    expect(client.createQuiz).toHaveBeenCalledWith("n1", ["s"], 5, "hard");
  });

  it.each([
    "video_overview_create",
    "infographic_create",
    "slide_deck_create",
    "report_create",
    "flashcards_create",
    "quiz_create",
    "data_table_create",
    "mind_map_create",
  ])("%s gates on confirm=false", async (toolName) => {
    const client: any = { getNotebook: vi.fn() };
    const args: any = { notebook_id: "n1", confirm: false };
    if (toolName === "data_table_create") args.description = "x";
    const result = await findTool(studioTools, toolName).execute(
      client,
      args,
      noopOpts(),
    );
    expect(result.status).toBe("pending_confirmation");
  });

  it("data_table_create passes description and language", async () => {
    const client = {
      getNotebook: vi.fn().mockResolvedValue({ sources: [{ id: "s" }] }),
      createDataTable: vi.fn().mockResolvedValue("art"),
    };
    await findTool(studioTools, "data_table_create").execute(
      client,
      { notebook_id: "n1", description: "foo", language: "en", confirm: true },
      noopOpts(),
    );
    expect(client.createDataTable).toHaveBeenCalledWith("n1", ["s"], "foo", "en");
  });
});

describe("queryTools", () => {
  it("notebook_query returns answer and conversation_id", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValue({ answer: "hi", conversation_id: "c1" }),
    };
    const result = await findTool(queryTools, "notebook_query").execute(
      client,
      { notebook_id: "n1", query: "?" },
      noopOpts(),
    );
    expect(client.query).toHaveBeenCalledWith("n1", "?", undefined, undefined);
    expect(result).toEqual({ answer: "hi", conversation_id: "c1" });
  });

  it("chat_configure forwards args", async () => {
    const client = { chatConfigure: vi.fn().mockResolvedValue(undefined) };
    await findTool(queryTools, "chat_configure").execute(
      client,
      { notebook_id: "n1", goal: "learn", response_length: "long" },
      noopOpts(),
    );
    expect(client.chatConfigure).toHaveBeenCalledWith(
      "n1",
      "learn",
      undefined,
      "long",
    );
  });
});

describe("researchTools", () => {
  it("research_start returns task_id", async () => {
    const client = {
      startResearch: vi.fn().mockResolvedValue({ taskId: "t1" }),
    };
    const result = await findTool(researchTools, "research_start").execute(
      client,
      { notebook_id: "n1", query: "?", source: "web", mode: "fast" },
      noopOpts(),
    );
    expect(client.startResearch).toHaveBeenCalledWith("n1", "?", "web", "fast");
    expect(result.task_id).toBe("t1");
  });

  it("research_status polls", async () => {
    const client = {
      pollResearch: vi.fn().mockResolvedValue([{ id: "t1" }]),
    };
    const result = await findTool(researchTools, "research_status").execute(
      client,
      { notebook_id: "n1", task_id: "t1" },
      noopOpts(),
    );
    expect(client.pollResearch).toHaveBeenCalledWith("n1", "t1");
    expect(result.results).toHaveLength(1);
  });

  it("research_import forwards indices", async () => {
    const client = { importResearch: vi.fn().mockResolvedValue(undefined) };
    await findTool(researchTools, "research_import").execute(
      client,
      { notebook_id: "n1", task_id: "t1", source_indices: [0, 2] },
      noopOpts(),
    );
    expect(client.importResearch).toHaveBeenCalledWith("n1", "t1", [0, 2]);
  });
});

describe("authTools", () => {
  beforeEach(() => vi.mocked(saveTokens).mockClear());

  it("refresh_auth delegates to client.refreshAuth", async () => {
    const client = { refreshAuth: vi.fn().mockResolvedValue(undefined) };
    const result = await findTool(authTools, "refresh_auth").execute(
      client,
      {},
      noopOpts(),
    );
    expect(client.refreshAuth).toHaveBeenCalledOnce();
    expect(result.message).toContain("refreshed");
  });

  it("save_auth_tokens parses cookie string and emits _client_action=reset", async () => {
    const client = {};
    const result = await findTool(authTools, "save_auth_tokens").execute(
      client,
      {
        cookies: "SID=a; HSID=b; EXTRA=x",
        csrf_token: "csrf",
        session_id: "sid",
      },
      noopOpts(),
    );
    expect(saveTokens).toHaveBeenCalledOnce();
    const [savedTokens] = vi.mocked(saveTokens).mock.calls[0];
    expect(savedTokens.cookies).toEqual({ SID: "a", HSID: "b", EXTRA: "x" });
    expect(savedTokens.csrf_token).toBe("csrf");
    expect(savedTokens.session_id).toBe("sid");
    expect(result._client_action).toBe("reset");
  });

  it("save_auth_tokens accepts empty cookie string", async () => {
    const result = await findTool(authTools, "save_auth_tokens").execute(
      {},
      {},
      noopOpts(),
    );
    expect(saveTokens).toHaveBeenCalledOnce();
    const [savedTokens] = vi.mocked(saveTokens).mock.calls[0];
    expect(savedTokens.cookies).toEqual({});
    expect(result._client_action).toBe("reset");
  });

  it("save_auth_tokens skips cookie segments with no '=' separator", async () => {
    await findTool(authTools, "save_auth_tokens").execute(
      {},
      { cookies: "SID=a; ORPHAN; HSID=b" },
      noopOpts(),
    );
    const [savedTokens] = vi.mocked(saveTokens).mock.calls[0];
    expect(savedTokens.cookies).toEqual({ SID: "a", HSID: "b" });
    expect(savedTokens.cookies.ORPHAN).toBeUndefined();
  });
});

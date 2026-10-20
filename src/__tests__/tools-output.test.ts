import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerTools } from "../tools/index.js";
import { notebookTools } from "../tools/notebook.js";
import { sourceTools } from "../tools/source.js";
import { studioTools } from "../tools/studio.js";
import { authTools } from "../tools/auth.js";
import { queryTools } from "../tools/query.js";
import { researchTools } from "../tools/research.js";

const allTools = [...notebookTools, ...sourceTools, ...studioTools, ...authTools, ...queryTools, ...researchTools];

// auth_save_tokens writes ~/.notebooklm-mcp/auth.json; keep the test off disk.
vi.mock("../auth.js", async (orig) => ({ ...(await orig<typeof import("../auth.js")>()), saveTokens: vi.fn() }));

// Results as the client methods produce them, nulls included, so the
// published outputSchemas are checked against real shapes.
const source = { id: "s1", title: "Page", type: "web_page" };
const notebook = {
  id: "nb1",
  title: "Notes",
  emoji: null,
  sources: [source],
  is_shared: false,
  ownership: "mine",
  created_at: "2026-10-18T10:00:00.000Z",
  modified_at: null,
};
const fakeClient: Record<string, (...args: any[]) => Promise<unknown>> = {
  listNotebooks: async () => [notebook],
  createNotebook: async () => ({ ...notebook, sources: [] }),
  getNotebook: async () => notebook,
  describeNotebook: async () => ({ summary: "About things", suggested_questions: ["Why?"] }),
  renameNotebook: async () => undefined,
  deleteNotebook: async () => undefined,
  addUrlSource: async () => source,
  addTextSource: async () => ({ ...source, type: "pasted_text" }),
  addDriveSource: async () => ({ ...source, type: "google_docs" }),
  getSource: async () => ({ ...source, content: null, summary: null, keywords: [] }),
  syncDrive: async () => undefined,
  deleteSource: async () => undefined,
  query: async () => ({ answer: "Because [1].", conversation_id: null, sources_used: [] }),
  startResearch: async () => ({ taskId: "t1" }),
  pollResearch: async () => [
    {
      task_id: "t1",
      status: "completed",
      query: "q",
      summary: null,
      sources: [
        { url: "https://example.com", title: "Ex", description: null, type: "web" },
        { url: null, title: "Doc", description: "d", type: "google_doc" },
      ],
    },
  ],
  importResearch: async () => ({ requested: 1, imported: 1, skipped: 1 }),
  createAudioOverview: async () => "a1",
  createVideoOverview: async () => "a1",
  createInfographic: async () => "a1",
  createSlideDeck: async () => "a1",
  createReport: async () => "a1",
  createFlashcards: async () => "a1",
  createQuiz: async () => "a1",
  pollStudio: async () => [
    { id: "a1", type: "audio", status: "completed", download_url: "https://example.com/a.mp4" },
    { id: "a2", type: "report", status: "pending", download_url: null },
  ],
  refreshAuth: async () => undefined,
};

const COOKIES = "SID=x; HSID=x; SSID=x; APISID=x; SAPISID=x";
const args: Record<string, Record<string, unknown>> = {
  notebook_list: {},
  notebook_create: { title: "Notes" },
  notebook_get: { notebook_id: "nb1" },
  notebook_summarize: { notebook_id: "nb1" },
  notebook_rename: { notebook_id: "nb1", new_title: "New" },
  notebook_delete: { notebook_id: "nb1", confirm: true },
  notebook_query: { notebook_id: "nb1", query: "Why?", source_ids: ["s1"] },
  source_get: { notebook_id: "nb1", source_id: "s1" },
  source_get_content: { notebook_id: "nb1", source_id: "s1" },
  source_add_url: { notebook_id: "nb1", url: "https://example.com" },
  source_add_text: { notebook_id: "nb1", content: "text", title: "T" },
  source_add_drive: { notebook_id: "nb1", file_id: "f", title: "T", doc_type: "application/pdf" },
  source_sync_drive: { notebook_id: "nb1", source_ids: ["s1"], confirm: true },
  source_delete: { notebook_id: "nb1", source_id: "s1", confirm: true },
  research_start: { notebook_id: "nb1", query: "q" },
  research_status: { notebook_id: "nb1" },
  research_import: { notebook_id: "nb1", task_id: "t1" },
  audio_overview_create: { notebook_id: "nb1", source_ids: ["s1"], confirm: true },
  video_overview_create: { notebook_id: "nb1", source_ids: ["s1"], confirm: true },
  infographic_create: { notebook_id: "nb1", source_ids: ["s1"], confirm: true },
  slide_deck_create: { notebook_id: "nb1", source_ids: ["s1"], confirm: true },
  report_create: { notebook_id: "nb1", source_ids: ["s1"], confirm: true },
  flashcards_create: { notebook_id: "nb1", source_ids: ["s1"], confirm: true },
  quiz_create: { notebook_id: "nb1", source_ids: ["s1"], confirm: true },
  studio_status: { notebook_id: "nb1" },
  auth_refresh: {},
  auth_save_tokens: { cookies: COOKIES },
};

// A real server and client over an in-memory transport: the server checks each
// result against its outputSchema, and the client checks it again with the
// published JSON Schema, as MCP clients do.
let client: Client;
beforeAll(async () => {
  const server = new McpServer({ name: "test", version: "0" });
  registerTools(server, allTools, () => fakeClient as any);
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  client = new Client({ name: "test-client", version: "0" });
  await client.connect(clientSide);
});
afterAll(async () => {
  await client.close();
});

describe("tool output schemas", () => {
  it("covers every tool", () => {
    expect(Object.keys(args).sort()).toEqual(allTools.map((t) => t.name).sort());
  });

  it("publishes an outputSchema for every tool", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.outputSchema, tool.name).toBeDefined();
      expect(tool.outputSchema?.required, tool.name).toContain("status");
    }
  });

  it.each(allTools.map((t) => t.name))("%s returns structured content matching its schema", async (name) => {
    const result = await client.callTool({ name, arguments: args[name] });
    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ status: "success" });
    // The text block carries the same object, for clients that ignore structuredContent.
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(JSON.parse(text)).toEqual(result.structuredContent);
  });

  it.each(allTools.filter((t) => t.schema && "confirm" in t.schema).map((t) => t.name))(
    "%s validates its pending_confirmation reply",
    async (name) => {
      const result = await client.callTool({ name, arguments: { ...args[name], confirm: false } });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toMatchObject({ status: "pending_confirmation" });
    },
  );

  it("rejects a result that breaks the schema", async () => {
    const server = new McpServer({ name: "test", version: "0" });
    const bad = { ...fakeClient, pollStudio: async () => [{ id: "a1", type: "audio", status: "done", download_url: null }] };
    registerTools(server, allTools, () => bad as any);
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const c = new Client({ name: "c", version: "0" });
    await c.connect(clientSide);
    const result = await c.callTool({ name: "studio_status", arguments: { notebook_id: "nb1" } });
    expect(result.isError).toBe(true);
    await c.close();
  });
});

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NotebookLMClient } from "./client.js";
import { loadTokens, saveTokens } from "./auth.js";
import type { AuthTokens, ToolResult } from "./types.js";
import { registerTools } from "./tools/index.js";
import { authTools } from "./tools/auth.js";
import { queryTools } from "./tools/query.js";
import {
  AUDIO_FORMATS,
  AUDIO_LENGTHS,
  VIDEO_FORMATS,
  VIDEO_STYLES,
  INFOGRAPHIC_ORIENTATIONS,
  INFOGRAPHIC_DETAILS,
  SLIDE_DECK_FORMATS,
  SLIDE_DECK_LENGTHS,
  FLASHCARD_DIFFICULTIES,
  RESEARCH_SOURCES,
  RESEARCH_MODES,
  CHAT_GOALS,
  CHAT_RESPONSE_LENGTHS,
  REPORT_FORMATS,
} from "./constants.js";

let client: NotebookLMClient | null = null;

function getClient(queryTimeout?: number): NotebookLMClient {
  if (!client) {
    const tokens = loadTokens();
    client = new NotebookLMClient(tokens, queryTimeout);
  }
  return client;
}

function ok(data: Record<string, unknown>): { content: { type: "text"; text: string }[] } {
  return {
    content: [{ type: "text", text: JSON.stringify({ status: "success", ...data }, null, 2) }],
  };
}

function err(error: unknown): { content: { type: "text"; text: string }[]; isError: true } {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ status: "error", error: String(error) }, null, 2),
      },
    ],
    isError: true,
  };
}

function pendingConfirmation(message: string): { content: { type: "text"; text: string }[] } {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ status: "pending_confirmation", message }, null, 2),
      },
    ],
  };
}

export function createServer(queryTimeout?: number): McpServer {
  const server = new McpServer({
    name: "notebooklm",
    version: "0.1.0",
  });

  // ─── Notebook Tools (6) ──────────────────────────────

  server.tool(
    "notebook_list",
    "List all NotebookLM notebooks with metadata (title, sources count, ownership)",
    { max_results: z.number().optional().describe("Maximum notebooks to return (default 100)") },
    async ({ max_results }) => {
      try {
        const notebooks = await getClient(queryTimeout).listNotebooks(max_results);
        return ok({ notebooks, count: notebooks.length });
      } catch (e) { return err(e); }
    },
  );

  server.tool(
    "notebook_create",
    "Create a new NotebookLM notebook",
    { title: z.string().describe("Title for the new notebook") },
    async ({ title }) => {
      try {
        const notebook = await getClient(queryTimeout).createNotebook(title);
        return ok({ notebook });
      } catch (e) { return err(e); }
    },
  );

  server.tool(
    "notebook_get",
    "Get details of a specific notebook including its sources",
    { notebook_id: z.string().describe("The notebook ID") },
    async ({ notebook_id }) => {
      try {
        const notebook = await getClient(queryTimeout).getNotebook(notebook_id);
        return ok({ notebook });
      } catch (e) { return err(e); }
    },
  );

  server.tool(
    "notebook_describe",
    "Get an AI-generated summary of the notebook content",
    { notebook_id: z.string().describe("The notebook ID") },
    async ({ notebook_id }) => {
      try {
        const summary = await getClient(queryTimeout).describeNotebook(notebook_id);
        return ok({ summary });
      } catch (e) { return err(e); }
    },
  );

  server.tool(
    "notebook_rename",
    "Rename a notebook",
    {
      notebook_id: z.string().describe("The notebook ID"),
      new_title: z.string().describe("New title for the notebook"),
    },
    async ({ notebook_id, new_title }) => {
      try {
        await getClient(queryTimeout).renameNotebook(notebook_id, new_title);
        return ok({ message: `Notebook renamed to "${new_title}"` });
      } catch (e) { return err(e); }
    },
  );

  server.tool(
    "notebook_delete",
    "Delete a notebook (requires confirm=true)",
    {
      notebook_id: z.string().describe("The notebook ID"),
      confirm: z.boolean().describe("Must be true to confirm deletion"),
    },
    async ({ notebook_id, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to delete this notebook. This cannot be undone.");
      try {
        await getClient(queryTimeout).deleteNotebook(notebook_id);
        return ok({ message: "Notebook deleted" });
      } catch (e) { return err(e); }
    },
  );

  // ─── Source Tools (8) ────────────────────────────────

  server.tool(
    "source_describe",
    "Get an AI-generated summary and keywords for a source",
    {
      notebook_id: z.string().describe("The notebook ID"),
      source_id: z.string().describe("The source ID"),
    },
    async ({ notebook_id, source_id }) => {
      try {
        const guide = await getClient(queryTimeout).getSourceGuide(source_id, notebook_id);
        return ok({ summary: guide.summary, keywords: guide.keywords });
      } catch (e) { return err(e); }
    },
  );

  server.tool(
    "source_get_content",
    "Get the raw text content of a source",
    {
      notebook_id: z.string().describe("The notebook ID"),
      source_id: z.string().describe("The source ID"),
    },
    async ({ notebook_id, source_id }) => {
      try {
        const source = await getClient(queryTimeout).getSource(source_id, notebook_id);
        return ok({ source });
      } catch (e) { return err(e); }
    },
  );

  server.tool(
    "notebook_add_url",
    "Add a URL or YouTube video as a source to a notebook",
    {
      notebook_id: z.string().describe("The notebook ID"),
      url: z.string().describe("URL to add (website or YouTube)"),
    },
    async ({ notebook_id, url }) => {
      try {
        const source = await getClient(queryTimeout).addUrlSource(notebook_id, url);
        return ok({ source });
      } catch (e) { return err(e); }
    },
  );

  server.tool(
    "notebook_add_text",
    "Add pasted text as a source to a notebook",
    {
      notebook_id: z.string().describe("The notebook ID"),
      text: z.string().describe("Text content to add"),
      title: z.string().describe("Title for the text source"),
    },
    async ({ notebook_id, text, title }) => {
      try {
        const source = await getClient(queryTimeout).addTextSource(notebook_id, text, title);
        return ok({ source });
      } catch (e) { return err(e); }
    },
  );

  server.tool(
    "notebook_add_drive",
    "Add a Google Drive document as a source",
    {
      notebook_id: z.string().describe("The notebook ID"),
      document_id: z.string().describe("Google Drive document ID"),
      title: z.string().describe("Document title"),
      doc_type: z.string().describe("MIME type (e.g. application/vnd.google-apps.document)"),
    },
    async ({ notebook_id, document_id, title, doc_type }) => {
      try {
        const source = await getClient(queryTimeout).addDriveSource(notebook_id, document_id, title, doc_type);
        return ok({ source });
      } catch (e) { return err(e); }
    },
  );

  server.tool(
    "source_list_drive",
    "List sources in a notebook with Drive freshness status",
    { notebook_id: z.string().describe("The notebook ID") },
    async ({ notebook_id }) => {
      try {
        const notebook = await getClient(queryTimeout).getNotebook(notebook_id);
        const results = [];
        for (const src of notebook.sources) {
          const fresh = await getClient(queryTimeout).checkFreshness(src.id, notebook_id);
          results.push({ ...src, is_fresh: fresh });
        }
        return ok({ sources: results });
      } catch (e) { return err(e); }
    },
  );

  server.tool(
    "source_sync_drive",
    "Sync stale Google Drive sources (requires confirm=true)",
    {
      notebook_id: z.string().describe("The notebook ID"),
      source_ids: z.array(z.string()).describe("Source IDs to sync"),
      confirm: z.boolean().describe("Must be true to confirm sync"),
    },
    async ({ notebook_id, source_ids, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to sync these Drive sources.");
      try {
        await getClient(queryTimeout).syncDrive(source_ids, notebook_id);
        return ok({ message: `Synced ${source_ids.length} sources` });
      } catch (e) { return err(e); }
    },
  );

  server.tool(
    "source_delete",
    "Delete a source from a notebook (requires confirm=true)",
    {
      notebook_id: z.string().describe("The notebook ID"),
      source_id: z.string().describe("The source ID to delete"),
      confirm: z.boolean().describe("Must be true to confirm deletion"),
    },
    async ({ notebook_id, source_id, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to delete this source.");
      try {
        await getClient(queryTimeout).deleteSource(source_id, notebook_id);
        return ok({ message: "Source deleted" });
      } catch (e) { return err(e); }
    },
  );

  // ─── Query Tools (2) ────────────────────────────────


  // ─── Research Tools (3) ──────────────────────────────

  server.tool(
    "research_start",
    "Start a web or Drive research task",
    {
      notebook_id: z.string().describe("The notebook ID"),
      query: z.string().describe("Research query"),
      source: z.string().optional().describe(`Source: ${RESEARCH_SOURCES.optionsStr()} (default: web)`),
      mode: z.string().optional().describe(`Mode: ${RESEARCH_MODES.optionsStr()} (default: fast)`),
    },
    async ({ notebook_id, query, source, mode }) => {
      try {
        const result = await getClient(queryTimeout).startResearch(notebook_id, query, source, mode);
        return ok({ task_id: result.taskId, message: "Research started. Use research_status to poll progress." });
      } catch (e) { return err(e); }
    },
  );

  server.tool(
    "research_status",
    "Check the status of research tasks",
    {
      notebook_id: z.string().describe("The notebook ID"),
      task_id: z.string().optional().describe("Specific task ID to check (omit for all)"),
    },
    async ({ notebook_id, task_id }) => {
      try {
        const results = await getClient(queryTimeout).pollResearch(notebook_id, task_id);
        return ok({ results });
      } catch (e) { return err(e); }
    },
  );

  server.tool(
    "research_import",
    "Import discovered sources from a research task into the notebook",
    {
      notebook_id: z.string().describe("The notebook ID"),
      task_id: z.string().describe("Research task ID"),
      source_indices: z.array(z.number()).optional().describe("Specific source indices to import (omit for all)"),
    },
    async ({ notebook_id, task_id, source_indices }) => {
      try {
        await getClient(queryTimeout).importResearch(notebook_id, task_id, source_indices);
        return ok({ message: "Research sources imported" });
      } catch (e) { return err(e); }
    },
  );

  // ─── Studio Creation Tools (10) ─────────────────────

  server.tool(
    "audio_overview_create",
    "Generate an audio podcast overview (requires confirm=true)",
    {
      notebook_id: z.string().describe("The notebook ID"),
      source_ids: z.array(z.string()).optional().describe("Source IDs (omit for all)"),
      format: z.string().optional().describe(`Format: ${AUDIO_FORMATS.optionsStr()}`),
      length: z.string().optional().describe(`Length: ${AUDIO_LENGTHS.optionsStr()}`),
      language: z.string().optional().describe("BCP-47 language code (e.g. en, es)"),
      focus_prompt: z.string().optional().describe("Focus prompt for the audio"),
      confirm: z.boolean().describe("Must be true to start generation"),
    },
    async ({ notebook_id, source_ids, format, length, language, focus_prompt, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate audio overview.");
      try {
        const ids = source_ids || (await getClient(queryTimeout).getNotebook(notebook_id)).sources.map((s) => s.id);
        const artifactId = await getClient(queryTimeout).createAudioOverview(notebook_id, ids, { format, length, language, focus_prompt });
        return ok({ artifact_id: artifactId, message: "Audio generation started. Use studio_status to check progress." });
      } catch (e) { return err(e); }
    },
  );

  server.tool(
    "video_overview_create",
    "Generate a video overview (requires confirm=true)",
    {
      notebook_id: z.string().describe("The notebook ID"),
      source_ids: z.array(z.string()).optional().describe("Source IDs (omit for all)"),
      format: z.string().optional().describe(`Format: ${VIDEO_FORMATS.optionsStr()}`),
      visual_style: z.string().optional().describe(`Style: ${VIDEO_STYLES.optionsStr()}`),
      language: z.string().optional().describe("BCP-47 language code"),
      focus_prompt: z.string().optional().describe("Focus prompt"),
      confirm: z.boolean().describe("Must be true to start generation"),
    },
    async ({ notebook_id, source_ids, format, visual_style, language, focus_prompt, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate video overview.");
      try {
        const ids = source_ids || (await getClient(queryTimeout).getNotebook(notebook_id)).sources.map((s) => s.id);
        const artifactId = await getClient(queryTimeout).createVideoOverview(notebook_id, ids, { format, visual_style, language, focus_prompt });
        return ok({ artifact_id: artifactId, message: "Video generation started. Use studio_status to check progress." });
      } catch (e) { return err(e); }
    },
  );

  server.tool(
    "infographic_create",
    "Generate an infographic (requires confirm=true)",
    {
      notebook_id: z.string().describe("The notebook ID"),
      source_ids: z.array(z.string()).optional().describe("Source IDs (omit for all)"),
      orientation: z.string().optional().describe(`Orientation: ${INFOGRAPHIC_ORIENTATIONS.optionsStr()}`),
      detail_level: z.string().optional().describe(`Detail: ${INFOGRAPHIC_DETAILS.optionsStr()}`),
      language: z.string().optional().describe("BCP-47 language code"),
      focus_prompt: z.string().optional().describe("Focus prompt"),
      confirm: z.boolean().describe("Must be true to start generation"),
    },
    async ({ notebook_id, source_ids, orientation, detail_level, language, focus_prompt, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate infographic.");
      try {
        const ids = source_ids || (await getClient(queryTimeout).getNotebook(notebook_id)).sources.map((s) => s.id);
        const artifactId = await getClient(queryTimeout).createInfographic(notebook_id, ids, { orientation, detail_level, language, focus_prompt });
        return ok({ artifact_id: artifactId, message: "Infographic generation started. Use studio_status to check progress." });
      } catch (e) { return err(e); }
    },
  );

  server.tool(
    "slide_deck_create",
    "Generate a slide deck presentation (requires confirm=true)",
    {
      notebook_id: z.string().describe("The notebook ID"),
      source_ids: z.array(z.string()).optional().describe("Source IDs (omit for all)"),
      format: z.string().optional().describe(`Format: ${SLIDE_DECK_FORMATS.optionsStr()}`),
      length: z.string().optional().describe(`Length: ${SLIDE_DECK_LENGTHS.optionsStr()}`),
      language: z.string().optional().describe("BCP-47 language code"),
      focus_prompt: z.string().optional().describe("Focus prompt"),
      confirm: z.boolean().describe("Must be true to start generation"),
    },
    async ({ notebook_id, source_ids, format, length, language, focus_prompt, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate slide deck.");
      try {
        const ids = source_ids || (await getClient(queryTimeout).getNotebook(notebook_id)).sources.map((s) => s.id);
        const artifactId = await getClient(queryTimeout).createSlideDeck(notebook_id, ids, { format, length, language, focus_prompt });
        return ok({ artifact_id: artifactId, message: "Slide deck generation started. Use studio_status to check progress." });
      } catch (e) { return err(e); }
    },
  );

  server.tool(
    "report_create",
    "Generate a report (requires confirm=true)",
    {
      notebook_id: z.string().describe("The notebook ID"),
      source_ids: z.array(z.string()).optional().describe("Source IDs (omit for all)"),
      report_format: z.string().optional().describe(`Format: ${Object.keys(REPORT_FORMATS).join(", ")}`),
      custom_prompt: z.string().optional().describe("Custom prompt (when format='Create Your Own')"),
      language: z.string().optional().describe("BCP-47 language code"),
      confirm: z.boolean().describe("Must be true to start generation"),
    },
    async ({ notebook_id, source_ids, report_format, custom_prompt, language, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate report.");
      try {
        const ids = source_ids || (await getClient(queryTimeout).getNotebook(notebook_id)).sources.map((s) => s.id);
        const artifactId = await getClient(queryTimeout).createReport(notebook_id, ids, { report_format, custom_prompt, language });
        return ok({ artifact_id: artifactId, message: "Report generation started. Use studio_status to check progress." });
      } catch (e) { return err(e); }
    },
  );

  server.tool(
    "flashcards_create",
    "Generate flashcards for study (requires confirm=true)",
    {
      notebook_id: z.string().describe("The notebook ID"),
      source_ids: z.array(z.string()).optional().describe("Source IDs (omit for all)"),
      difficulty: z.string().optional().describe(`Difficulty: ${FLASHCARD_DIFFICULTIES.optionsStr()}`),
      confirm: z.boolean().describe("Must be true to start generation"),
    },
    async ({ notebook_id, source_ids, difficulty, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate flashcards.");
      try {
        const ids = source_ids || (await getClient(queryTimeout).getNotebook(notebook_id)).sources.map((s) => s.id);
        const artifactId = await getClient(queryTimeout).createFlashcards(notebook_id, ids, difficulty);
        return ok({ artifact_id: artifactId, message: "Flashcard generation started. Use studio_status to check progress." });
      } catch (e) { return err(e); }
    },
  );

  server.tool(
    "quiz_create",
    "Generate a quiz (requires confirm=true)",
    {
      notebook_id: z.string().describe("The notebook ID"),
      source_ids: z.array(z.string()).optional().describe("Source IDs (omit for all)"),
      question_count: z.number().optional().describe("Number of questions (default 5)"),
      difficulty: z.string().optional().describe(`Difficulty: ${FLASHCARD_DIFFICULTIES.optionsStr()}`),
      confirm: z.boolean().describe("Must be true to start generation"),
    },
    async ({ notebook_id, source_ids, question_count, difficulty, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate quiz.");
      try {
        const ids = source_ids || (await getClient(queryTimeout).getNotebook(notebook_id)).sources.map((s) => s.id);
        const artifactId = await getClient(queryTimeout).createQuiz(notebook_id, ids, question_count, difficulty);
        return ok({ artifact_id: artifactId, message: "Quiz generation started. Use studio_status to check progress." });
      } catch (e) { return err(e); }
    },
  );

  server.tool(
    "data_table_create",
    "Generate a data table (requires confirm=true)",
    {
      notebook_id: z.string().describe("The notebook ID"),
      description: z.string().describe("Description of the table to generate"),
      source_ids: z.array(z.string()).optional().describe("Source IDs (omit for all)"),
      language: z.string().optional().describe("BCP-47 language code"),
      confirm: z.boolean().describe("Must be true to start generation"),
    },
    async ({ notebook_id, description, source_ids, language, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate data table.");
      try {
        const ids = source_ids || (await getClient(queryTimeout).getNotebook(notebook_id)).sources.map((s) => s.id);
        const artifactId = await getClient(queryTimeout).createDataTable(notebook_id, ids, description, language);
        return ok({ artifact_id: artifactId, message: "Data table generation started. Use studio_status to check progress." });
      } catch (e) { return err(e); }
    },
  );

  server.tool(
    "mind_map_create",
    "Generate and save a mind map (requires confirm=true)",
    {
      notebook_id: z.string().describe("The notebook ID"),
      source_ids: z.array(z.string()).optional().describe("Source IDs (omit for all)"),
      title: z.string().optional().describe("Custom title for the mind map"),
      confirm: z.boolean().describe("Must be true to start generation"),
    },
    async ({ notebook_id, source_ids, title, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate mind map.");
      try {
        const ids = source_ids || (await getClient(queryTimeout).getNotebook(notebook_id)).sources.map((s) => s.id);
        const artifactId = await getClient(queryTimeout).createMindMap(notebook_id, ids, title);
        return ok({ artifact_id: artifactId, message: "Mind map generated and saved." });
      } catch (e) { return err(e); }
    },
  );

  // ─── Studio Management (2) ──────────────────────────

  server.tool(
    "studio_status",
    "Check the status of studio artifact generation and get download URLs",
    { notebook_id: z.string().describe("The notebook ID") },
    async ({ notebook_id }) => {
      try {
        const artifacts = await getClient(queryTimeout).pollStudio(notebook_id);
        return ok({ artifacts });
      } catch (e) { return err(e); }
    },
  );

  server.tool(
    "studio_delete",
    "Delete a studio artifact (requires confirm=true)",
    {
      notebook_id: z.string().describe("The notebook ID"),
      artifact_id: z.string().describe("The artifact ID to delete"),
      confirm: z.boolean().describe("Must be true to confirm deletion"),
    },
    async ({ notebook_id, artifact_id, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to delete this artifact.");
      try {
        await getClient(queryTimeout).deleteStudio(notebook_id, artifact_id);
        return ok({ message: "Artifact deleted" });
      } catch (e) { return err(e); }
    },
  );

  // ─── Refactored Tool Registration ─────────────────────
  
  registerTools(server, [
    ...authTools,
    ...queryTools,
  ], getClient, { 
    queryTimeout,
    onClientReset: () => { client = null; }
  });

  return server;
}

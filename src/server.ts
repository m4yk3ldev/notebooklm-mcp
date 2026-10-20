import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NotebookLMClient } from "./client.js";
import { loadTokens, saveTokens } from "./auth.js";
import type { AuthTokens, ToolResult } from "./types.js";
import { registerTools } from "./tools/index.js";
import { authTools } from "./tools/auth.js";
import { queryTools } from "./tools/query.js";
import { researchTools } from "./tools/research.js";
import { notebookTools } from "./tools/notebook.js";
import { sourceTools } from "./tools/source.js";
import { studioTools } from "./tools/studio.js";
import { readPackageVersion } from "./version.js";

// Sent to clients at initialization; they place it ahead of the tool
// catalog, so it carries the cross-tool workflow the descriptions can't.
export const SERVER_INSTRUCTIONS = `Google NotebookLM: notebooks of sources (web pages, YouTube, text, Drive files) that answer questions only from those sources and generate Studio content.

Workflow: find the notebook with notebook_list (match by title before creating a duplicate) or create one with notebook_create. Add sources with source_add_url, source_add_text or source_add_drive; each returns the new source's id. Ask questions with notebook_query and pass the returned conversation_id back for follow-ups. To let NotebookLM find sources, use research_start, poll research_status until it is no longer "in_progress", then research_import.

Studio tools (audio, video, slide deck, report, infographic, flashcards, quiz) and the delete/sync tools act only with confirm=true: they use the user's NotebookLM quota or change data, so confirm with the user first. Generation takes minutes: poll studio_status for the artifact_id.

If a call fails with an authentication error, call auth_refresh once; if the session is signed out, ask the user to run \`npx -y @m4ykeldev/notebooklm-mcp auth\` in a terminal.`;

let client: NotebookLMClient | null = null;

function getClient(queryTimeout?: number): NotebookLMClient {
  if (!client) {
    const tokens = loadTokens();
    client = new NotebookLMClient(tokens, queryTimeout);
  }
  return client;
}

export function createServer(queryTimeout?: number): McpServer {
  const server = new McpServer(
    { name: "notebooklm", version: readPackageVersion() },
    { instructions: SERVER_INSTRUCTIONS },
  );

  // ─── Refactored Tool Registration ─────────────────────
  
  registerTools(server, [
    ...notebookTools,
    ...sourceTools,
    ...studioTools,
    ...authTools,
    ...queryTools,
    ...researchTools,
  ], getClient, { 
    queryTimeout,
    onClientReset: () => { client = null; }
  });

  return server;
}

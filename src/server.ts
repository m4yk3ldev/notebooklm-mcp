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


  // ─── Source Tools (8) ────────────────────────────────


  // ─── Query Tools (2) ────────────────────────────────


  // ─── Research Tools (3) ──────────────────────────────


  // ─── Studio Creation Tools (10) ─────────────────────


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

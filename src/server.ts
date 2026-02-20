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
let client: NotebookLMClient | null = null;

function getClient(queryTimeout?: number): NotebookLMClient {
  if (!client) {
    const tokens = loadTokens();
    client = new NotebookLMClient(tokens, queryTimeout);
  }
  return client;
}

export function createServer(queryTimeout?: number): McpServer {
  const server = new McpServer({
    name: "notebooklm",
    version: "0.1.0",
  });

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

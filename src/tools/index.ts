import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { NotebookLMClient } from "../client.js";

export interface McpTool<T extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  /** Human-readable name shown by clients. */
  title?: string;
  description: string;
  /** MCP behaviour hints (read-only, destructive, idempotent, open-world). */
  annotations?: ToolAnnotations;
  schema?: T;
  execute: (
    client: NotebookLMClient,
    args: z.infer<z.ZodObject<T>>,
    opts: { queryTimeout?: number }
  ) => Promise<any>;
}

// MCP behaviour hints, shared so every tool of a kind says the same thing.
// openWorldHint is true throughout: every tool talks to Google NotebookLM.
export const READ_ONLY: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
export const CREATES: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
export const UPDATES: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };
export const DESTROYS: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true };

/** Parameter descriptions repeated across tools. */
export const PARAM = {
  notebookId: "Notebook ID, as returned by notebook_list or notebook_create",
  sourceId: "Source ID, as listed in the notebook's sources by notebook_get",
  studioSourceIds: "Limit generation to these source IDs (from notebook_get); omit to use every source in the notebook",
  language: "BCP-47 language code such as en, es or fr; omit to use the language of the user's NotebookLM account",
  focusPrompt: "Optional instruction on what to focus on or emphasise, e.g. \"the methodology section\"",
  confirmStudio: "Must be true to start generation. With false the tool only returns pending_confirmation and does nothing",
} as const;

// Sentinel attached to a tool result so the registrar (registerTools)
// knows to re-initialize the shared NotebookLMClient — used after the
// auth flow swaps in new tokens. Exported as a constant so the producer
// (tools/auth.ts) and the consumer (registerTools) stay in sync.
export const CLIENT_ACTION_KEY = "_client_action";
export const CLIENT_ACTION_RESET = "reset";

export function clientResetSignal<R extends Record<string, unknown>>(extra: R): R & { [CLIENT_ACTION_KEY]: typeof CLIENT_ACTION_RESET } {
  return { ...extra, [CLIENT_ACTION_KEY]: CLIENT_ACTION_RESET };
}

/**
 * If the tool was called without source_ids, fetch the notebook and
 * return all of its source IDs. Studio tools used to inline this pattern
 * 9 times verbatim.
 */
export async function resolveSourceIds(
  client: NotebookLMClient,
  notebookId: string,
  sourceIds: string[] | undefined,
): Promise<string[]> {
  if (sourceIds && sourceIds.length > 0) return sourceIds;
  const notebook = await client.getNotebook(notebookId);
  return notebook.sources.map((s) => s.id);
}

export function registerTools(
  server: McpServer,
  tools: McpTool<any>[],
  getClient: (timeout?: number) => NotebookLMClient,
  opts?: { queryTimeout?: number, onClientReset?: () => void }
) {
  for (const tool of tools) {
    const config: any = { description: tool.description };
    if (tool.title) config.title = tool.title;
    if (tool.annotations) config.annotations = tool.annotations;
    if (tool.schema) {
      config.inputSchema = tool.schema;
    }
    server.registerTool(tool.name, config, async (args: any) => {
      try {
        const result = await tool.execute(getClient(opts?.queryTimeout), args, { queryTimeout: opts?.queryTimeout });
        if (result && result[CLIENT_ACTION_KEY] === CLIENT_ACTION_RESET && opts?.onClientReset) {
          opts.onClientReset();
          delete result[CLIENT_ACTION_KEY];
        }
        return { content: [{ type: "text" as const, text: JSON.stringify({ status: "success", ...result }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ status: "error", error: String(e) }, null, 2) }], isError: true };
      }
    });
  }
}

// Re-usable helper for tools that require confirmation
export function pendingConfirmation(message: string) {
  return { status: "pending_confirmation", message };
}

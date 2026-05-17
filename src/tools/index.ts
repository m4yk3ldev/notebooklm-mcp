import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NotebookLMClient } from "../client.js";

export interface McpTool<T extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  schema?: T;
  execute: (
    client: NotebookLMClient,
    args: z.infer<z.ZodObject<T>>,
    opts: { queryTimeout?: number }
  ) => Promise<any>;
}

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

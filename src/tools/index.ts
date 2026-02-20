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
        if (result && result._client_action === "reset" && opts?.onClientReset) {
          opts.onClientReset();
          delete result._client_action;
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

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
  queryTimeout?: number
) {
  for (const tool of tools) {
    if (tool.schema) {
      server.tool(tool.name, tool.description, tool.schema, async (args) => {
        try {
          const result = await tool.execute(getClient(queryTimeout), args as any, { queryTimeout });
          return { content: [{ type: "text", text: JSON.stringify({ status: "success", ...result }, null, 2) }] };
        } catch (e) {
          return { content: [{ type: "text", text: JSON.stringify({ status: "error", error: String(e) }, null, 2) }], isError: true };
        }
      });
    } else {
      server.tool(tool.name, tool.description, async () => {
        try {
          const result = await tool.execute(getClient(queryTimeout), {} as any, { queryTimeout });
          return { content: [{ type: "text", text: JSON.stringify({ status: "success", ...result }, null, 2) }] };
        } catch (e) {
          return { content: [{ type: "text", text: JSON.stringify({ status: "error", error: String(e) }, null, 2) }], isError: true };
        }
      });
    }
  }
}

// Re-usable helper for tools that require confirmation
export function pendingConfirmation(message: string) {
  return { status: "pending_confirmation", message };
}

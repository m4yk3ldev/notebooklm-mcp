import { z } from "zod";
import { McpTool, resolveSourceIds } from "./index.js";

export const queryTools: McpTool<any>[] = [
  {
    name: "notebook_query",
    description: "Ask a question about the sources in a notebook",
    schema: {
      notebook_id: z.string().describe("The notebook ID"),
      query: z.string().describe("Question to ask"),
      source_ids: z.array(z.string()).optional().describe("Specific source IDs to query (omit for all)"),
      conversation_id: z.string().optional().describe("Conversation ID for follow-up questions"),
    },
    execute: async (client, { notebook_id, query, source_ids, conversation_id }) => {
      // With no ids the server falls back to whatever is ticked in the web
      // UI, so always send the full list.
      const ids = await resolveSourceIds(client, notebook_id, source_ids);
      const response = await client.query(notebook_id, query, ids, conversation_id);
      return { answer: response.answer, conversation_id: response.conversation_id };
    },
  },
];

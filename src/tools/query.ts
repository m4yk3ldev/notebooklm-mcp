import { z } from "zod";
import { McpTool } from "./index.js";

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
      const response = await client.query(notebook_id, query, source_ids, conversation_id);
      return { answer: response.answer, conversation_id: response.conversation_id };
    },
  },
];

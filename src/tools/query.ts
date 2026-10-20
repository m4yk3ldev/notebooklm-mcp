import { z } from "zod";
import { McpTool, resolveSourceIds, PARAM } from "./index.js";

export const queryTools: McpTool<any>[] = [
  {
    name: "notebook_query",
    title: "Ask the notebook",
    description:
      "Ask NotebookLM a question that it answers only from the notebook's sources (all of them, or source_ids). " +
      "Returns the answer and a conversation_id. The answer text keeps NotebookLM's bracketed citation numbers such as " +
      "[1], but not which passage each number points to. Pass conversation_id back to ask a follow-up; this server " +
      "remembers the conversation's history while it keeps running.",
    // Not read-only: NotebookLM keeps the exchange in the notebook's chat history.
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
      query: z.string().describe("The question, in natural language"),
      source_ids: z
        .array(z.string())
        .optional()
        .describe("Answer only from these source IDs (from notebook_get); omit to use every source"),
      conversation_id: z
        .string()
        .optional()
        .describe("conversation_id returned by a previous notebook_query, to ask a follow-up in the same conversation"),
    },
    output: {
      answer: z.string().describe("NotebookLM's answer, with bracketed citation numbers such as [1]"),
      conversation_id: z.string().nullable().describe("Pass back as conversation_id to ask a follow-up"),
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

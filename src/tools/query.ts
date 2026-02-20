import { z } from "zod";
import { McpTool } from "./index.js";
import { CHAT_GOALS, CHAT_RESPONSE_LENGTHS } from "../constants.js";

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
  {
    name: "chat_configure",
    description: "Configure chat behavior (goal and response length)",
    schema: {
      notebook_id: z.string().describe("The notebook ID"),
      goal: z.string().optional().describe(`Chat goal: ${CHAT_GOALS.optionsStr()}`),
      custom_prompt: z.string().optional().describe("Custom prompt (when goal=custom)"),
      response_length: z.string().optional().describe(`Response length: ${CHAT_RESPONSE_LENGTHS.optionsStr()}`),
    },
    execute: async (client, { notebook_id, goal, custom_prompt, response_length }) => {
      await client.chatConfigure(notebook_id, goal, custom_prompt, response_length);
      return { message: "Chat configured" };
    },
  },
];

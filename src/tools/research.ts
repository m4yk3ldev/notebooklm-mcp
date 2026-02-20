import { z } from "zod";
import { McpTool } from "./index.js";
import { RESEARCH_SOURCES, RESEARCH_MODES } from "../constants.js";

export const researchTools: McpTool<any>[] = [
  {
    name: "research_start",
    description: "Start a web or Drive research task",
    schema: {
      notebook_id: z.string().describe("The notebook ID"),
      query: z.string().describe("Research query"),
      source: z.string().optional().describe(`Source: ${RESEARCH_SOURCES.optionsStr()} (default: web)`),
      mode: z.string().optional().describe(`Mode: ${RESEARCH_MODES.optionsStr()} (default: fast)`),
    },
    execute: async (client, { notebook_id, query, source, mode }) => {
      const result = await client.startResearch(notebook_id, query, source, mode);
      return { task_id: result.taskId, message: "Research started. Use research_status to poll progress." };
    },
  },
  {
    name: "research_status",
    description: "Check the status of research tasks",
    schema: {
      notebook_id: z.string().describe("The notebook ID"),
      task_id: z.string().optional().describe("Specific task ID to check (omit for all)"),
    },
    execute: async (client, { notebook_id, task_id }) => {
      const results = await client.pollResearch(notebook_id, task_id);
      return { results };
    },
  },
  {
    name: "research_import",
    description: "Import discovered sources from a research task into the notebook",
    schema: {
      notebook_id: z.string().describe("The notebook ID"),
      task_id: z.string().describe("Research task ID"),
      source_indices: z.array(z.number()).optional().describe("Specific source indices to import (omit for all)"),
    },
    execute: async (client, { notebook_id, task_id, source_indices }) => {
      await client.importResearch(notebook_id, task_id, source_indices);
      return { message: "Research sources imported" };
    },
  },
];

import { z } from "zod";
import { McpTool, READ_ONLY, CREATES, PARAM } from "./index.js";
import { RESEARCH_SOURCES, RESEARCH_MODES } from "../constants.js";

export const researchTools: McpTool<any>[] = [
  {
    name: "research_start",
    title: "Start research",
    description:
      "Start a NotebookLM research task that searches the web, or the user's Google Drive, for sources on a topic. " +
      "Deep mode is more thorough and slower than the default fast mode. Returns a task_id: poll " +
      "research_status with it, then import the results you want with research_import.",
    annotations: CREATES,
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
      query: z.string().describe("Topic or question to research"),
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
    title: "Check research",
    description:
      "Check research tasks in a notebook: one task, or all of them. Returns each task's status (in_progress, completed, " +
      "imported, import_failed, or unknown for a state this server doesn't recognise), query, summary and found sources " +
      "(url, title, description, type). Poll until the " +
      "status is no longer in_progress; a source's position in this list is the index research_import takes.",
    annotations: READ_ONLY,
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
      task_id: z.string().optional().describe("task_id from research_start; omit to list every research task in the notebook"),
    },
    execute: async (client, { notebook_id, task_id }) => {
      const results = await client.pollResearch(notebook_id, task_id);
      return { results };
    },
  },
  {
    name: "research_import",
    title: "Import research results",
    description:
      "Add results of a finished research task to the notebook as sources. Only web results can be imported: without " +
      "source_indices it imports every web result and skips Drive ones. NotebookLM fetches each URL and skips any it " +
      "can't reach, so it returns \"Imported X of Y research sources\". If none could be fetched the call fails and the " +
      "task shows import_failed; a retry may succeed.",
    annotations: CREATES,
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
      task_id: z.string().describe("task_id from research_start"),
      source_indices: z.array(z.number()).optional().describe("Indices into the task's sources as listed by research_status (omit to import every web result)"),
    },
    execute: async (client, { notebook_id, task_id, source_indices }) => {
      const { requested, imported, skipped } = await client.importResearch(notebook_id, task_id, source_indices);
      const note = skipped ? ` (skipped ${skipped} Drive result${skipped === 1 ? "" : "s"} that can't be imported)` : "";
      return { message: `Imported ${imported} of ${requested} research sources${note}` };
    },
  },
];

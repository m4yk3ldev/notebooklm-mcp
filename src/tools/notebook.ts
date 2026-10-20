import { z } from "zod";
import { McpTool, pendingConfirmation, READ_ONLY, CREATES, UPDATES, DESTROYS, PARAM, NOTEBOOK_OUT } from "./index.js";

export const notebookTools: McpTool<any>[] = [
  {
    name: "notebook_list",
    title: "List notebooks",
    description:
      "List the user's NotebookLM notebooks, owned and shared. Returns each notebook's id, title, emoji, sources " +
      "(id, title, type), ownership and timestamps, plus a count. Start here to find a notebook_id by title; " +
      "once you have the id, notebook_get reads one notebook. There is no paging: if count equals max_results, " +
      "call again with a higher max_results.",
    annotations: READ_ONLY,
    schema: {
      max_results: z.number().optional().describe("Maximum number of notebooks to return (default 100)"),
    },
    output: {
      notebooks: z.array(NOTEBOOK_OUT),
      count: z.number().describe("Number of notebooks returned"),
    },
    execute: async (client, { max_results }) => {
      const notebooks = await client.listNotebooks(max_results);
      return { notebooks, count: notebooks.length };
    },
  },
  {
    name: "notebook_create",
    title: "Create notebook",
    description:
      "Create an empty NotebookLM notebook. Returns the new notebook; keep its id for every later call. Each call " +
      "creates another notebook, so first look for one with this title in notebook_list. Then fill it: " +
      "source_add_url, source_add_text or source_add_drive for sources you have, research_start to find some.",
    annotations: CREATES,
    schema: {
      title: z.string().describe("Title for the new notebook"),
    },
    output: { notebook: NOTEBOOK_OUT },
    execute: async (client, { title }) => {
      const notebook = await client.createNotebook(title);
      return { notebook };
    },
  },
  {
    name: "notebook_get",
    title: "Get notebook",
    description:
      "Get one notebook's details. Returns its title, emoji, ownership, timestamps and sources, each with id, title and " +
      "type (web_page, youtube, pasted_text, pdf, google_docs, ...). Use it to find source IDs for notebook_query and the " +
      "Studio tools, or to check that a source you just added has appeared.",
    annotations: READ_ONLY,
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
    },
    output: { notebook: NOTEBOOK_OUT },
    execute: async (client, { notebook_id }) => {
      const notebook = await client.getNotebook(notebook_id);
      return { notebook };
    },
  },
  {
    name: "notebook_summarize",
    title: "Summarise notebook",
    description:
      "Ask NotebookLM for an AI-generated overview of the whole notebook. Returns a short summary of what its sources " +
      "cover and the questions NotebookLM suggests asking about them. Use it to get oriented in an unfamiliar notebook; " +
      "ask specific questions with notebook_query and list the sources with notebook_get.",
    annotations: READ_ONLY,
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
    },
    output: {
      summary: z.string().describe("Overview of what the sources cover"),
      suggested_questions: z.array(z.string()).describe("Questions NotebookLM suggests asking with notebook_query"),
    },
    execute: async (client, { notebook_id }) => {
      const { summary, suggested_questions } = await client.describeNotebook(notebook_id);
      return { summary, suggested_questions };
    },
  },
  {
    name: "notebook_rename",
    title: "Rename notebook",
    description:
      "Change a notebook's title; its sources and chat stay as they are. Returns a confirmation message with the " +
      "new title. Find the notebook_id with notebook_list first.",
    annotations: UPDATES,
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
      new_title: z.string().describe("New title for the notebook"),
    },
    output: {},
    execute: async (client, { notebook_id, new_title }) => {
      await client.renameNotebook(notebook_id, new_title);
      return { message: `Notebook renamed to "${new_title}"` };
    },
  },
  {
    name: "notebook_delete",
    title: "Delete notebook",
    description:
      "Permanently delete a notebook and everything in it. With confirm=false it " +
      "does nothing and returns pending_confirmation; with confirm=true it deletes and returns a confirmation message. " +
      "This cannot be undone: name the notebook to the user and get explicit approval first.",
    annotations: DESTROYS,
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
      confirm: z.boolean().describe("Must be true to delete. With false the tool only returns pending_confirmation"),
    },
    output: {},
    execute: async (client, { notebook_id, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to delete this notebook. This cannot be undone.");
      await client.deleteNotebook(notebook_id);
      return { message: "Notebook deleted" };
    },
  },
];

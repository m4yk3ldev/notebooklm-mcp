import { z } from "zod";
import { McpTool, pendingConfirmation, READ_ONLY, CREATES, UPDATES, DESTROYS, PARAM } from "./index.js";

export const notebookTools: McpTool<any>[] = [
  {
    name: "notebook_list",
    title: "List notebooks",
    description:
      "List the user's NotebookLM notebooks. Returns each notebook's id, title, emoji, sources (id, title, type), " +
      "ownership (mine or shared) and created/modified timestamps, plus a count. Start here to find a notebook id, " +
      "and match by title before creating a new notebook.",
    annotations: READ_ONLY,
    schema: {
      max_results: z.number().optional().describe("Maximum number of notebooks to return (default 100)"),
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
      "Create an empty NotebookLM notebook. Returns the new notebook with its id and title. Check notebook_list first " +
      "to avoid a duplicate, then add sources with notebook_add_url, notebook_add_text or notebook_add_drive.",
    annotations: CREATES,
    schema: {
      title: z.string().describe("Title for the new notebook"),
    },
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
    execute: async (client, { notebook_id }) => {
      const notebook = await client.getNotebook(notebook_id);
      return { notebook };
    },
  },
  {
    name: "notebook_describe",
    title: "Summarise notebook",
    description:
      "Ask NotebookLM for an AI-generated overview of the whole notebook. Returns a short summary of what its sources " +
      "cover. Use it to get oriented in an unfamiliar notebook; ask specific questions with notebook_query and list the " +
      "sources with notebook_get.",
    annotations: READ_ONLY,
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
    },
    execute: async (client, { notebook_id }) => {
      const summary = await client.describeNotebook(notebook_id);
      return { summary };
    },
  },
  {
    name: "notebook_rename",
    title: "Rename notebook",
    description:
      "Change a notebook's title. Returns a confirmation message with the new title. Only the title changes: sources, " +
      "chat history and Studio content are left as they are.",
    annotations: UPDATES,
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
      new_title: z.string().describe("New title for the notebook"),
    },
    execute: async (client, { notebook_id, new_title }) => {
      await client.renameNotebook(notebook_id, new_title);
      return { message: `Notebook renamed to "${new_title}"` };
    },
  },
  {
    name: "notebook_delete",
    title: "Delete notebook",
    description:
      "Permanently delete a notebook together with its sources, chat history and Studio content. With confirm=false it " +
      "does nothing and returns pending_confirmation; with confirm=true it deletes and returns a confirmation message. " +
      "This cannot be undone: name the notebook to the user and get explicit approval first.",
    annotations: DESTROYS,
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
      confirm: z.boolean().describe("Must be true to delete. With false the tool only returns pending_confirmation"),
    },
    execute: async (client, { notebook_id, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to delete this notebook. This cannot be undone.");
      await client.deleteNotebook(notebook_id);
      return { message: "Notebook deleted" };
    },
  },
];

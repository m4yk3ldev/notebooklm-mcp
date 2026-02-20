import { z } from "zod";
import { McpTool, pendingConfirmation } from "./index.js";

export const notebookTools: McpTool<any>[] = [
  {
    name: "notebook_list",
    description: "List all NotebookLM notebooks with metadata (title, sources count, ownership)",
    schema: {
      max_results: z.number().optional().describe("Maximum notebooks to return (default 100)"),
    },
    execute: async (client, { max_results }) => {
      const notebooks = await client.listNotebooks(max_results);
      return { notebooks, count: notebooks.length };
    },
  },
  {
    name: "notebook_create",
    description: "Create a new NotebookLM notebook",
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
    description: "Get details of a specific notebook including its sources",
    schema: {
      notebook_id: z.string().describe("The notebook ID"),
    },
    execute: async (client, { notebook_id }) => {
      const notebook = await client.getNotebook(notebook_id);
      return { notebook };
    },
  },
  {
    name: "notebook_describe",
    description: "Get an AI-generated summary of the notebook content",
    schema: {
      notebook_id: z.string().describe("The notebook ID"),
    },
    execute: async (client, { notebook_id }) => {
      const summary = await client.describeNotebook(notebook_id);
      return { summary };
    },
  },
  {
    name: "notebook_rename",
    description: "Rename a notebook",
    schema: {
      notebook_id: z.string().describe("The notebook ID"),
      new_title: z.string().describe("New title for the notebook"),
    },
    execute: async (client, { notebook_id, new_title }) => {
      await client.renameNotebook(notebook_id, new_title);
      return { message: `Notebook renamed to "${new_title}"` };
    },
  },
  {
    name: "notebook_delete",
    description: "Delete a notebook (requires confirm=true)",
    schema: {
      notebook_id: z.string().describe("The notebook ID"),
      confirm: z.boolean().describe("Must be true to confirm deletion"),
    },
    execute: async (client, { notebook_id, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to delete this notebook. This cannot be undone.");
      await client.deleteNotebook(notebook_id);
      return { message: "Notebook deleted" };
    },
  },
];

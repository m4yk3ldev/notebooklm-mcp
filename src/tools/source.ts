import { z } from "zod";
import { McpTool, pendingConfirmation, READ_ONLY, CREATES, UPDATES, DESTROYS, PARAM } from "./index.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// source_add_text accepts a file_path from the MCP client. Without
// validation, a hostile prompt could read arbitrary local files
// (~/.ssh/id_rsa, /etc/passwd, etc) and ship them to NotebookLM as a
// "source". Restrict to files under the server's CWD or the OS temp
// directory. Users who need to ingest files elsewhere should copy them in.
export function resolveAllowedReadPath(filePath: string): string {
  // realpath, not just resolve: a symlink inside an allowed root must not
  // reach a file outside it. A path that doesn't exist is checked as given.
  const real = (p: string) => {
    const abs = path.resolve(p);
    try {
      return fs.realpathSync(abs);
    } catch {
      return abs;
    }
  };
  const resolved = real(filePath);
  const allowedRoots = [real(process.cwd()), real(os.tmpdir())];
  const ok = allowedRoots.some(
    (root) => resolved === root || resolved.startsWith(root + path.sep),
  );
  if (!ok) {
    throw new Error(
      `file_path "${filePath}" resolves to ${resolved}, which is outside the ` +
        `allowed roots (cwd: ${allowedRoots[0]}, tmpdir: ${allowedRoots[1]}). ` +
        `Move the file into the working directory or pass the content inline ` +
        `via the "content" parameter.`,
    );
  }
  return resolved;
}

export const sourceTools: McpTool<any>[] = [
  {
    name: "source_get",
    title: "Describe source",
    description:
      "Get one source's metadata. Returns its id, title, type (web_page, youtube, pasted_text, pdf, google_docs, ...) " +
      "and content_length, the number of characters NotebookLM extracted from it. The text itself is left out because " +
      "it can be very long; fetch it with source_get_content.",
    annotations: READ_ONLY,
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
      source_id: z.string().describe(PARAM.sourceId),
    },
    execute: async (client, { notebook_id, source_id }) => {
      const source = await client.getSource(source_id, notebook_id);
      return {
        source: { id: source.id, title: source.title, type: source.type, content_length: source.content?.length ?? 0 },
      };
    },
  },
  {
    name: "source_get_content",
    title: "Get source text",
    description:
      "Get the full text NotebookLM extracted from a source, with tables flattened to \"cell | cell\" rows. Returns " +
      // 98,670 characters measured live for the Wikipedia "Photosynthesis" article (2026-10-18).
      "{ text }, which can be long: a long Wikipedia article came to about 100,000 characters. Prefer notebook_query to answer " +
      "questions; use this when the user needs the verbatim text.",
    annotations: READ_ONLY,
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
      source_id: z.string().describe(PARAM.sourceId),
    },
    execute: async (client, { notebook_id, source_id }) => {
      const source = await client.getSource(source_id, notebook_id);
      return { text: source.content };
    },
  },
  {
    name: "source_add_url",
    title: "Add web page or YouTube source",
    description:
      "Add a web page or a YouTube video to a notebook by URL. NotebookLM fetches the page itself, so it must be publicly " +
      "reachable. Returns the new source (id, title, type web_page or youtube); the title can show the URL until " +
      "processing finishes. If NotebookLM cannot fetch the page the call fails: check notebook_get before retrying.",
    annotations: CREATES,
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
      url: z.string().describe("Public http(s) URL of a web page or a YouTube video"),
    },
    execute: async (client, { notebook_id, url }) => {
      const source = await client.addUrlSource(notebook_id, url);
      return { source, message: "URL source added" };
    },
  },
  {
    name: "source_add_text",
    title: "Add text source",
    description:
      "Add text as a source. Pass the text in content, or a file_path to read it from a local file. file_path must sit " +
      "under the server's working directory or the OS temp directory; for any other file, read it yourself and pass " +
      "content. Returns the new source (id, title, type pasted_text).",
    annotations: CREATES,
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
      content: z.string().optional().describe("Text to add. Takes precedence over file_path"),
      file_path: z
        .string()
        .optional()
        .describe("Local file to read the text from, under the server's working directory or the OS temp directory"),
      title: z.string().describe("Title shown for the source in the notebook"),
    },
    execute: async (client, { notebook_id, content, file_path, title }) => {
      let documentContent = content;
      if (!documentContent && file_path) {
        const safePath = resolveAllowedReadPath(file_path);
        documentContent = fs.readFileSync(safePath, "utf8");
      }
      if (!documentContent) {
        throw new Error("Must provide either content or file_path");
      }
      const source = await client.addTextSource(notebook_id, documentContent, title);
      return { source, message: "Text source added" };
    },
  },
  {
    name: "source_add_drive",
    title: "Add Google Drive source",
    description:
      "Add a Google Drive file as a source, by its Drive file ID and MIME type. Returns the new source (id, title, type). " +
      "The source is a snapshot: when the Drive file changes, refresh it with source_sync_drive.",
    annotations: CREATES,
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
      file_id: z.string().describe("Google Drive file ID, the part after /d/ in the file's URL"),
      title: z.string().describe("Title shown for the source in the notebook"),
      doc_type: z
        .string()
        .describe("MIME type of the Drive file, e.g. application/vnd.google-apps.document for a Google Doc or application/pdf"),
    },
    execute: async (client, { notebook_id, file_id, title, doc_type }) => {
      const source = await client.addDriveSource(notebook_id, file_id, title, doc_type);
      return { source, message: "Drive source added" };
    },
  },
  {
    name: "source_sync_drive",
    title: "Sync Google Drive sources",
    description:
      "Re-import the given Google Drive sources so the notebook uses the latest version of each file. " +
      "With confirm=false it does nothing and returns pending_confirmation; with confirm=true it syncs and returns how " +
      "many sources were synced.",
    annotations: { ...UPDATES, destructiveHint: true },
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
      source_ids: z.array(z.string()).describe("IDs of the Drive sources to sync, from notebook_get"),
      confirm: z.boolean().describe("Must be true to sync. With false the tool only returns pending_confirmation"),
    },
    execute: async (client, { notebook_id, source_ids, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to sync these Drive sources.");
      await client.syncDrive(source_ids, notebook_id);
      return { message: `Synced ${source_ids.length} sources` };
    },
  },
  {
    name: "source_delete",
    title: "Delete source",
    description:
      "Permanently remove one source from a notebook. With confirm=false it does nothing and returns " +
      "pending_confirmation; with confirm=true it deletes and returns a confirmation message. This cannot be undone: " +
      "name the source to the user and get explicit approval first.",
    annotations: DESTROYS,
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
      source_id: z.string().describe(PARAM.sourceId),
      confirm: z.boolean().describe("Must be true to delete. With false the tool only returns pending_confirmation"),
    },
    execute: async (client, { notebook_id, source_id, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to delete this source. This cannot be undone.");
      await client.deleteSource(source_id, notebook_id);
      return { message: "Source deleted" };
    },
  },
];

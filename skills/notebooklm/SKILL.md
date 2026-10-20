---
name: notebooklm
description: Drive Google NotebookLM from the agent through the notebooklm-mcp server — create and manage notebooks, add sources (URLs, text, local files, Google Drive), ask questions answered only from those sources, run web/Drive research, and generate Studio content (audio overviews, video overviews, slide decks, reports, infographics, flashcards, quizzes). Use when the user mentions NotebookLM, a notebook of sources, "ask my sources", source-grounded answers, a podcast/audio overview, study guides, flashcards or quizzes from documents, or wants research collected into a notebook.
---

# NotebookLM via MCP

This skill uses the [`@m4ykeldev/notebooklm-mcp`](https://github.com/m4yk3ldev/notebooklm-mcp) server, which exposes NotebookLM as 27 MCP tools. NotebookLM has no public API; the server talks to the same internal RPC endpoint the web app uses, authenticated with the user's own Google session cookies.

## Setup

Check first: if tools such as `notebook_list` are already available, skip this section.

1. Authenticate once (opens Chrome, waits for the Google login, stores cookies in `~/.notebooklm-mcp/auth.json`):

   ```bash
   npx -y @m4ykeldev/notebooklm-mcp auth
   ```

   Headless / CI: set `NOTEBOOKLM_COOKIES` instead. Fallbacks: `auth --manual` (paste cookies) or `auth --file tokens.json`.

2. Register the server with the client.

   Claude Code:

   ```bash
   claude mcp add --transport stdio notebooklm -- npx -y @m4ykeldev/notebooklm-mcp serve
   ```

   Any JSON-configured client (Cursor, VS Code, Claude Desktop, ...):

   ```json
   {
     "mcpServers": {
       "notebooklm": {
         "command": "npx",
         "args": ["-y", "@m4ykeldev/notebooklm-mcp", "serve"]
       }
     }
   }
   ```

   Long answers on big notebooks: append `"--query-timeout", "180000"` to `args`.

The authentication step needs the user at a browser. Ask them to run it; do not try to log in on their behalf.

## Core workflow

1. **Find or create the notebook.** `notebook_list` returns IDs, titles and sources, up to `max_results` (default 100); if the count reaches it, call again with a higher value. Match by title before creating a duplicate. `notebook_create` returns the new ID.
2. **Add sources.**
   - `source_add_url` — web pages and YouTube links.
   - `source_add_text` — pass `content` inline, or `file_path` for a local file. `file_path` must sit under the server's working directory or the OS temp dir; for anything else, read the file and pass `content`.
   - `source_add_drive` — needs the Drive `file_id`, a `title` and the MIME `doc_type` (e.g. `application/vnd.google-apps.document`).
   - Each of these returns the new source's `id`. Sources take a moment to process; check with `notebook_get` before querying one you just added.
   - If `source_add_url` says NotebookLM could not fetch the page, check `notebook_get` before retrying: the source is sometimes listed anyway.
3. **Ask questions.** `notebook_query` answers only from the notebook's sources, using all of them by default. Restrict with `source_ids` when the user cares about specific documents. For follow-ups, pass back the returned `conversation_id` so the follow-up keeps context (the server remembers the conversation while it keeps running).
4. **Produce output** with the Studio tools (below), or summarise with `notebook_summarize`.

Prefer `notebook_query` over reading raw sources. Use `source_get_content` only when the user needs the verbatim text of a source.

## Research

Use when the user wants NotebookLM to find sources for them.

1. `research_start` with `query`, `source` (`web` default, or `drive`) and `mode` (`fast` default, or `deep` for a longer, more thorough pass). Returns a `task_id`.
2. Poll `research_status` until the status leaves `in_progress`. Deep research can take minutes; poll at a relaxed pace and tell the user it is still running.
3. Show the user what was found, then `research_import` with `source_indices` for the ones they want. Indices are positions in the `sources` list returned by `research_status`. Only web results (those with a URL) can be imported: omitting `source_indices` imports every web result and skips Drive ones, while an index pointing at a Drive result is an error.
4. Read the result: "Imported X of Y research sources". NotebookLM fetches each URL and silently skips the ones it can't reach, so X can be lower than Y. If none could be fetched the tool returns an error and the task shows `import_failed`; retrying usually works, or pick other results.

## Studio content

Every generator needs `confirm: true`. These consume the user's NotebookLM quota and take minutes, so confirm the type and options with the user before calling. `confirm` is a required boolean: with `confirm: false` the tool returns `pending_confirmation` and does nothing; omitting it is a validation error.

| Tool | Options |
|------|---------|
| `audio_overview_create` | `format`: deep_dive, brief, critique, debate · `length`: short, default, long · `language` · `focus_prompt` |
| `video_overview_create` | `format`: explainer, brief · `visual_style`: auto_select, classic, whiteboard, kawaii, anime, watercolor, retro_print, heritage, paper_craft, ... · `language` · `focus_prompt` |
| `slide_deck_create` | `format`: detailed_deck, presenter_slides · `length`: short, default · `language` · `focus_prompt` |
| `report_create` | `report_format`: Briefing Doc, Study Guide, Blog Post, Create Your Own (with `custom_prompt`) · `language` |
| `infographic_create` | `orientation`: landscape, portrait, square · `detail_level`: concise, standard, detailed · `language` · `focus_prompt` |
| `flashcards_create` | `difficulty`: easy, medium, hard |
| `quiz_create` | `question_count` (default 5) · `difficulty` |

All accept `source_ids` to limit which sources are used (omit for all). `language` is a BCP-47 code such as `en` or `es`; without it NotebookLM uses the account's language.

After starting one, poll `studio_status` for the notebook and find the artifact by the returned `artifact_id`: it lists older artifacts too. Each artifact reports `pending`, `generating`, `completed` or `failed`. Audio, video, infographics and slide decks (as PDF) get a `download_url` once completed. Give the user the URL; the download needs their Google session, so it opens in their browser. Reports, flashcards and quizzes have no file: point the user to the notebook in NotebookLM to read them.

## Housekeeping

- `notebook_rename`, `notebook_get` (sources and their IDs), `source_get` (one source's metadata).
- `source_sync_drive` re-pulls the latest version of Drive sources.
- `notebook_delete` and `source_delete` are permanent and need `confirm: true`. Name the exact notebook or source and get explicit approval from the user first.

## When things fail

- **Auth errors** (expired session, 401/403): call `auth_refresh` once. The server also tries to restore the session in the background. If it still fails, or the error says the session is signed out (redirected to Google sign-in, no CSRF token), ask the user to run `npx -y @m4ykeldev/notebooklm-mcp auth` again, then retry.
- **Timeouts on `notebook_query`**: suggest raising `--query-timeout`, or narrow the question with `source_ids`.
- **Unexpected or empty responses**: Google changes NotebookLM's internal API without notice. Report the error to the user rather than retrying in a loop, and suggest updating the package (`npx -y @m4ykeldev/notebooklm-mcp@latest serve`) or opening an issue on the GitHub repo.
- `auth_save_tokens` is a manual fallback for cookies. Use it only when the user hands you cookies explicitly, and never echo cookie values back in chat.

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- `notebook_rename` no longer mentions notebook notes, which no tool manages.

### Added
- `glama.json` names the maintainer for the Glama directory listing.

### Security
- vite 8.0.16 → 8.3.4 through a `pnpm-workspace.yaml` override (GHSA-587h-7wmj-h5pm,
  GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw). vite is a dev-only dependency of
  vitest and is not part of the published package.

## [0.5.0] - 2026-10-20

### Added
- Every tool publishes an MCP `outputSchema` and returns its result as
  `structuredContent` too, so clients get typed fields (the JSON text is unchanged)
  (#11).

### Changed
- Clearer descriptions for `notebook_list` (no paging: raise `max_results` when
  the count hits it), `notebook_create`, `notebook_rename`, `source_add_text`,
  `source_add_drive`, `source_sync_drive` and `studio_status`.

## [0.4.0] - 2026-10-20

A clearer tool catalog for the model: every tool now says what it returns, carries
MCP annotations, and follows one naming scheme. Several bugs found while rewriting
it are fixed (#9).

### Changed (BREAKING)
- Tools renamed to one `resource_action` scheme. Update prompts and client
  allow-lists that name the old tools (e.g. `mcp__notebooklm__notebook_add_url`):
  - `notebook_add_url` / `notebook_add_text` / `notebook_add_drive` →
    `source_add_url` / `source_add_text` / `source_add_drive`
  - `source_describe` → `source_get`
  - `notebook_describe` → `notebook_summarize`
  - `refresh_auth` / `save_auth_tokens` → `auth_refresh` / `auth_save_tokens`
- `source_get` returns `id`, `title`, `type` and `content_length`; the full text
  stays in `source_get_content`. The always-empty `summary` and `keywords` are gone.

### Added
- Every tool has a title, MCP annotations (read-only, destructive, idempotent,
  open-world) and a description of what it returns; every parameter is described.
- The server sends usage instructions to clients at initialization and reports
  its real version (it reported 0.1.0).
- `source_add_url`, `source_add_text` and `source_add_drive` return the created
  source, including its id.
- `notebook_summarize` also returns the questions NotebookLM suggests asking.

### Fixed
- `notebook_summarize` returned a nested array instead of the summary text.
- `auth_save_tokens` with an incomplete cookie set overwrote the stored session
  and signed the user out; it now refuses and keeps the session.
- `source_add_text` rejects a symlink that points outside the allowed folders.
- `source_add_drive` reports the source type from the MIME type (it always said
  `google_docs`); YouTube URLs are recognised by hostname.
- `report_create` rejects an unknown `report_format` instead of silently making a
  Briefing Doc.
- An unrecognised research status is reported as `unknown`, not `in_progress`.
- `source_add_url` explains when NotebookLM cannot fetch the page.
- The npm description says 27 tools, not 32.

### CI
- GitHub Actions moved off the deprecated Node 20 runtime (`pnpm/action-setup` v6,
  `action-gh-release` v3) and runners pinned to Ubuntu 24.04 (#10).

## [0.3.2] - 2026-10-18

Google moved NotebookLM to `notebook.google.com` and changed several internal
RPC shapes. Every tool was re-verified live against the current service (#8).

### Changed (BREAKING)
- Requires **Node.js ≥ 20** (`engines.node`). The MCP SDK 1.32 dependency tree
  needs it; Node 18 is end-of-life.

### Fixed
- Auth: target `notebook.google.com`. The old host 301s there and the redirect
  dropped the Cookie header, so every call failed with "Authentication expired"
  or HTTP 401 even with valid cookies (#6).
- Auth: keep only the cookies that apply to NotebookLM's host (`OSID` is
  host-only and exists once per Google host).
- Auth: a signed-out session now fails with a clear error asking to run `auth`,
  instead of `refresh_auth` reporting success. It does not open a browser on
  its own.
- `notebook_query` uses all sources by default (it used whatever was ticked in
  the web UI), `source_ids` works again, and `conversation_id` is returned so
  follow-ups keep context.
- `source_get_content` reads the current content format, including tables.
- Source types are reported correctly instead of `unknown`.
- Studio tools return the artifact id instead of the raw response, and fail
  clearly when none comes back.
- `studio_status` gives a `download_url` for audio, video, infographics and
  slide decks (PDF), and reports quizzes as `quiz` rather than `flashcards`.
- `research_import` works again (was rejected with INVALID_ARGUMENT). It reports
  "Imported X of Y", since NotebookLM skips URLs it cannot fetch. Without
  `source_indices` it imports every web result and skips Drive ones. A task
  whose import failed (`import_failed`) can be imported again.

### Added
- Agent skill at `skills/notebooklm/SKILL.md`, which teaches an agent when and
  how to use these tools.

### Security
- `@modelcontextprotocol/sdk` 1.29.0 → 1.32.1, vitest 4.1.11, and refreshed
  transitive dependencies. This clears 1 critical and 13 high advisories. esbuild
  is pinned to 0.28.2 through `pnpm-workspace.yaml` overrides. `pnpm audit` and
  osv-scanner report nothing.
- CI adds an osv-scanner job and runs the tests on Node 20, 22 and 24.

## [0.3.1] - 2026-07-11

### Fixed
- `notebook_delete` sent the wrong batchexecute payload (`[id]`) and was rejected
  by Google with INVALID_ARGUMENT; corrected to `[[id], [2]]` (verified live).

### Removed (BREAKING)
- Removed 5 tools whose batchexecute payloads Google rejects with INVALID_ARGUMENT
  and whose correct wire format is unknown: `chat_configure`, `source_list_drive`,
  `data_table_create`, `mind_map_create`, `studio_delete`. Tool count: 32 → 27.

## [0.3.0] - 2026-07-11

### Fixed
- stop stale Chrome from breaking DevTools port discovery

## [0.2.9] - 2026-06-19

### Fixed
- remove osv-scanner job (redundant with pnpm audit)

## [0.2.8] - 2026-06-19

### Fixed
- filter osv-scanner to HIGH+ severity only
- add .osv-scanner-ignore for esbuild low-severity dev-only CVE
- regenerate lockfile with pnpm-workspace.yaml overrides
- patch high CVEs in ws, hono, vite
- Chrome anti-detection flags and npx symlink resolution

### Chores
- remove .osv-scanner-ignore (no longer needed)
- update lockfile for pnpm v10 overrides

## [0.2.7] - 2026-06-19

## [0.2.6] - 2026-05-17

### Documentation
- full MCP usage + 15-client integration guide inline in README (#5)

## [0.2.5] - 2026-05-17

### Chores
- Audit remediation + rpc/* split + 100% coverage (#4)

## [0.2.4] - 2026-05-17

### Added
- gate release-push on pre-release audit
- add pre-release supply-chain audit script

### Fixed
- address Qodo review (3 bugs)
- pin patched transitive versions via pnpm.overrides
- guard ANSI colors on non-TTY output

### Changed
- migrate npm → pnpm across audit script, CI, docs

### Documentation
- document pre-release audit and release flow
- pre-release supply-chain audit plan
- enhance README with installation instructions and tool descriptions

### Chores
- pin all dev deps and pnpm overrides to exact versions
- harden publish workflow with secret-scan, osv, supply-chain audit chain

## [0.2.3] - 2026-04-21

## [0.2.2] - 2026-04-21

### Chores
- raise coverage to 95% stmts / 96% funcs
- raise coverage from 25% to 50% stmts (tools to 100%)
- bump checkout/setup-node to v6 for Node.js 24 runtime

## [0.2.1] - 2026-04-21

### Fixed
- decouple release-push from release target

### Chores
- exclude sourcemaps from npm tarball

## [0.2.0] - 2026-04-21

### Fixed
- correct source_delete payload shape and surface non-auth errors

### Chores
- add make release automation
- add batchexecute debugging and bulk-delete utilities

## [0.1.31] - 2026-04-15

### Documentation
- **Backfilled CHANGELOG**: Added missing entries for `0.1.27` and `0.1.28` (audio/video transcript extraction and `notebook_query` RPC restoration).
- **Refreshed Contributor Guides**: `CONTRIBUTING.md`, `GEMINI.md`, and `CLAUDE.md` now reflect the real `src/tools/` registration framework, the `npm test` workflow, and the raw-CDP (no Puppeteer/Playwright) auth flow.

### Security
- **Hardened `.gitignore`**: Local cookie/auth artifacts (`cokie.txt`, `cookie.txt`, `cookies.txt`, `auth.json`, `*.cookies`) are now ignored by default to prevent accidental credential commits.
- **Purged Leaked Cookie Artifact**: A previously committed `cokie.txt` containing real session cookies was removed from the entire git history; affected sessions have been rotated.

## [0.1.30] - 2026-02-26

### Fixed
- **Query Tool Reliability**: Implemented session expiration detection and automatic background retry for the `query` tool, matching the robustness of other RPC tools.
- **Test Suite Integrity**: Corrected parsing logic in unit tests to align with Google's nested response format.
- **Cleaner Test Output**: Added mocks for background warm-up RPC calls (Settings) to eliminate noisy MSW warnings during test execution.

## [0.1.28] - 2026-02-26

### Fixed
- **`notebook_query` Restoration**: Reimplemented the query RPC against Google's newly discovered request structure with nested response parsing, restoring grounded Q&A after a backend change broke the previous format.

## [0.1.27] - 2026-02-26

### Fixed
- **Studio Transcript Extraction**: Audio and video overview transcriptions are now extracted from Google's nested block format, so `studio_status` returns the full transcript instead of an empty payload.

## [0.1.26] - 2026-02-26

### Added
- **Comprehensive Validation Suite**: Added 32 dedicated validation plans in `docs/plans/` to verify every tool in the MCP server.
- **CI Test Gate**: Updated GitHub Actions to run full test suites before allowing publication to NPM.

### Fixed
- **GitHub Release Automation**: Fixed permission issues in CI by providing an explicit `GITHUB_TOKEN` for the Release step.
- **RPC Stability**: Implemented automatic "unwrapping" of Google's nested RPC response format, significantly improving reliability for `notebook_get` and `notebook_list`.
- **Param Simplification**: Corrected permission errors by simplifying RPC parameter structures for notebook creation and retrieval.
- **Studio Polling**: Fixed artifact status parsing in `pollStudio` to correctly identify completed generation tasks.
- **Auth Robustness**: Updated CDP authentication to verify the NotebookLM page has fully loaded before resolving, preventing premature resolution with stale cookies.
- **Error Masking**: Eliminated silent failures in RPC retries; the server now correctly propagates authentication errors.

### Removed
- All diagnostic and debug `console.error` logs for a clean production state.

## [0.1.22] - 2026-02-21

### Changed
- Improved Chrome launcher compatibility by adding `%U` argument for some Linux environments.
- Polished all CLI messages and error handling with professional, benefits-oriented copywriting.
- Rewrote `README.md` for clarity, impact, and to better showcase the "Smart Authentication" feature.

## [0.1.21] - 2026-02-21

### Added
- **Invisible Background Auth Refresh**: The server now detects authentication expiration and automatically attempts to refresh cookies using a headless Chrome process.
- **Automatic Retry**: Failed tool requests due to session expiration are transparently retried after a successful background refresh.
- **Smart Fallback**: If background refresh fails, the server automatically opens a visible Chrome window for user-assisted login.

## [0.1.20] - 2026-02-21

### Added
- **Smart Authentication Flow**: Automated cookie extraction using Chrome DevTools Protocol (CDP).
- **Persistent Browser Profile**: Uses a dedicated Chrome profile (`~/.notebooklm-mcp/chrome-profile`) to maintain login sessions.
- **Manual Auth Fallback**: Added `--manual` flag to the `auth` command for traditional copy-paste cookie extraction.
- **Project Guidance**: Added `GEMINI.md` for better context in AI-assisted development.

### Changed
- Improved `README.md` documentation for the new authentication process.
- Updated CLI version to `0.1.20`.

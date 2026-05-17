# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

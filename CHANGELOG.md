# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.25] - 2026-02-26

### Added
- **Comprehensive Validation Suite**: Added 32 dedicated validation plans in `docs/plans/` to verify every tool in the MCP server.
- **CI Test Gate**: Updated GitHub Actions to run full test suites before allowing publication to NPM.

### Fixed
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

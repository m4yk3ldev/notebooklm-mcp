# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.20] - 2026-02-21

### Added
- **Smart Authentication Flow**: Automated cookie extraction using Chrome DevTools Protocol (CDP).
- **Persistent Browser Profile**: Uses a dedicated Chrome profile (`~/.notebooklm-mcp/chrome-profile`) to maintain login sessions.
- **Manual Auth Fallback**: Added `--manual` flag to the `auth` command for traditional copy-paste cookie extraction.
- **Project Guidance**: Added `GEMINI.md` for better context in AI-assisted development.

### Changed
- Improved `README.md` documentation for the new authentication process.
- Updated CLI version to `0.1.20`.

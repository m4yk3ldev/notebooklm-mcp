# NotebookLM MCP Server - Project Context

This file provides the foundational context, architecture, and engineering standards for the NotebookLM MCP Server project.

## Project Overview
The NotebookLM MCP Server is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) implementation that exposes the capabilities of [Google NotebookLM](https://notebooklm.google.com) to AI models. It facilitates deep integration of NotebookLM's notebook management, source ingestion, RAG-based querying, and studio content generation into AI-assisted workflows.

### Key Technologies
- **Runtime**: Node.js (>=18)
- **Language**: TypeScript (strict)
- **Package manager**: **pnpm** (pinned via `packageManager: "pnpm@10.33.0"`; use `corepack enable && pnpm install`)
- **Framework**: `@modelcontextprotocol/sdk`
- **Bundler**: `tsup`
- **CLI**: `commander`
- **Validation**: `zod`
- **Testing**: `vitest` + `msw` (100% statements/branches/functions/lines, enforced by CI)
- **API Communication**: Direct interaction with Google's internal `batchexecute` RPC endpoint via `fetch`.

## Architecture
The project follows a modular SRP-respecting architecture centered around the MCP specification:

- **Entry Points**:
  - `src/cli.ts`: Handles CLI commands (`serve`, `auth`). Version read from `package.json` at runtime.
  - `src/server.ts`: Initializes the `McpServer` and orchestrates tool registration.
- **Core Client (domain facade)**:
  - `src/client.ts`: `NotebookLMClient` — public surface for tools. Domain methods (`listNotebooks`, `query`, `createAudioOverview`, etc.) delegate infrastructure to the `rpc/*` collaborators.
- **RPC layer** (extracted 2026-05-17):
  - `src/rpc/transport.ts`: `RpcTransport` — HTTP POST/GET to batchexecute and query endpoints. Enforces `response.ok`, merges Set-Cookie via `AuthState`, wraps `response.text()` in a race-with-abort so slow bodies actually honor the timeout.
  - `src/rpc/auth-state.ts`: `AuthState` — owns tokens / csrfToken / sessionId / cookies. Provides a single-flight `refreshOnce()` mutex (concurrent callers share one refresh), `reloadIfNewer()` disk pickup, and persisted `recordSessionId` / `recordCsrfToken` / `recordSetCookies` writes.
  - `src/rpc/wire.ts`: Pure parsers — `parseResponse` (batchexecute envelope) and `extractTextFromBlocks`.
- **Tools**:
  - `src/tools/`: Directory containing modular tool definitions (e.g., `notebook.ts`, `source.ts`, `query.ts`, `studio.ts`).
  - `src/tools/index.ts`: Central registration point; also exports `resolveSourceIds()` (used by 9 studio tools) and `clientResetSignal()` (typed replacement for the legacy `_client_action: "reset"` string).
- **Authentication**:
  - `src/auth.ts`: Logic for token loading, saving (mode `0600`), validation, and the manual auth flow. `~/.notebooklm-mcp/` is created with mode `0700`.
  - `src/browser-auth.ts`: Launches Chrome with `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1` and discovers the OS-assigned port by parsing the `DevTools listening on ws://127.0.0.1:NNNN/` stderr line. Drives it directly via the Chrome DevTools Protocol (CDP) over a raw `ws` WebSocket — no Puppeteer/Playwright dependency.

## Building and Running

### Development Commands
- **Install Dependencies**: `corepack enable && pnpm install`
- **Build**: `pnpm run build` (outputs to `dist/`)
- **Watch Mode**: `pnpm run dev`
- **Tests**: `pnpm test` (vitest + MSW; CI runs this before publishing to NPM)
- **Coverage**: `pnpm run test:coverage` — thresholds 100/100/100/100 (statements / branches / functions / lines)
- **Lint/Format**: TypeScript strict mode is the primary quality gate.
- **Release**: `make release` → `make release-push` (runs the supply-chain audit gate before pushing the tag; CI publishes via OIDC). See `CONTRIBUTING.md → Releasing`.

### Running the Server
```bash
# Direct run from source
node dist/cli.js serve

# Using the CLI binary (if linked)
notebooklm-mcp serve
```

### Authentication
The server uses cookie-based authentication.
- **Automated Flow**: `notebooklm-mcp auth` launches a dedicated Chrome instance bound to `127.0.0.1` on an OS-assigned ephemeral port and automatically extracts cookies via CDP.
- **Manual Flow**: `notebooklm-mcp auth --manual` guides the user through manual cookie copy-pasting from their browser.
- **Environment Variables**: `NOTEBOOKLM_COOKIES` can be set directly for headless/CI environments.
- **Cache**: Tokens are stored at `~/.notebooklm-mcp/auth.json` (mode `0600`) inside `~/.notebooklm-mcp/` (mode `0700`).
- **Dedicated Profile**: Automated auth uses a persistent profile at `~/.notebooklm-mcp/chrome-profile` (mode `0700`).
- **Refresh mutex**: when several concurrent RPCs hit `AuthenticationError` at the same time, only the first one spawns the headless/manual Chrome flow; the rest await the same `AuthState.refreshOnce()` promise.

## Engineering Standards & Conventions

### Development Workflow
1. **Tool Addition**: Define new tools in `src/tools/` using the `McpServer.tool()` pattern or the project's internal `registerTools` abstraction. Use `resolveSourceIds(client, notebookId, sourceIds)` instead of inlining the "all sources of the notebook" expansion.
2. **Schema Validation**: Every tool input MUST be validated using `zod`.
3. **Error Handling**:
   - Use `AuthenticationError` for session expirations (still exported from `src/client.ts`).
   - Tool results should be returned as `ToolResult` to maintain MCP compliance.
   - To request a client re-init after auth changes, return `clientResetSignal({...})` from a tool — do not write the legacy `_client_action: "reset"` string by hand.
4. **RPC Integration**: New NotebookLM features require identifying the corresponding `rpcId` in `src/constants.ts`, calling it via `this.transport.callBatchexecute(...)` from a method on `NotebookLMClient`, and exposing a tool wrapper in `src/tools/`.
5. **Filesystem boundaries**: any tool that reads a user-provided path MUST validate the path against `resolveAllowedReadPath` (currently used by `notebook_add_text`). The allowed roots are `process.cwd()` and `os.tmpdir()`.

### Technical Integrity
- **Statelessness**: The MCP server itself should remain largely stateless, delegating state management to the NotebookLM backend and the local `auth.json` cache.
- **Timeouts**: Use `EXTENDED_TIMEOUT` (defined in `constants.ts`) for long-running operations like studio artifact generation or deep research.
- **Citations**: When implementing query tools, ensure that citations and source references are preserved and accurately mapped.

## File Map (Key Files)
- `src/client.ts`: Domain facade — `NotebookLMClient`. Composes the `rpc/*` collaborators; one public method per Google capability.
- `src/rpc/transport.ts`: `RpcTransport` — HTTP transport (fetch + abort + body race + status check + Set-Cookie merge).
- `src/rpc/auth-state.ts`: `AuthState` — token / csrf / session state, single-flight refresh mutex, disk reload.
- `src/rpc/wire.ts`: Pure batchexecute envelope parsers.
- `src/server.ts`: Server configuration and tool mounting.
- `src/constants.ts`: Contains RPC IDs, URLs, and default configuration values.
- `src/types.ts`: Shared TypeScript interfaces and types.
- `src/tools/`: Implementations of the 32 available tools.
- `docs/plans/`: Implementation plans, including the 2026-05-17 modular refactor.
- `docs/audits/`: Audit reports (multi-focus 6-agent audit, 2026-05-17).

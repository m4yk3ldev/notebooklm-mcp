# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (pnpm pinned via packageManager field)
corepack enable
pnpm install

# Build (outputs to dist/)
pnpm run build

# Watch mode for development
pnpm run dev

# Run the built CLI directly
node dist/cli.js serve
node dist/cli.js auth
```

```bash
# Run the test suite (vitest + MSW)
pnpm test
```

```bash
# Release flow
make release        # local bump + tag
make release-push   # supply-chain audit then push (publishes via CI on tag)
make pre-release    # standalone audit
```

TypeScript strict mode is the primary quality gate — fix all type errors before building. CI runs `pnpm test` before publishing to NPM.

## Architecture

This is an MCP (Model Context Protocol) server that bridges AI assistants to Google NotebookLM's internal `batchexecute` RPC API.

### Data Flow

```
MCP Client (Claude/Cursor/VS Code)
  → stdio transport
  → McpServer (src/server.ts)
  → Tool handler (src/tools/*.ts)
  → NotebookLMClient (src/client.ts)  ── domain facade ──┐
        composes:                                        │
          AuthState     (src/rpc/auth-state.ts)          │
          RpcTransport  (src/rpc/transport.ts) ──────────┤
          wire helpers  (src/rpc/wire.ts)                │
  → Google batchexecute RPC endpoint  ◀──────────────────┘
```

### Key Files

| File | Role |
|------|------|
| `src/cli.ts` | Entry point; defines `serve` and `auth` CLI commands |
| `src/server.ts` | Creates `McpServer`, wires tools to a lazily-initialized `NotebookLMClient` |
| `src/client.ts` | `NotebookLMClient` — thin domain facade that composes the `rpc/*` modules. Public surface for tools. |
| `src/rpc/transport.ts` | `RpcTransport` — HTTP POST/GET, `response.ok` enforcement, Set-Cookie merge, abort-bound body read |
| `src/rpc/auth-state.ts` | `AuthState` — tokens / csrf / session id state, single-flight refresh mutex, disk reload |
| `src/rpc/wire.ts` | Pure parsers — `parseResponse` (batchexecute envelope) and `extractTextFromBlocks` |
| `src/auth.ts` | Token load/save, cookie validation, manual auth flow |
| `src/browser-auth.ts` | Chrome CDP-based automated cookie extraction (OS-assigned port, loopback bind) |
| `src/constants.ts` | All `RPC_IDS`, CodeMapper enums, timeouts, URLs |
| `src/types.ts` | Shared TypeScript interfaces (`AuthTokens`, `Notebook`, etc.) |
| `src/tools/index.ts` | `McpTool<T>` interface, `registerTools()`, `resolveSourceIds()`, `clientResetSignal()` |
| `src/tools/*.ts` | Tool implementations grouped by domain (notebook, source, studio, query, research, auth) |

### rpc/ split rationale

`NotebookLMClient` used to be a 1.4k-LOC class that mixed HTTP transport, auth state, wire-format parsing and domain logic. The split (audit-driven, 2026-05-17) factors each concern into a small SRP-respecting module:

- **`RpcTransport`** owns the wire: fetch + abort + Set-Cookie + HTTP status. It does not know about tokens beyond what `AuthState` exposes.
- **`AuthState`** owns the credential lifecycle: getters for current values, single-flight `refreshOnce()` mutex (no more concurrent Chrome launches), `reloadIfNewer()` for disk-cache pickup, `recordSetCookies` / `recordSessionId` / `recordCsrfToken` write paths.
- **`wire`** is a pure function module — no `this`, easy to test, reusable in the streaming `query()` code path.
- **`NotebookLMClient`** stays the only entry point tools import. Public method signatures are unchanged.

`AuthenticationError` is still exported from `src/client.ts` for backward compatibility.

### Tool System

Each tool file exports an array of `McpTool` objects:

```typescript
export const myTools: McpTool<typeof schema>[] = [{
  name: "tool_name",
  description: "...",
  schema: { param: z.string() },  // zod schema — omit for no-arg tools
  execute: async (client, args, opts) => { ... }
}];
```

`registerTools()` in `src/tools/index.ts` loops over these, registers them on the `McpServer`, and wraps execution with error handling. Tool results are returned as JSON with a `status` field. Use `{ _client_action: "reset" }` in a result to trigger client re-initialization (used after auth changes).

### RPC Integration

All NotebookLM calls go through `NotebookLMClient.callRpc(rpcId, params)`. Adding a new feature requires:
1. Adding the `rpcId` to `RPC_IDS` in `src/constants.ts`
2. Implementing the method in `NotebookLMClient` (parse the nested array response format)
3. Adding a `McpTool` entry in the appropriate `src/tools/*.ts` file

For operations that take a long time (studio generation, deep research, polling), use `EXTENDED_TIMEOUT` (120s). Default is `DEFAULT_TIMEOUT` (30s).

### Authentication

Token resolution order: `NOTEBOOKLM_COOKIES` env var → `~/.notebooklm-mcp/auth.json` → error.

Automated auth uses Chrome DevTools Protocol (CDP) on port 9229. `browser-auth.ts` launches Chrome with `--remote-debugging-port`, connects via WebSocket, and polls `Network.getCookies` until the required cookies (`SID`, `HSID`, `SSID`, `APISID`, `SAPISID`) appear.

The `NotebookLMClient` auto-fetches CSRF token and session ID from the NotebookLM page HTML on first use, and can trigger headless browser refresh when session expires.

### Build Output

`tsup` bundles `src/cli.ts` → `dist/cli.js` as a single ESM file with a `#!/usr/bin/env node` shebang. Only `dist/` is published to npm.

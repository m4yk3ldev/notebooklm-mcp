# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Build (outputs to dist/)
npm run build

# Watch mode for development
npm run dev

# Run the built CLI directly
node dist/cli.js serve
node dist/cli.js auth
```

There are no test scripts. TypeScript strict mode is the primary quality gate — fix all type errors before building.

## Architecture

This is an MCP (Model Context Protocol) server that bridges AI assistants to Google NotebookLM's internal `batchexecute` RPC API.

### Data Flow

```
MCP Client (Claude/Cursor/VS Code)
  → stdio transport
  → McpServer (src/server.ts)
  → Tool handler (src/tools/*.ts)
  → NotebookLMClient (src/client.ts)
  → Google batchexecute RPC endpoint
```

### Key Files

| File | Role |
|------|------|
| `src/cli.ts` | Entry point; defines `serve` and `auth` CLI commands |
| `src/server.ts` | Creates `McpServer`, wires tools to a lazily-initialized `NotebookLMClient` |
| `src/client.ts` | `NotebookLMClient` — all Google RPC calls, response parsing, auth refresh |
| `src/auth.ts` | Token load/save, cookie validation, manual auth flow |
| `src/browser-auth.ts` | Chrome CDP-based automated cookie extraction |
| `src/constants.ts` | All `RPC_IDS`, CodeMapper enums, timeouts, URLs |
| `src/types.ts` | Shared TypeScript interfaces (`AuthTokens`, `Notebook`, etc.) |
| `src/tools/index.ts` | `McpTool<T>` interface and `registerTools()` — the tool registration framework |
| `src/tools/*.ts` | Tool implementations grouped by domain (notebook, source, studio, query, research, auth) |

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

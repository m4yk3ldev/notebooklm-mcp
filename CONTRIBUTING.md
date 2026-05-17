# Contributing to NotebookLM MCP

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

1. **Clone the repository**

```bash
git clone https://github.com/m4yk3ldev/notebooklm-mcp.git
cd notebooklm-mcp
```

2. **Install dependencies**

This repo uses **pnpm** (pinned via the `packageManager` field in `package.json`).
Use Corepack to get the matching pnpm version automatically:

```bash
corepack enable
pnpm install
```

3. **Build**

```bash
pnpm run build
```

4. **Run in dev mode** (rebuilds on file changes)

```bash
pnpm run dev
```

5. **Run the test suite** (vitest + MSW)

```bash
pnpm test
```

## Project Structure

```
src/
  cli.ts            # Entry point — commander subcommands (serve, auth); version read from package.json
  server.ts         # MCP server bootstrap — wires tools to a lazy NotebookLMClient
  client.ts         # NotebookLMClient — thin domain facade composing rpc/* collaborators
  rpc/
    transport.ts    # RpcTransport — fetch + response.ok + Set-Cookie merge + abort-bound body read
    auth-state.ts   # AuthState — tokens / csrf / sessionId, single-flight refresh mutex, disk reload
    wire.ts         # Pure parsers — parseResponse, extractTextFromBlocks
  auth.ts           # Token load/save (mode 0600), cookie validation, manual auth flow
  browser-auth.ts   # Chrome DevTools Protocol (CDP) — OS-assigned port, loopback bind
  constants.ts      # RPC IDs, enum mappers, URLs, config values
  types.ts          # Shared TypeScript interfaces
  tools/
    index.ts        # McpTool<T> interface, registerTools(), resolveSourceIds(), clientResetSignal()
    auth.ts         # Auth helper tools
    notebook.ts     # Notebook CRUD tools
    source.ts       # Source ingestion / management tools (with path-traversal guard)
    query.ts        # Grounded Q&A and chat config
    research.ts     # Deep research tools
    studio.ts       # Studio artifact generation tools
  __tests__/        # vitest + MSW unit and integration tests (100% coverage)
```

## How It Works

The server communicates with NotebookLM through Google's internal `batchexecute` RPC endpoint. Authentication is cookie-based — users authenticate via the bundled Chrome flow (`notebooklm-mcp auth`), and the resulting cookies are persisted to `~/.notebooklm-mcp/auth.json` (mode `0600`).

Internally, `NotebookLMClient` (in `src/client.ts`) is a **domain facade**: each public method (`listNotebooks`, `query`, `createAudioOverview`, …) is a small wrapper that delegates infrastructure to three single-purpose modules under `src/rpc/`:

| Module | Owns |
|---|---|
| `RpcTransport` (`rpc/transport.ts`) | Outbound HTTP. Enforces `response.ok`, races `response.text()` against the abort signal so slow bodies actually time out, and merges Set-Cookie headers into `AuthState`. |
| `AuthState` (`rpc/auth-state.ts`) | Token / CSRF / session state. `refreshOnce()` is single-flight — concurrent callers share one promise and only one Chrome flow is spawned per refresh round. `reloadIfNewer()` checks the disk cache first so out-of-process refreshes are picked up. |
| `wire` (`rpc/wire.ts`) | Pure parsers for the batchexecute envelope (`parseResponse`) and answer text extraction (`extractTextFromBlocks`). No `this`, fully unit-testable. |

When you add a new RPC capability you only touch `src/constants.ts` (for the rpc id), one method on `NotebookLMClient` (calling `this.transport.callBatchexecute(...)`), and a tool wrapper in `src/tools/`. The transport, retry, abort, status, and refresh concerns are already taken care of.

## Making Changes

1. **Fork** the repository
2. **Create a branch** for your feature or fix: `git checkout -b feat/my-feature`
3. **Make your changes** in the `src/` directory
4. **Build and test** locally: `pnpm run build`
5. **Test the CLI** manually:
   ```bash
   node dist/cli.js auth --show-tokens
   node dist/cli.js serve
   ```
6. **Commit** with a descriptive message following [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat: add new tool for X`
   - `fix: handle expired cookies gracefully`
   - `docs: update README examples`
   - `refactor: simplify RPC response parsing`
7. **Push** your branch and open a **Pull Request**

## Code Guidelines

- **TypeScript strict mode** — no `any` types unless absolutely necessary
- **Keep it simple** — avoid unnecessary abstractions
- **Follow existing patterns** — look at how current tools are exported from `src/tools/*.ts` and registered via `registerTools()` in `src/tools/index.ts`
- **Use Zod schemas** for all tool input validation
- **Static imports only** — the project uses ESM; avoid dynamic `require()`

## Adding a New Tool

1. Add the RPC ID to `RPC_IDS` in `src/constants.ts` (if it uses a new endpoint)
2. Implement the corresponding method on `NotebookLMClient` in `src/client.ts`, parsing the nested array response format
3. Add an `McpTool` entry in the appropriate `src/tools/*.ts` module:
   - A clear `name` and `description`
   - A Zod `schema` (omit for no-arg tools)
   - An `execute(client, args, opts)` handler that returns a JSON-serializable object with a `status` field
4. If the tool needs to trigger client re-initialization (e.g. after auth changes), return `{ _client_action: "reset" }` in its result
5. Add any new types to `src/types.ts` and cover the new behavior with a test in `src/__tests__/`

## Reporting Issues

- Use [GitHub Issues](https://github.com/m4yk3ldev/notebooklm-mcp/issues)
- Include your Node.js version, OS, and steps to reproduce
- For authentication issues, include which cookies are present (not the values!)

## Releasing

Releases are cut from `main`. The flow:

```bash
make release        # bumps version, updates CHANGELOG, commits, tags (local only)
make pre-release    # optional: run audit early to catch issues before tagging
make release-push   # runs pre-release audit, then pushes commit + tag to origin
```

`make release-push` will refuse to push if any of the following fail:

1. Uncommitted changes in the working tree
2. `pnpm install --frozen-lockfile` — lockfile / `package.json` drift, SHA-512 integrity
3. `pnpm run build` — type or build errors
4. `pnpm test`
5. `pnpm audit --audit-level=high` — known high/critical CVEs in deps
6. `npm audit signatures` — tampered or unsigned packages in `node_modules` (pnpm has no equivalent; npm CLI must be on PATH)
7. `pnpm-lock.yaml` registry pinning — any transitive tarball resolves to a non-npm registry or any git/github resolution
8. `npm pack --dry-run` — unexpected files (e.g. `src/`, `scripts/`, `.env`) in the publish manifest

Emergency override (logs the bypass):

```bash
SKIP_AUDIT_LEVEL=1 make release-push   # accept current vuln findings
```

Optional supply-chain deep scan via Socket (requires `SOCKET_SECURITY_API_KEY`):

```bash
SKIP_SOCKET=0 make pre-release
```

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

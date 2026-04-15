# Contributing to NotebookLM MCP

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

1. **Clone the repository**

```bash
git clone https://github.com/m4yk3ldev/notebooklm-mcp.git
cd notebooklm-mcp
```

2. **Install dependencies**

```bash
npm install
```

3. **Build**

```bash
npm run build
```

4. **Run in dev mode** (rebuilds on file changes)

```bash
npm run dev
```

5. **Run the test suite** (vitest + MSW)

```bash
npm test
```

## Project Structure

```
src/
  cli.ts          # Entry point — commander subcommands (serve, auth)
  server.ts       # MCP server bootstrap — wires tools to a lazy NotebookLMClient
  client.ts       # NotebookLMClient — HTTP/RPC calls to batchexecute API
  auth.ts         # Token load/save, cookie validation, manual auth flow
  browser-auth.ts # Chrome DevTools Protocol (CDP) automated cookie extraction
  constants.ts    # RPC IDs, enum mappers, URLs, config values
  types.ts        # Shared TypeScript interfaces
  tools/
    index.ts      # McpTool<T> interface + registerTools() framework
    auth.ts       # Auth helper tools
    notebook.ts   # Notebook CRUD tools
    source.ts     # Source ingestion / management tools
    query.ts      # Grounded Q&A and chat config
    research.ts   # Deep research tools
    studio.ts     # Studio artifact generation tools
  __tests__/      # vitest + MSW unit and integration tests
```

## How It Works

The server communicates with NotebookLM through Google's internal `batchexecute` RPC endpoint. Authentication is cookie-based — users paste their browser cookies, which are stored in `~/.notebooklm-mcp/auth.json`.

Each MCP tool maps to one or more RPC calls defined in `constants.ts`. The `client.ts` file handles request encoding, response parsing, and automatic CSRF token refresh.

## Making Changes

1. **Fork** the repository
2. **Create a branch** for your feature or fix: `git checkout -b feat/my-feature`
3. **Make your changes** in the `src/` directory
4. **Build and test** locally: `npm run build`
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

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

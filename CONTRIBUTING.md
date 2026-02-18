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

## Project Structure

```
src/
  cli.ts        # Entry point — commander subcommands (serve, auth)
  server.ts     # MCP server — 32 tool registrations with Zod schemas
  client.ts     # NotebookLMClient — HTTP/RPC calls to batchexecute API
  auth.ts       # Cookie extraction, caching, and validation
  constants.ts  # RPC IDs, enum mappers, URLs, config values
  types.ts      # Shared TypeScript interfaces
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
- **Follow existing patterns** — look at how current tools are registered in `server.ts`
- **Use Zod schemas** for all tool input validation
- **Static imports only** — the project uses ESM; avoid dynamic `require()`

## Adding a New Tool

1. Add the RPC ID to `constants.ts` (if it uses a new endpoint)
2. Add the client method to `client.ts`
3. Register the tool in `server.ts` with:
   - A clear name and description
   - A Zod schema for input validation
   - Proper error handling with the `ok()` / `err()` helpers
4. Add any new types to `types.ts`

## Reporting Issues

- Use [GitHub Issues](https://github.com/m4yk3ldev/notebooklm-mcp/issues)
- Include your Node.js version, OS, and steps to reproduce
- For authentication issues, include which cookies are present (not the values!)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

# NotebookLM MCP Server - Project Context

This file provides the foundational context, architecture, and engineering standards for the NotebookLM MCP Server project.

## Project Overview
The NotebookLM MCP Server is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) implementation that exposes the capabilities of [Google NotebookLM](https://notebooklm.google.com) to AI models. It facilitates deep integration of NotebookLM's notebook management, source ingestion, RAG-based querying, and studio content generation into AI-assisted workflows.

### Key Technologies
- **Runtime**: Node.js (>=18)
- **Language**: TypeScript
- **Framework**: `@modelcontextprotocol/sdk`
- **Bundler**: `tsup`
- **CLI**: `commander`
- **Validation**: `zod`
- **API Communication**: Direct interaction with Google's internal `batchexecute` RPC endpoint via `fetch`.

## Architecture
The project follows a modular architecture centered around the MCP specification:

- **Entry Points**:
  - `src/cli.ts`: Handles CLI commands (`serve`, `auth`).
  - `src/server.ts`: Initializes the `McpServer` and orchestrates tool registration.
- **Core Client**:
  - `src/client.ts`: Contains the `NotebookLMClient`, which encapsulates the logic for RPC calls, response parsing, and session management.
- **Tools**:
  - `src/tools/`: Directory containing modular tool definitions (e.g., `notebook.ts`, `source.ts`, `query.ts`, `studio.ts`).
  - `src/tools/index.ts`: Central registration point for all tools.
- **Authentication**:
  - `src/auth.ts`: Logic for token loading, saving, and browser-based cookie extraction.
  - `src/browser-auth.ts`: Puppeteer/Playwright-style browser automation for interactive auth.

## Building and Running

### Development Commands
- **Install Dependencies**: `npm install`
- **Build**: `npm run build` (Outputs to `dist/`)
- **Watch Mode**: `npm run dev`
- **Lint/Format**: (Check `package.json` for additions; currently relies on TypeScript for basic checks)

### Running the Server
```bash
# Direct run from source
node dist/cli.js serve

# Using the CLI binary (if linked)
notebooklm-mcp serve
```

### Authentication
The server uses cookie-based authentication.
- **Automated Flow**: `notebooklm-mcp auth` launches a dedicated Chrome instance and automatically extracts cookies via CDP.
- **Manual Flow**: `notebooklm-mcp auth --manual` guides the user through manual cookie copy-pasting from their browser.
- **Environment Variables**: `NOTEBOOKLM_COOKIES` can be set directly for headless/CI environments.
- **Cache**: Tokens are stored at `~/.notebooklm-mcp/auth.json`.
- **Dedicated Profile**: Automated auth uses a persistent profile at `~/.notebooklm-mcp/chrome-profile`.

## Engineering Standards & Conventions

### Development Workflow
1. **Tool Addition**: Define new tools in `src/tools/` using the `McpServer.tool()` pattern or the project's internal `registerTools` abstraction.
2. **Schema Validation**: Every tool input MUST be validated using `zod`.
3. **Error Handling**: 
   - Use `AuthenticationError` for session expirations.
   - Tool results should be returned as `ToolResult` to maintain MCP compliance.
4. **RPC Integration**: New NotebookLM features require identifying the corresponding `rpcId` in `src/constants.ts` and implementing the logic in `NotebookLMClient`.

### Technical Integrity
- **Statelessness**: The MCP server itself should remain largely stateless, delegating state management to the NotebookLM backend and the local `auth.json` cache.
- **Timeouts**: Use `EXTENDED_TIMEOUT` (defined in `constants.ts`) for long-running operations like studio artifact generation or deep research.
- **Citations**: When implementing query tools, ensure that citations and source references are preserved and accurately mapped.

## File Map (Key Files)
- `src/client.ts`: The "brain" of the project; handles all Google RPC logic.
- `src/server.ts`: Server configuration and tool mounting.
- `src/constants.ts`: Contains RPC IDs, URLs, and default configuration values.
- `src/types.ts`: Shared TypeScript interfaces and types.
- `src/tools/`: Implementations of the 32+ available tools.

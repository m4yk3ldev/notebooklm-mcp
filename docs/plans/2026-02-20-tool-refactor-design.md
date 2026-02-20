# NotebookLM MCP Server - Tool Refactoring Design

## Objective

Refactor the tool registrations in `src/server.ts` to follow a more modular, maintainable, and scalable architecture by extracting tools into separate files based on their functional category.

## Current State

All 32 tools are defined inline inside the `createServer` function in `src/server.ts`. This results in a massive (~600 line) file that mixes server configuration, dependency injection, and business logic for all tools.

## Proposed Architecture (Approach 3: Tool Definition Interface)

We will introduce a generic `McpTool` interface. All tools will be defined as objects conforming to this interface. The tools will be grouped by category into separate files inside a new `src/tools/` directory.

### 1. The Core Interface (`src/tools/index.ts`)

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NotebookLMClient } from "../client.js";

export interface McpTool<T extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  schema?: T;
  execute: (
    client: NotebookLMClient,
    args: z.infer<z.ZodObject<T>>,
    opts: { queryTimeout?: number },
  ) => Promise<any>;
}

export function registerTools(
  server: McpServer,
  tools: McpTool<any>[],
  getClient: (timeout?: number) => NotebookLMClient,
  queryTimeout?: number,
) {
  for (const tool of tools) {
    if (tool.schema) {
      server.tool(tool.name, tool.description, tool.schema, async (args) => {
        try {
          const result = await tool.execute(
            getClient(queryTimeout),
            args as any,
            { queryTimeout },
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ status: "success", ...result }, null, 2),
              },
            ],
          };
        } catch (e) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  { status: "error", error: String(e) },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      });
    } else {
      server.tool(tool.name, tool.description, async () => {
        try {
          const result = await tool.execute(
            getClient(queryTimeout),
            {} as any,
            { queryTimeout },
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ status: "success", ...result }, null, 2),
              },
            ],
          };
        } catch (e) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  { status: "error", error: String(e) },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      });
    }
  }
}

// Re-usable helper for tools that require confirmation
export function pendingConfirmation(message: string) {
  return { status: "pending_confirmation", message };
}
```

### 2. Category Files

Tools will be split into the following files inside `src/tools/`:

- `notebook.ts`: notebook_list, notebook_create, notebook_get, notebook_describe, notebook_rename, notebook_delete
- `source.ts`: source_describe, source_get_content, notebook_add_url, notebook_add_text, notebook_add_drive, source_list_drive, source_sync_drive, source_delete
- `query.ts`: notebook_query, chat_configure
- `research.ts`: research_start, research_status, research_import
- `studio.ts`: audio_overview_create, video_overview_create, infographic_create, slide_deck_create, report_create, flashcards_create, quiz_create, data_table_create, mind_map_create, studio_status, studio_delete
- `auth.ts`: refresh_auth, save_auth_tokens

Each file will export an array of `McpTool` objects.
Example `src/tools/auth.ts`:

```typescript
import { z } from "zod";
import { McpTool } from "./index.js";
import { saveTokens } from "../auth.js";

// Note: Needs a mechanism to reset client. We might need to pass an `onAuthUpdate` callback
// or simply throw/return a specific signal that the server catches.
export const authTools: McpTool<any>[] = [
  {
    name: "refresh_auth",
    description: "Reload authentication tokens",
    execute: async (client) => {
      await client.refreshAuth();
      return { message: "Authentication tokens refreshed" };
    },
  },
  // ... save_auth_tokens
];
```

_Edge Case Consideration:_ The `save_auth_tokens` tool currently manually sets `client = null` in `server.ts`. We will modify the `registerTools` interface or the `execute` arguments slightly to allow tools to request a client reset, or we will handle this specific closure logic inside `server.ts` or `auth.ts`.

### 3. Server Integration (`src/server.ts`)

The `createServer` function will import all tool arrays, concatenate them, and call `registerTools`.

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NotebookLMClient } from "./client.js";
import { loadTokens } from "./auth.js";
import { registerTools } from "./tools/index.js";
import { notebookTools } from "./tools/notebook.js";
import { sourceTools } from "./tools/source.js";
// ... imports

let client: NotebookLMClient | null = null;
function getClient(queryTimeout?: number): NotebookLMClient { ... }

export function createServer(queryTimeout?: number): McpServer {
  const server = new McpServer({ name: "notebooklm", version: "0.1.0" });

  const allTools = [
    ...notebookTools,
    ...sourceTools,
    // ...
  ];

  registerTools(server, allTools, getClient, queryTimeout);

  return server;
}
```

## Benefits

- **Separation of Concerns**: Tool definitions are isolated from server registration.
- **Testability**: Individual tool `execute` functions can be unit-tested by passing a mocked `NotebookLMClient`.
- **Maintainability**: `server.ts` remains small and comprehensible regardless of how many tools we add.

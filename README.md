# NotebookLM MCP Server

MCP server for [Google NotebookLM](https://notebooklm.google.com) — 32 tools for notebooks, sources, research, and studio content generation.

Built with the [Model Context Protocol](https://modelcontextprotocol.io) SDK for TypeScript.

## Quick Start

### 1. Install & Run

```bash
npx -y @m4ykeldev/notebooklm-mcp serve
```

Or install globally:

```bash
npm install -g @m4ykeldev/notebooklm-mcp
notebooklm-mcp serve
```

### 2. Authenticate

```bash
npx @m4ykeldev/notebooklm-mcp auth
```

This opens NotebookLM in your default browser (where you're already logged into Google), then guides you to copy your session cookies from DevTools and paste them in the terminal.

Tokens are cached at `~/.notebooklm-mcp/auth.json`.

**Alternative: environment variables**

```bash
export NOTEBOOKLM_COOKIES="SID=xxx; HSID=xxx; SSID=xxx; APISID=xxx; SAPISID=xxx"
```

## Usage Examples

Integrate NotebookLM directly into your AI development workflow.

### 🤖 AI Editors & IDEs

#### **Claude Desktop / Claude Code**

Add this to your `claude_desktop_config.json` or MCP configuration:

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "npx",
      "args": ["-y", "@m4ykeldev/notebooklm-mcp", "serve"]
    }
  }
}
```

#### **Cursor**

1. Go to **Settings** > **Features** > **MCP**.
2. Click **+ Add New MCP Server**.
3. **Name**: `NotebookLM`
4. **Type**: `command`
5. **Command**: `npx -y @m4ykeldev/notebooklm-mcp serve`

#### **VS Code (MCP Client)**

If you use the [MCP Client](https://marketplace.visualstudio.com/items?itemName=mcp-client.mcp-client) extension:

1. Open your `settings.json`.
2. Add the server configuration:

```json
"mcp.servers": {
  "notebooklm": {
    "command": "npx",
    "args": ["-y", "@m4ykeldev/notebooklm-mcp", "serve"]
  }
}
```

### 💻 Command Line Interface

Once authenticated, you can use the CLI for quick operations:

```bash
# Start the server with a custom timeout
npx @m4ykeldev/notebooklm-mcp serve --query-timeout 60000

# Manage authentication
npx @m4ykeldev/notebooklm-mcp auth --show-tokens
```

## Tools (32)

### Notebooks

| Tool                | Description                               |
| ------------------- | ----------------------------------------- |
| `notebook_list`     | List all notebooks with metadata          |
| `notebook_create`   | Create a new notebook                     |
| `notebook_get`      | Get details of a specific notebook        |
| `notebook_describe` | AI-generated summary of notebook contents |
| `notebook_rename`   | Rename a notebook                         |
| `notebook_delete`   | Delete a notebook (requires confirmation) |

### Sources

| Tool                 | Description                                      |
| -------------------- | ------------------------------------------------ |
| `notebook_add_url`   | Add a URL or YouTube video as a source           |
| `notebook_add_text`  | Add pasted text as a source                      |
| `notebook_add_drive` | Add a Google Drive document as a source          |
| `source_describe`    | AI summary and keywords for a source             |
| `source_get_content` | Raw text content of a source                     |
| `source_list_drive`  | List sources with Drive freshness status         |
| `source_sync_drive`  | Sync stale Drive sources (requires confirmation) |
| `source_delete`      | Delete a source (requires confirmation)          |

### Query & Chat

| Tool             | Description                          |
| ---------------- | ------------------------------------ |
| `notebook_query` | Ask questions about notebook sources |
| `chat_configure` | Set chat goal and response length    |

### Research

| Tool              | Description                             |
| ----------------- | --------------------------------------- |
| `research_start`  | Start a web or Drive research task      |
| `research_status` | Check research task progress            |
| `research_import` | Import discovered sources from research |

### Studio — Content Generation

| Tool                    | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| `audio_overview_create` | Generate an audio podcast                            |
| `video_overview_create` | Generate a video summary                             |
| `infographic_create`    | Generate an infographic                              |
| `slide_deck_create`     | Generate a slide presentation                        |
| `report_create`         | Generate a report (briefing, study guide, blog post) |
| `flashcards_create`     | Generate study flashcards                            |
| `quiz_create`           | Generate a quiz                                      |
| `data_table_create`     | Generate a data table                                |
| `mind_map_create`       | Generate and save a mind map                         |
| `studio_status`         | Check generation status and download URLs            |
| `studio_delete`         | Delete a studio artifact (requires confirmation)     |

### Authentication

| Tool           | Description                                        |
| -------------- | -------------------------------------------------- |
| `refresh_auth` | Reload authentication tokens equires confirmation) |

### Authentication

| Tool               | Description                          |
| ------------------ | ------------------------------------ |
| `refresh_auth`     | Reload authentication tokens         |
| `save_auth_tokens` | Manually save authentication cookies |

## CLI Reference

```bash
# Start the MCP server (default command)
notebooklm-mcp serve
notebooklm-mcp serve --query-timeout 60000

# Authenticate interactively
notebooklm-mcp auth

# Import cookies from a file
notebooklm-mcp auth --file cookies.txt

# Show cached token info
notebooklm-mcp auth --show-tokens
```

## How It Works

This server communicates with NotebookLM through Google's internal `batchexecute` RPC endpoint. It uses the same API that the NotebookLM web app uses in your browser.

Authentication is cookie-based — the server needs your Google session cookies to make requests on your behalf. Cookies are extracted once and cached locally. CSRF tokens are auto-refreshed when they expire.

## Requirements

- Node.js >= 18
- A Google account with access to [NotebookLM](https://notebooklm.google.com)

## Disclaimer

This project is not affiliated with, endorsed by, or sponsored by Google. It uses NotebookLM's internal web API, which is undocumented and may change without notice. Use at your own risk.

## License

[MIT](LICENSE)

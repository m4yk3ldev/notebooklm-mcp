# 🧠 NotebookLM MCP Server

### Bridge the Gap Between Google NotebookLM and Your AI Workspace

[![NPM Version](https://img.shields.io/npm/v/@m4ykeldev/notebooklm-mcp)](https://www.npmjs.com/package/@m4ykeldev/notebooklm-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://github.com/m4yk3ldev/notebooklm-mcp/actions/workflows/publish.yml/badge.svg)](https://github.com/m4yk3ldev/notebooklm-mcp/actions)

Stop jumping between browser tabs. **NotebookLM MCP** brings the full analytical power of [Google NotebookLM](https://notebooklm.google.com) directly into your local terminal, IDE, and AI assistants like Claude, Cursor, and VS Code.

Manage notebooks, ingest diverse sources, trigger deep research, and generate studio-quality content—all via a single, standardized Model Context Protocol (MCP) interface.

> **New to MCP?** The [Model Context Protocol](https://modelcontextprotocol.io) is a standard for connecting LLMs to external data sources and tools. This package speaks MCP over stdio — your AI client (Claude Desktop, Cursor, VS Code, etc.) spawns `notebooklm-mcp serve` as a subprocess and the two communicate over JSON-RPC. The 27 tools below become callable functions in the model's tool list.

---

## 🔥 Key Capabilities

- ⚡ **Seamless Authentication**: Log in once with `notebooklm-mcp auth`. Our automated CDP-based flow handles secure cookie extraction so you can focus on your data.
- 🔄 **Resilient Connectivity**: Built-in background session restoration. If your session expires, the server transparently reconnects without breaking your workflow.
- 📂 **Universal Ingestion**: Instantly add URLs, YouTube transcripts, Google Drive files, or raw text snippets to any notebook.
- 🕵️ **Autonomous Research**: Harness Google's Deep Research engine. Start a task, poll its progress, and import structured insights directly into your project.
- 🎭 **Creative Studio**: Programmatically generate Audio Overviews (podcasts), Briefing Docs, Infographics, Slide Decks, and Quizzes from your sources.

---

## 🚀 Quick Start

### 1. Installation

Run it instantly with `npx`:

```bash
npx -y @m4ykeldev/notebooklm-mcp serve
```

Or install globally for better performance:

```bash
npm install -g @m4ykeldev/notebooklm-mcp
```

> Developers who want to hack on the source: this repo uses **pnpm**
> (pinned via `packageManager` in `package.json`). After cloning, run
> `corepack enable && pnpm install`. See [CONTRIBUTING.md on GitHub](https://github.com/m4yk3ldev/notebooklm-mcp/blob/main/CONTRIBUTING.md)
> for the full dev / release flow.

### 2. The "One-Click" Login

Say goodbye to manual cookie hunting. Our smart auth flow does the heavy lifting for you.

```bash
notebooklm-mcp auth
```

_A secure Chrome window will open. Simply log into your Google account, and we'll handle the rest. Your session is stored locally and securely._

**Auth fallbacks** if automated Chrome can't run:

```bash
notebooklm-mcp auth --manual              # interactive copy/paste from your browser
notebooklm-mcp auth --file tokens.json    # import a previously exported bundle
notebooklm-mcp auth --show-tokens         # verify the cached session
```

For headless / CI environments, set `NOTEBOOKLM_COOKIES` (and optionally `NOTEBOOKLM_CSRF_TOKEN`, `NOTEBOOKLM_SESSION_ID`) instead of running the auth flow. Token resolution order: env var → `~/.notebooklm-mcp/auth.json` → error.

---

## 🤖 AI Assistant Integration

Pick your client below — every section shows the **config file path per OS**, a **minimal copy-paste block**, and the **advanced variant** with `--query-timeout` and `NOTEBOOKLM_COOKIES` env override.

| Client | Config file | Format |
|---|---|---|
| [Claude Desktop](#claude-desktop) | `claude_desktop_config.json` | JSON |
| [Claude Code (CLI)](#claude-code-cli) | `~/.claude.json` or `claude mcp add` | JSON / CLI |
| [Codex CLI](#codex-cli) | `~/.codex/config.toml` | TOML |
| [OpenAI Agents SDK (Python)](#openai-agents-sdk--python) | in-code | Python |
| [OpenAI Agents SDK (TypeScript)](#openai-agents-sdk--typescript) | in-code | TypeScript |
| [Gemini CLI](#gemini-cli) | `~/.gemini/settings.json` | JSON |
| [Cursor](#cursor) | `~/.cursor/mcp.json` | JSON |
| [VS Code (Copilot Chat agent mode)](#vs-code-copilot-chat-agent-mode) | `.vscode/mcp.json` | JSON |
| [Windsurf](#windsurf) | `~/.codeium/windsurf/mcp_config.json` | JSON |
| [JetBrains AI Assistant / Junie](#jetbrains-ai-assistant--junie) | `~/.junie/mcp/mcp.json` | JSON |
| [Zed](#zed) | `~/.config/zed/settings.json` | JSON |
| [OpenCode (sst)](#opencode-sst) | `opencode.jsonc` | JSONC |
| [Cline (VS Code extension)](#cline-vs-code-extension) | extension settings UI | JSON |
| [Goose (Block)](#goose-block) | `~/.config/goose/config.yaml` | YAML |
| [5ire](#5ire) | in-app settings | GUI |
| [Aider](#aider) | not yet supported | — |
| [Generic stdio caller](#generic-stdio-caller) | yours | — |

---

### Claude Desktop

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

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

<details><summary>With timeout + env override</summary>

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "npx",
      "args": ["-y", "@m4ykeldev/notebooklm-mcp", "serve", "--query-timeout", "180000", "--debug"],
      "env": {
        "NOTEBOOKLM_COOKIES": "SID=...; HSID=...; SSID=...; APISID=...; SAPISID=..."
      }
    }
  }
}
```

**Verify:** restart Claude Desktop, click the hammer icon at the bottom-right of the input. **Gotchas:** absolute paths only; relative paths fail silently on startup.

</details>

---

### Claude Code (CLI)

Recommended path is the `claude mcp add` CLI (writes the JSON for you):

```bash
claude mcp add --transport stdio notebooklm -- npx -y @m4ykeldev/notebooklm-mcp serve
```

<details><summary>Equivalent JSON (project scope, <code>./.mcp.json</code>)</summary>

```json
{
  "mcpServers": {
    "notebooklm": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@m4ykeldev/notebooklm-mcp", "serve"]
    }
  }
}
```

</details>

<details><summary>With timeout + env override (CLI)</summary>

```bash
claude mcp add --transport stdio \
  --env NOTEBOOKLM_COOKIES="SID=...; HSID=...; SSID=...; APISID=...; SAPISID=..." \
  notebooklm -- npx -y @m4ykeldev/notebooklm-mcp serve --query-timeout 180000
```

**Verify:** `claude mcp list && claude mcp get notebooklm`, or `/mcp` inside a session. **Gotchas:** all options before the server name; use `--` to separate options from the command. Project-scoped `.mcp.json` needs interactive approval on first sight.

</details>

---

### Codex CLI

- macOS: `~/.codex/config.toml`
- Linux: `~/.config/codex/config.toml`
- Windows: `%APPDATA%\codex\config.toml`

```toml
[mcp_servers.notebooklm]
command = "npx"
args = ["-y", "@m4ykeldev/notebooklm-mcp", "serve"]
```

<details><summary>With timeout + env override</summary>

```toml
[mcp_servers.notebooklm]
command = "npx"
args = ["-y", "@m4ykeldev/notebooklm-mcp", "serve", "--query-timeout", "180000"]
env = { NOTEBOOKLM_COOKIES = "SID=...; HSID=...; SSID=...; APISID=...; SAPISID=..." }
```

**Verify:** `codex --list-tools` should list the NotebookLM tools. **Gotchas:** Codex CLI's MCP schema is still being formalized — double-check against the latest `openai/codex` README.

</details>

---

### OpenAI Agents SDK — Python

Wire it in code (no config file):

```python
from agents.mcp import MCPServerStdio

async with MCPServerStdio(
    name="NotebookLM",
    params={
        "command": "npx",
        "args": ["-y", "@m4ykeldev/notebooklm-mcp", "serve"],
    },
) as server:
    tools = await server.list_tools()
    print([t.name for t in tools])  # 27 tools
```

<details><summary>With timeout + env override</summary>

```python
async with MCPServerStdio(
    name="NotebookLM",
    params={
        "command": "npx",
        "args": ["-y", "@m4ykeldev/notebooklm-mcp", "serve", "--query-timeout", "180000"],
        "env": {"NOTEBOOKLM_COOKIES": "SID=...; HSID=...; SSID=...; APISID=...; SAPISID=..."},
    },
) as server:
    ...
```

</details>

---

### OpenAI Agents SDK — TypeScript

```typescript
import { MCPServerStdio } from "@openai/agents";

const server = new MCPServerStdio({
  command: "npx",
  args: ["-y", "@m4ykeldev/notebooklm-mcp", "serve"],
});

await server.connect();
const tools = await server.listTools();
console.log(tools.map((t) => t.name)); // 27 tools
```

<details><summary>With timeout + env override</summary>

```typescript
const server = new MCPServerStdio({
  command: "npx",
  args: ["-y", "@m4ykeldev/notebooklm-mcp", "serve", "--query-timeout", "180000"],
  env: { NOTEBOOKLM_COOKIES: "SID=...; HSID=...; SSID=...; APISID=...; SAPISID=..." },
});
```

</details>

---

### Gemini CLI

`~/.gemini/settings.json` (user-global) or `.gemini/settings.json` (per-project).

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

<details><summary>With timeout + env override (Gemini supports <code>$VAR</code> expansion)</summary>

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "npx",
      "args": ["-y", "@m4ykeldev/notebooklm-mcp", "serve"],
      "timeout": 180000,
      "env": {
        "NOTEBOOKLM_COOKIES": "$NOTEBOOKLM_COOKIES"
      }
    }
  }
}
```

**Verify:** `gemini mcp list`, or `/mcp` in a session. **Gotchas:** undefined `$VAR` resolves to empty string — pre-export them in your shell.

</details>

---

### Cursor

- macOS / Linux: `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per-project)
- Windows: `%APPDATA%\Cursor\mcp.json`

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

<details><summary>With timeout + env override</summary>

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "npx",
      "args": ["-y", "@m4ykeldev/notebooklm-mcp", "serve", "--query-timeout", "180000"],
      "env": {
        "NOTEBOOKLM_COOKIES": "SID=...; HSID=...; SSID=...; APISID=...; SAPISID=..."
      }
    }
  }
}
```

**Verify:** `Cursor Settings → MCP` should show `notebooklm` in green, or `MCP: View Server Status` in the Command Palette. **Gotchas:** Cursor only loads MCP servers at startup — fully quit and relaunch after edits. Soft ~40-tool ceiling across all enabled servers combined.

</details>

---

### VS Code (Copilot Chat agent mode)

`.vscode/mcp.json` (per-project). Top-level key is **`servers`** (not `mcpServers` — Microsoft renamed this).

```json
{
  "servers": {
    "notebooklm": {
      "command": "npx",
      "args": ["-y", "@m4ykeldev/notebooklm-mcp", "serve"]
    }
  }
}
```

<details><summary>With timeout + env override</summary>

```json
{
  "servers": {
    "notebooklm": {
      "command": "npx",
      "args": ["-y", "@m4ykeldev/notebooklm-mcp", "serve", "--query-timeout", "180000"],
      "env": {
        "NOTEBOOKLM_COOKIES": "SID=...; HSID=...; SSID=...; APISID=...; SAPISID=..."
      }
    }
  }
}
```

**Verify:** Command Palette → `MCP: Open User Configuration`. Ask Copilot Chat in **agent mode** to list NotebookLM notebooks.

</details>

---

### Windsurf

- macOS / Linux: `~/.codeium/windsurf/mcp_config.json`
- Windows: `%APPDATA%\Codeium\Windsurf\mcp_config.json`

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

<details><summary>With timeout + env override (uses Windsurf's <code>${env:VAR}</code> interpolation)</summary>

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "npx",
      "args": ["-y", "@m4ykeldev/notebooklm-mcp", "serve", "--query-timeout", "180000"],
      "env": {
        "NOTEBOOKLM_COOKIES": "${env:NOTEBOOKLM_COOKIES}"
      }
    }
  }
}
```

**Verify:** open the Cascade sidebar → MCP settings → confirm `notebooklm` is active. **Gotchas:** prefer `${env:VAR}` / `${file:/path}` interpolation over inlining cookies; Windsurf substitutes at server-launch time so secrets stay out of the config file.

</details>

---

### JetBrains AI Assistant / Junie

- macOS / Linux: `~/.junie/mcp/mcp.json` (user-global) or `.junie/mcp/mcp.json` (per-project)
- Windows: `%APPDATA%\JetBrains\Junie\mcp.json`

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

<details><summary>With timeout + env override</summary>

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "npx",
      "args": ["-y", "@m4ykeldev/notebooklm-mcp", "serve", "--query-timeout", "180000"],
      "env": {
        "NOTEBOOKLM_COOKIES": "SID=...; HSID=...; SSID=...; APISID=...; SAPISID=..."
      }
    }
  }
}
```

**Verify:** `Settings (Ctrl+Alt+S) → Tools → Junie → MCP Settings` — `notebooklm` should appear in the discovered list.

</details>

---

### Zed

`~/.config/zed/settings.json` — the relevant key is **`context_servers`** (Zed's MCP equivalent).

```json
{
  "context_servers": {
    "notebooklm": {
      "command": "npx",
      "args": ["-y", "@m4ykeldev/notebooklm-mcp", "serve"]
    }
  }
}
```

<details><summary>With timeout + env override</summary>

```json
{
  "context_servers": {
    "notebooklm": {
      "command": "npx",
      "args": ["-y", "@m4ykeldev/notebooklm-mcp", "serve", "--query-timeout", "180000"],
      "env": {
        "NOTEBOOKLM_COOKIES": "SID=...; HSID=...; SSID=...; APISID=...; SAPISID=..."
      }
    }
  }
}
```

**Verify:** Zed's AI Agent Panel lists `notebooklm` as an available context source.

</details>

---

### OpenCode (sst)

`opencode.jsonc` (project root) or `~/.config/opencode/config.json`.

```jsonc
{
  "mcp": {
    "servers": {
      "notebooklm": {
        "command": "npx",
        "args": ["-y", "@m4ykeldev/notebooklm-mcp", "serve"]
      }
    }
  }
}
```

<details><summary>With timeout + env override</summary>

```jsonc
{
  "mcp": {
    "servers": {
      "notebooklm": {
        "command": "npx",
        "args": ["-y", "@m4ykeldev/notebooklm-mcp", "serve", "--query-timeout", "180000"],
        "env": {
          "NOTEBOOKLM_COOKIES": "SID=...; HSID=...; SSID=...; APISID=...; SAPISID=..."
        }
      }
    }
  }
}
```

**Verify:** start OpenCode and ask *"List my NotebookLM notebooks."* — the model should call `notebook_list`. **Gotchas:** OpenCode's MCP schema is still evolving; confirm against the [OpenCode docs](https://opencode.ai/docs) if startup fails.

</details>

---

### Cline (VS Code extension)

Managed via Cline's MCP settings UI inside VS Code. Underlying file (don't edit by hand): `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`.

1. Open the Cline panel → click the MCP icon → `Configure MCP Servers`.
2. Paste:

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

3. Save. Cline restarts the server automatically.

<details><summary>With timeout + env override</summary>

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "npx",
      "args": ["-y", "@m4ykeldev/notebooklm-mcp", "serve", "--query-timeout", "180000"],
      "env": {
        "NOTEBOOKLM_COOKIES": "SID=...; HSID=...; SSID=...; APISID=...; SAPISID=..."
      }
    }
  }
}
```

**Verify:** ask Cline *"List my NotebookLM notebooks."* — the tool-call panel shows `notebook_list`.

</details>

---

### Goose (Block)

`~/.config/goose/config.yaml` (or via `goose configure`). Goose calls MCP servers "extensions".

```yaml
extensions:
  notebooklm:
    type: stdio
    command: npx
    args:
      - "-y"
      - "@m4ykeldev/notebooklm-mcp"
      - serve
```

<details><summary>With timeout + env override</summary>

```yaml
extensions:
  notebooklm:
    type: stdio
    command: npx
    args:
      - "-y"
      - "@m4ykeldev/notebooklm-mcp"
      - serve
      - "--query-timeout"
      - "180000"
    env:
      NOTEBOOKLM_COOKIES: "SID=...; HSID=...; SSID=...; APISID=...; SAPISID=..."
```

**Verify:** `goose configure` → confirm the extension is enabled, then `goose session` and ask *"List my NotebookLM notebooks."*

</details>

---

### 5ire

GUI app (no user-editable config file):

1. Open 5ire → `Settings` (`Mod+K` → `Providers`).
2. Click **Add MCP Server**.
3. Name: `notebooklm`
4. Type: `Stdio`
5. Command: `npx`
6. Args: `-y @m4ykeldev/notebooklm-mcp serve` (add `--query-timeout 180000` if needed)
7. Env vars (optional): `NOTEBOOKLM_COOKIES=SID=...; HSID=...; SSID=...; APISID=...; SAPISID=...`
8. Save and restart.

**Verify:** ask in chat *"List my NotebookLM notebooks."* — tool-call panel shows `notebook_list`.

---

### Aider

Aider does not yet have first-class MCP-server client integration. Workarounds: run `notebooklm-mcp serve` separately and pipe responses, or use the [generic stdio caller](#generic-stdio-caller) inside a small wrapper script. Track upstream support via the [Aider Discord](https://discord.gg/Y7X7bhMQFV).

---

### Generic stdio caller

If your client speaks the [MCP protocol](https://modelcontextprotocol.io/specification) over stdio but isn't listed above, every config above reduces to the same primitive:

```
spawn:   npx -y @m4ykeldev/notebooklm-mcp serve
stdio:   parent <- stdout (JSON-RPC responses) | parent -> stdin (JSON-RPC requests)
env:     (optional)
  NOTEBOOKLM_COOKIES=...        # skip the auth flow in CI
  NOTEBOOKLM_CSRF_TOKEN=...
  NOTEBOOKLM_SESSION_ID=...
flags:   (optional)
  --query-timeout <ms>          # per-RPC timeout, default 120000
  --debug                       # verbose stderr logging
```

On connection the server advertises 27 tools — see the [Complete Tool Reference](#-complete-tool-reference-27) below.

---

### Verify any wiring

After restarting your client, ask:

> *"List my NotebookLM notebooks."*

If the model invokes `notebook_list` and returns a table of titles, you're connected.

---

## 💬 Example Prompts

Once wired up, your AI can drive NotebookLM end-to-end with natural language. The model picks the right tool from the 32 below.

| Goal | Sample prompt | Tools the model will call |
|---|---|---|
| Inventory | _"Show me every NotebookLM project I own"_ | `notebook_list` |
| Start a project | _"Create a notebook called 'Q3 Earnings' and add the AAPL 10-Q PDF at https://…"_ | `notebook_create`, `notebook_add_url` |
| Grounded Q&A | _"From the AAPL notebook, what is the year-over-year services revenue change?"_ | `notebook_query` |
| Multi-source brief | _"In my 'Climate Policy' notebook, generate a one-page briefing doc focused on IRA tax credits"_ | `report_create`, `studio_status` |
| Studio podcast | _"Make a 10-min audio overview of my 'AI Safety Reading' notebook"_ | `audio_overview_create`, `studio_status` |
| Deep Research → import | _"Run deep research on 'kelp aquaculture in Maine' and import the findings into my 'Climate' notebook"_ | `research_start`, `research_status`, `research_import` |
| Cleanup | _"Delete the 'Old Drafts' notebook I no longer need"_ | `notebook_list`, `notebook_delete` |

## 🛠 Complete Tool Reference (27)

Every tool is designed to work seamlessly within your AI's context window.

### 📔 Notebook Management

| Tool                | Description                                                                                     |
| :------------------ | :---------------------------------------------------------------------------------------------- |
| `notebook_list`     | Get an overview of all your notebooks, including titles, source counts, and ownership metadata. |
| `notebook_create`   | Create a new NotebookLM project instantly from your terminal or AI assistant.                   |
| `notebook_get`      | Retrieve deep metadata and a full list of sources for a specific notebook.                      |
| `notebook_describe` | Get a high-level, AI-generated summary of everything inside a notebook.                         |
| `notebook_rename`   | Update the title of an existing notebook.                                                       |
| `notebook_delete`   | Permanently remove a notebook (requires explicit confirmation).                                 |

### 📄 Source Ingestion & Management

| Tool                 | Description                                                                            |
| :------------------- | :------------------------------------------------------------------------------------- |
| `notebook_add_url`   | Add any website or YouTube video as a source. Transcripts are automatically handled.   |
| `notebook_add_text`  | Ingest raw text snippets or local file contents directly into your project.            |
| `notebook_add_drive` | Connect and import documents, sheets, or slides from your Google Drive.                |
| `source_describe`    | Get detailed AI analysis, summaries, and key topics for any individual source.         |
| `source_get_content` | Extract the full underlying text of a source for processing by other AI tools.         |
| `source_sync_drive`  | Sync selected Google Drive sources to pull the latest changes into NotebookLM.         |
| `source_delete`      | Remove a specific source from your notebook.                                           |

### 🔬 Research & Deep Analysis

| Tool              | Description                                                                           |
| :---------------- | :------------------------------------------------------------------------------------ |
| `research_start`  | Launch an autonomous research task using Google's engine (Web or Drive sources).      |
| `research_status` | Track the progress of active research tasks and view discovered insights.             |
| `research_import` | Instantly import the findings of a research task as new sources in your notebook.     |
| `notebook_query`  | Ask complex, grounded questions. Answers are cited directly from your sources.        |

### 🎬 Studio (AI Content Generation)

| Tool                    | Description                                                                              |
| :---------------------- | :--------------------------------------------------------------------------------------- |
| `audio_overview_create` | Transform your notebook's sources into a professional, podcast-style audio discussion.   |
| `video_overview_create` | Generate a structured video explainer based on your project data.                        |
| `report_create`         | Create professional Briefing Docs, Study Guides, or Blog Posts tailored to your sources. |
| `slide_deck_create`     | Turn your research into a presenter-ready slide deck automatically.                      |
| `infographic_create`    | Visualize complex data and relationships with an AI-generated infographic.               |
| `flashcards_create`     | Generate interactive study flashcards to master your notebook's content.                 |
| `quiz_create`           | Create a comprehensive quiz to test knowledge grounded in your provided sources.         |
| `studio_status`         | Check the generation status of your Studio artifacts and get download links.             |

### 🔑 Authentication Helpers

| Tool               | Description                                                            |
| :----------------- | :--------------------------------------------------------------------- |
| `refresh_auth`     | Manually trigger a session refresh if you encounter connection issues. |
| `save_auth_tokens` | Manually save cookie data (legacy fallback method).                    |

---

## 🎛 CLI Reference

```bash
notebooklm-mcp serve [--query-timeout <ms>] [--debug]
notebooklm-mcp auth  [--manual] [--file <path>] [--show-tokens]
notebooklm-mcp --version
```

| Flag | Default | Description |
|---|---|---|
| `serve --query-timeout` | `120000` | Per-RPC timeout in ms. Bump for large studio jobs or slow research. |
| `serve --debug` | off | Verbose stderr logging of every RPC + retry. |
| `auth --manual` | off | Skip Chrome automation; paste cookies yourself. |
| `auth --file <path>` | — | Import a previously exported tokens JSON. |
| `auth --show-tokens` | — | Print the cached session's metadata (cookie names, age, CSRF/SID presence — never the secret values). |

---

## 🩹 Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| _"Could not find Google Chrome or Chromium"_ | No Chrome/Chromium on PATH | Install Chrome or run `notebooklm-mcp auth --manual` |
| _"Authentication expired"_ inside the AI session | Cookies stale | The server auto-refreshes once; if it can't, re-run `notebooklm-mcp auth` |
| Tool calls hang past 2 min | Big studio job over default timeout | Restart server with `--query-timeout 300000` |
| _"file_path … outside the allowed roots"_ | `notebook_add_text` got a path outside cwd / tmp | Copy the file into your working directory or pass `content` inline |
| MCP client reports server crashed on startup | `dist/cli.js` missing (dev clone) | `pnpm install && pnpm run build` |
| Multiple Chrome windows pop up on concurrent failures | Older version without single-flight mutex | Upgrade to ≥ `v0.2.5` |

---

## 💡 Pro Tips

- **Custom Timeouts**: Working with massive sources? Increase the timeout:
  `notebooklm-mcp serve --query-timeout 180000`
- **Check Connections**: Use `notebooklm-mcp auth --show-tokens` to verify your session validity without exposing the secrets.
- **CI / headless**: Set `NOTEBOOKLM_COOKIES` (plus `NOTEBOOKLM_CSRF_TOKEN`, `NOTEBOOKLM_SESSION_ID`) to skip the browser flow entirely.

---

## 🛡 Security & Privacy

- **Local Storage** with hardened perms. Tokens live at `~/.notebooklm-mcp/auth.json` (mode `0600`) inside `~/.notebooklm-mcp/` (mode `0700`). Nothing leaves your machine except calls to Google.
- **Path-traversal guard**. `notebook_add_text` rejects `file_path` arguments outside the working directory or the OS temp directory — a hostile MCP prompt cannot ask the server to read your `~/.ssh/id_rsa`.
- **Loopback-only Chrome DevTools**. The automated auth flow launches Chrome with an OS-assigned ephemeral port bound to `127.0.0.1` — no fixed-port squatting, no LAN exposure.
- **Single-flight auth refresh**. Concurrent requests that hit an expired session share one refresh promise instead of each spawning their own Chrome.
- **Supply-chain gated releases**. Every publish runs gitleaks → osv-scanner → `pnpm audit` (high+) → `npm audit signatures` (Sigstore) → lockfile registry pinning → publish-manifest preview before `pnpm publish` ships via OIDC trusted publishers. See [CONTRIBUTING.md → Releasing on GitHub](https://github.com/m4yk3ldev/notebooklm-mcp/blob/main/CONTRIBUTING.md#releasing).
- **Test coverage**: 100% statements / branches / functions / lines, enforced by CI.
- **Unofficial Tool**: This project is an independent community effort and is not affiliated with Google. It interfaces with internal endpoints and may be affected by changes to the NotebookLM web platform.

## 📄 License

Open-source and available under the [MIT License](LICENSE).

---

Crafted with precision for the AI-first developer. Part of the [Model Context Protocol](https://modelcontextprotocol.io) ecosystem.

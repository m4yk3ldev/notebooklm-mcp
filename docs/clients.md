# Client Integration Guide

How to wire **`@m4ykeldev/notebooklm-mcp`** into the AI assistants and editor extensions that speak MCP. The server itself is always the same — `notebooklm-mcp serve` over stdio — so every section is a thin wrapper around the same three things:

1. **Where the config lives** (the file path the client reads at startup).
2. **What block to paste** (minimal + the timeout/env override variant).
3. **How to verify** the wiring took effect.

## Pick your client

| Client | Config file | Format | Status |
|---|---|---|---|
| [Claude Desktop](#claude-desktop) | `claude_desktop_config.json` | JSON | stable |
| [Claude Code (CLI)](#claude-code-cli) | `~/.claude.json` / `.mcp.json` | JSON (or `claude mcp add`) | stable |
| [Codex CLI](#codex-cli) | `~/.codex/config.toml` | TOML | beta |
| [OpenAI Agents SDK — Python](#openai-agents-sdk--python) | in-code | Python | stable |
| [OpenAI Agents SDK — TypeScript](#openai-agents-sdk--typescript) | in-code | TypeScript | stable |
| [Gemini CLI](#gemini-cli) | `~/.gemini/settings.json` | JSON | stable |
| [Cursor](#cursor) | `~/.cursor/mcp.json` | JSON | stable |
| [VS Code (Copilot Chat agent mode)](#vs-code-copilot-chat-agent-mode) | `.vscode/mcp.json` | JSON | stable |
| [Windsurf](#windsurf) | `~/.codeium/windsurf/mcp_config.json` | JSON | stable |
| [JetBrains AI Assistant / Junie](#jetbrains-ai-assistant--junie) | `~/.junie/mcp/mcp.json` | JSON | stable |
| [Zed](#zed) | `~/.config/zed/settings.json` (`context_servers`) | JSON | stable |
| [OpenCode (sst)](#opencode-sst) | `opencode.jsonc` | JSONC | community-verified |
| [Cline (VS Code extension)](#cline-vs-code-extension) | extension settings UI | JSON | stable |
| [Goose (Block)](#goose-block) | `~/.config/goose/config.yaml` | YAML | beta |
| [5ire](#5ire) | in-app settings (Electron-managed) | GUI | stable |
| [Aider](#aider) | — | — | not yet supported |
| [Generic stdio caller](#generic-stdio-caller) | yours | any | — |

> **Prereq:** install the package first.
> Production: `npx -y @m4ykeldev/notebooklm-mcp serve` works without any global install.
> If you want a stable binary, `npm install -g @m4ykeldev/notebooklm-mcp` (or `pnpm add -g`, `bun add -g`).
>
> Then run `notebooklm-mcp auth` once to log in (see [README.md → Quick Start](../README.md#-quick-start)). Tokens land in `~/.notebooklm-mcp/auth.json` (mode `0600`).

---

## Claude Desktop

**Status:** stable · **Last verified:** 2026-05-17 ([source](https://modelcontextprotocol.io/docs/develop/connect-local-servers))

**Config file:** `claude_desktop_config.json`

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

**Minimal:**

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

**With timeout + env override:**

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

**Verify:** restart Claude Desktop. The hammer/tool icon appears at the bottom-right of the message input — click it to list the `notebooklm` tools. Or just ask the model: *"List my NotebookLM notebooks."*

**Gotchas:** absolute paths only; relative paths will silently fail on startup.

---

## Claude Code (CLI)

**Status:** stable · **Last verified:** 2026-05-17 ([source](https://docs.claude.com/en/docs/claude-code/mcp))

**Config file:** `~/.claude.json` (user scope) or `.mcp.json` (project scope). Recommended path is the `claude mcp add` CLI which writes the JSON for you.

**Minimal (recommended — CLI):**

```bash
claude mcp add --transport stdio notebooklm -- npx -y @m4ykeldev/notebooklm-mcp serve
```

**Minimal (JSON, project-scoped at `./.mcp.json`):**

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

**With timeout + env override (CLI):**

```bash
claude mcp add --transport stdio \
  --env NOTEBOOKLM_COOKIES="SID=...; HSID=...; SSID=...; APISID=...; SAPISID=..." \
  notebooklm -- npx -y @m4ykeldev/notebooklm-mcp serve --query-timeout 180000
```

**Verify:**

```bash
claude mcp list
claude mcp get notebooklm
# Or, inside a session:
/mcp
```

**Gotchas:** all `claude mcp add` options must come before the server name. Use `--` to separate options from the command. Project-scoped `.mcp.json` requires interactive approval the first time it's seen.

---

## Codex CLI

**Status:** beta · **Last verified:** 2026-05-17

**Config file:**

- macOS: `~/.codex/config.toml`
- Linux: `~/.config/codex/config.toml`
- Windows: `%APPDATA%\codex\config.toml`

**Minimal:**

```toml
[mcp_servers.notebooklm]
command = "npx"
args = ["-y", "@m4ykeldev/notebooklm-mcp", "serve"]
```

**With timeout + env override:**

```toml
[mcp_servers.notebooklm]
command = "npx"
args = ["-y", "@m4ykeldev/notebooklm-mcp", "serve", "--query-timeout", "180000"]
env = { NOTEBOOKLM_COOKIES = "SID=...; HSID=...; SSID=...; APISID=...; SAPISID=..." }
```

**Verify:**

```bash
codex --list-tools   # NotebookLM tools should appear in the output
```

**Gotchas:** Codex CLI's MCP config schema is still being formalized — double-check against the latest `openai/codex` README before relying on this in production.

---

## OpenAI Agents SDK — Python

**Status:** stable · **Last verified:** 2026-05-17 ([source](https://openai.github.io/openai-agents-python/mcp/))

**Config file:** none — wire it in code.

**Minimal:**

```python
from agents.mcp import MCPServerStdio

async with MCPServerStdio(
    name="NotebookLM",
    params={
        "command": "npx",
        "args": ["-y", "@m4ykeldev/notebooklm-mcp", "serve"],
    },
) as server:
    # attach `server` to your Agent / Runner
    tools = await server.list_tools()
    print([t.name for t in tools])
```

**With timeout + env override:**

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

**Verify:** `await server.list_tools()` returns the 32 tools.

---

## OpenAI Agents SDK — TypeScript

**Status:** stable · **Last verified:** 2026-05-17 ([source](https://openai.github.io/openai-agents-js/))

**Config file:** none — wire it in code.

**Minimal:**

```typescript
import { MCPServerStdio } from "@openai/agents";

const server = new MCPServerStdio({
  command: "npx",
  args: ["-y", "@m4ykeldev/notebooklm-mcp", "serve"],
});

await server.connect();
const tools = await server.listTools();
console.log(tools.map((t) => t.name));
```

**With timeout + env override:**

```typescript
const server = new MCPServerStdio({
  command: "npx",
  args: ["-y", "@m4ykeldev/notebooklm-mcp", "serve", "--query-timeout", "180000"],
  env: { NOTEBOOKLM_COOKIES: "SID=...; HSID=...; SSID=...; APISID=...; SAPISID=..." },
});
```

**Verify:** `server.listTools()` returns the 32 tools.

---

## Gemini CLI

**Status:** stable · **Last verified:** 2026-05-17 ([source](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md))

**Config file:** `~/.gemini/settings.json` (user-global) or `.gemini/settings.json` (per-project)

**Minimal:**

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

**With timeout + env override:**

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

**Verify:**

```bash
gemini mcp list
# or inside a session:
/mcp
```

**Gotchas:** Gemini CLI supports `$VAR` env-var expansion inside the `env` map. Undefined vars resolve to empty strings — pre-export them in your shell.

---

## Cursor

**Status:** stable · **Last verified:** 2026-05-17 ([source](https://docs.cursor.com/context/model-context-protocol))

**Config file:** `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per-project)

- macOS / Linux: `~/.cursor/mcp.json`
- Windows: `%APPDATA%\Cursor\mcp.json`

**Minimal:**

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

**With timeout + env override:**

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

**Verify:** open `Cursor Settings → MCP` and confirm `notebooklm` shows green. Or run `MCP: View Server Status` from the Command Palette.

**Gotchas:** Cursor only loads MCP servers at startup — fully quit and relaunch after edits. There's a soft ~40-tool ceiling across all enabled servers combined.

---

## VS Code (Copilot Chat agent mode)

**Status:** stable · **Last verified:** 2026-05-17 ([source](https://code.visualstudio.com/docs/copilot/customization/mcp-servers))

**Config file:** `.vscode/mcp.json` (per-project) — top-level key is **`servers`** (not `mcpServers`).

**Minimal:**

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

**With timeout + env override:**

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

**Verify:** Command Palette → `MCP: Open User Configuration` (or save `.vscode/mcp.json`), then ask Copilot Chat in **agent mode** to list NotebookLM notebooks.

**Gotchas:** the top-level key is `servers`, not `mcpServers` — Microsoft renamed this once already, and stale tutorials still circulate.

---

## Windsurf

**Status:** stable · **Last verified:** 2026-05-17 ([source](https://docs.windsurf.com/windsurf/cascade/mcp))

**Config file:**

- macOS / Linux: `~/.codeium/windsurf/mcp_config.json`
- Windows: `%APPDATA%\Codeium\Windsurf\mcp_config.json`

**Minimal:**

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

**With timeout + env override (uses Windsurf's `${env:VAR}` interpolation for secrets):**

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

**Verify:** open the Cascade sidebar → MCP settings → confirm `notebooklm` is in the active servers list.

**Gotchas:** prefer `${env:VAR}` / `${file:/path}` interpolation over inlining cookies — Windsurf will substitute at server-launch time so you don't commit secrets.

---

## JetBrains AI Assistant / Junie

**Status:** stable · **Last verified:** 2026-05-17

**Config file:**

- macOS / Linux: `~/.junie/mcp/mcp.json` (user-global) or `.junie/mcp/mcp.json` (per-project)
- Windows: `%APPDATA%\JetBrains\Junie\mcp.json` (user-global) or `.junie/mcp/mcp.json` (per-project)

**Minimal:**

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

**With timeout + env override:**

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

---

## Zed

**Status:** stable · **Last verified:** 2026-05-17 ([source](https://zed.dev/docs/ai/mcp))

**Config file:** `~/.config/zed/settings.json` — the relevant key is **`context_servers`** (Zed's MCP equivalent).

**Minimal:**

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

**With timeout + env override:**

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

---

## OpenCode (sst)

**Status:** community-verified · **Last verified:** 2026-05-17

**Config file:** `opencode.jsonc` (project root) or `~/.config/opencode/config.json`

**Minimal:**

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

**With timeout + env override:**

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

**Verify:** start OpenCode and ask *"List my NotebookLM notebooks."* — the model should call `notebook_list`.

**Gotchas:** OpenCode's MCP schema is still evolving; confirm the current key path against the [OpenCode docs](https://opencode.ai/docs) if startup fails.

---

## Cline (VS Code extension)

**Status:** stable · **Last verified:** 2026-05-17 ([source](https://docs.cline.bot/mcp/configuring-mcp-servers))

**Config file:** managed via Cline's MCP settings UI in VS Code (the extension writes to `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`).

**Minimal (UI route):**

1. Open Cline panel → click the MCP icon → `Configure MCP Servers`.
2. Paste the block below into the editor that opens.
3. Save and let Cline restart the server.

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

**With timeout + env override:**

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

**Verify:** ask Cline *"List my NotebookLM notebooks."* — the tool call panel should show `notebook_list`.

---

## Goose (Block)

**Status:** beta · **Last verified:** 2026-05-17 ([source](https://block.github.io/goose/docs/getting-started/using-extensions))

**Config file:** `~/.config/goose/config.yaml` (also editable via `goose configure`)

**Minimal:**

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

**With timeout + env override:**

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

**Verify:**

```bash
goose configure   # confirm the new extension is enabled
goose session
# then ask: "List my NotebookLM notebooks."
```

**Gotchas:** Goose calls MCP servers "extensions" and stores them under the `extensions` key (not `mcpServers`).

---

## 5ire

**Status:** stable · **Last verified:** 2026-05-17

**Config file:** in-app settings (Electron-managed under `~/.config/5ire/`).

**Minimal (UI steps):**

1. Open 5ire → `Settings` (`Mod+K` → `Providers`).
2. Click **Add MCP Server**.
3. Name: `notebooklm`
4. Type: `Stdio`
5. Command: `npx`
6. Args: `-y @m4ykeldev/notebooklm-mcp serve`
7. Save → restart the assistant.

**With timeout + env override:** in step 6, add `--query-timeout 180000`. In the **Env vars** field add `NOTEBOOKLM_COOKIES=SID=...; HSID=...; SSID=...; APISID=...; SAPISID=...`.

**Verify:** ask in chat *"List my NotebookLM notebooks."*; tool call panel shows `notebook_list`.

---

## Aider

**Status:** not yet supported · **Last verified:** 2026-05-17 ([source](https://aider.chat/docs))

Aider currently has no first-class MCP-server client integration. Workarounds: run `notebooklm-mcp serve` separately and pipe responses, or use the [generic stdio caller](#generic-stdio-caller) approach inside a small wrapper script. Track upstream support via the [Aider Discord](https://discord.gg/Y7X7bhMQFV) or the Aider release notes.

---

## Generic stdio caller

If your assistant isn't in this list but speaks the MCP protocol over stdio, every client config above reduces to the same primitive:

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

The server speaks the standard [MCP stdio protocol](https://modelcontextprotocol.io/specification). On connection it advertises 32 tools — see [README → Tool Reference](../README.md#-complete-tool-reference-32).

---

## Shared concerns

### Auth first

Every client setup above assumes you've authenticated once on the host machine:

```bash
notebooklm-mcp auth                     # automated Chrome flow (recommended)
notebooklm-mcp auth --manual            # paste cookies yourself
notebooklm-mcp auth --file tokens.json  # import a previously exported bundle
notebooklm-mcp auth --show-tokens       # verify the cached session
```

Token resolution order is: `NOTEBOOKLM_COOKIES` env var → `~/.notebooklm-mcp/auth.json` → error. For Docker/CI, prefer the env-var path and skip the browser flow entirely.

### Timeouts

The default `--query-timeout` is **120 s**. Studio jobs (audio overviews, slide decks, deep research) routinely exceed this — bump to `180000` or `300000` if the model reports tool calls returning "timeout".

### Troubleshooting

See the [README's troubleshooting table](../README.md#-troubleshooting) for the most common failure modes (Chrome not found, expired session, path-traversal rejection, concurrent-failure window).

### Confirming a wiring is live

Most clients expose an MCP status panel; the universal end-to-end test is to ask:

> *"List my NotebookLM notebooks."*

If the model invokes `notebook_list` and returns a table, the bridge is working.

---

*Last full sweep: 2026-05-17. Open an issue or PR if your client's config schema drifts.*

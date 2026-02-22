# 🧠 NotebookLM MCP Server

### Unlock the Power of Google NotebookLM Directly in Your AI Workflow

[![NPM Version](https://img.shields.io/npm/v/@m4ykeldev/notebooklm-mcp)](https://www.npmjs.com/package/@m4ykeldev/notebooklm-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Stop switching tabs. Stop manual copy-pasting. **NotebookLM MCP** brings the full potential of [Google NotebookLM](https://notebooklm.google.com) to your terminal, IDE, and AI assistants (Claude, Cursor, VS Code). 

With **32+ specialized tools**, you can now automate notebook management, source ingestion, deep research, and studio-quality content generation—all without leaving your development environment.

---

## ✨ Features that Empower You

- 🚀 **Smart Authentication**: Zero-friction login with automated cookie extraction.
- 🔄 **Invisible Refresh**: Background session restoration keeps you connected without interruptions.
- 📚 **Total Notebook Control**: Create, list, rename, and analyze notebooks programmatically.
- 🌐 **Seamless Ingestion**: Add URLs, YouTube videos, Google Drive docs, or raw text as sources.
- 🔬 **Automated Research**: Trigger Deep Research tasks and import discovered insights instantly.
- 🎨 **Studio Content**: Generate Audio Overviews, infographics, slide decks, and briefing docs on the fly.

---

## ⚡ Quick Start

### 1. Install & Run

```bash
npx -y @m4ykeldev/notebooklm-mcp serve
```

Or install globally:

```bash
npm install -g @m4ykeldev/notebooklm-mcp
notebooklm-mcp serve
```

### 2. Smart Authentication (Zero Friction)

Authenticating is now a "magical" experience. No more manual cookie hunting.

```bash
notebooklm-mcp auth
```

- **How it works**: A dedicated, secure Chrome profile opens.
- **Persistence**: Log in once, and the session is saved.
- **Automation**: The server automatically detects your session and synchronizes cookies.
- **Reliability**: If your session expires, the server **effortlessly restores it** in the background.

*Prefer the old way? Use `notebooklm-mcp auth --manual` for traditional copy-paste extraction.*

---

## 🤖 Integrate with Your Favorite Tools

### Claude Desktop / Claude Code
Add this to your `mcpServers` configuration:

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

### Cursor / VS Code
1. Open **MCP Settings**.
2. Add a new server named `NotebookLM`.
3. Set type to `command` and use: `npx -y @m4ykeldev/notebooklm-mcp serve`.

---

## 🛠 Available Tools (32)

### 📔 Notebooks
| Tool | Description |
| :--- | :--- |
| `notebook_list` | Overview of all your notebooks. |
| `notebook_create` | Start a new project instantly. |
| `notebook_get` | Dive deep into a specific notebook's metadata. |
| `notebook_describe` | Get an AI-generated summary of your entire notebook. |

### 📄 Sources
| Tool | Description |
| :--- | :--- |
| `notebook_add_url` | Ingest web pages or YouTube transcripts. |
| `notebook_add_drive` | Connect your Google Drive documents. |
| `source_describe` | Instant AI analysis and keywords for any source. |
| `source_get_content` | Extract raw text for downstream processing. |

### 🧪 Research & Query
| Tool | Description |
| :--- | :--- |
| `research_start` | Launch Web or Drive research tasks (Fast or Deep). |
| `notebook_query` | Ask complex questions grounded in your sources. |
| `research_import` | Bring research findings directly into your notebook. |

### 🎬 Studio (Content Generation)
| Tool | Description |
| :--- | :--- |
| `audio_overview_create` | Turn sources into a professional podcast. |
| `report_create` | Generate Briefing Docs, Study Guides, or Blog Posts. |
| `slide_deck_create` | Create presenter-ready slides from your data. |
| `infographic_create` | Visualize information automatically. |

---

## ⚙️ Advanced Usage

```bash
# Set a custom query timeout
notebooklm-mcp serve --query-timeout 60000

# Manage authentication tokens
notebooklm-mcp auth --show-tokens
```

---

## 🛡 Disclaimer & Security

- **Security First**: Your cookies are stored locally at `~/.notebooklm-mcp/auth.json` and never shared.
- **Unofficial**: This project is not affiliated with Google. It utilizes internal RPC endpoints (`batchexecute`) and is subject to changes in NotebookLM's web API.

## 📄 License

Distributed under the [MIT License](LICENSE). 

---
Built with ❤️ for the AI developer community using the [Model Context Protocol](https://modelcontextprotocol.io).

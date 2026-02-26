# 🧠 NotebookLM MCP Server

### Bridge the Gap Between Google NotebookLM and Your AI Workspace

[![NPM Version](https://img.shields.io/npm/v/@m4ykeldev/notebooklm-mcp)](https://www.npmjs.com/package/@m4ykeldev/notebooklm-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://github.com/m4yk3ldev/notebooklm-mcp/actions/workflows/publish.yml/badge.svg)](https://github.com/m4yk3ldev/notebooklm-mcp/actions)

Stop jumping between browser tabs. **NotebookLM MCP** brings the full analytical power of [Google NotebookLM](https://notebooklm.google.com) directly into your local terminal, IDE, and AI assistants like Claude, Cursor, and VS Code.

Manage notebooks, ingest diverse sources, trigger deep research, and generate studio-quality content—all via a single, standardized Model Context Protocol (MCP) interface.

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

### 2. The "One-Click" Login

Say goodbye to manual cookie hunting. Our smart auth flow does the heavy lifting for you.

```bash
notebooklm-mcp auth
```
*A secure Chrome window will open. Simply log into your Google account, and we'll handle the rest. Your session is stored locally and securely.*

---

## 🤖 AI Assistant Integration

### Claude Desktop / Claude Code
Add the following to your `mcpServers` configuration:

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

### Cursor / VS Code (Composer)
1. Navigate to **MCP Settings**.
2. Add a new server named `NotebookLM`.
3. Set type to `command` and enter: `npx -y @m4ykeldev/notebooklm-mcp serve`.

---

## 🛠 32 Specialized Tools at Your Fingertips

The server exposes 32 modular tools categorized for maximum efficiency:

| Category | Key Tools |
| :--- | :--- |
| **📔 Notebooks** | `list`, `create`, `get`, `describe`, `rename`, `delete` |
| **📄 Sources** | `add_url`, `add_text`, `add_drive`, `describe_source`, `delete_source` |
| **🔬 Research** | `research_start`, `research_status`, `research_import` |
| **🎬 Studio** | `audio_overview`, `video_overview`, `infographic`, `slide_deck`, `report`, `quiz` |
| **💬 Chat** | `notebook_query` (grounded chat), `chat_configure` |

---

## 💡 Pro Tips

- **Custom Timeouts**: Working with massive sources? Increase the timeout:
  `notebooklm-mcp serve --query-timeout 120000`
- **Verify Sessions**: Check your current auth status:
  `notebooklm-mcp auth --show-tokens`

---

## 🛡 Security & Privacy

- **Local Storage**: Your authentication data is stored exclusively on your machine at `~/.notebooklm-mcp/auth.json`. It is never transmitted to any third-party server except Google.
- **Unofficial Tool**: This project is an independent community effort and is not affiliated with Google. It interfaces with internal endpoints and may be affected by changes to the NotebookLM web platform.

## 📄 License

Open-source and available under the [MIT License](LICENSE).

---
Crafted with precision for the AI-first developer. Part of the [Model Context Protocol](https://modelcontextprotocol.io) ecosystem.

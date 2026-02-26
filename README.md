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

## 🛠 Complete Tool Reference (32)

Every tool is designed to work seamlessly within your AI's context window.

### 📔 Notebook Management
| Tool | Description |
| :--- | :--- |
| `notebook_list` | Get an overview of all your notebooks, including titles, source counts, and ownership metadata. |
| `notebook_create` | Create a new NotebookLM project instantly from your terminal or AI assistant. |
| `notebook_get` | Retrieve deep metadata and a full list of sources for a specific notebook. |
| `notebook_describe` | Get a high-level, AI-generated summary of everything inside a notebook. |
| `notebook_rename` | Update the title of an existing notebook. |
| `notebook_delete` | Permanently remove a notebook (requires explicit confirmation). |

### 📄 Source Ingestion & Management
| Tool | Description |
| :--- | :--- |
| `notebook_add_url` | Add any website or YouTube video as a source. Transcripts are automatically handled. |
| `notebook_add_text` | Ingest raw text snippets or local file contents directly into your project. |
| `notebook_add_drive` | Connect and import documents, sheets, or slides from your Google Drive. |
| `source_describe` | Get detailed AI analysis, summaries, and key topics for any individual source. |
| `source_get_content` | Extract the full underlying text of a source for processing by other AI tools. |
| `source_list_drive` | List all Drive-based sources and check if they are up-to-date with the original files. |
| `source_sync_drive` | Sync selected Google Drive sources to pull the latest changes into NotebookLM. |
| `source_delete` | Remove a specific source from your notebook. |

### 🔬 Research & Deep Analysis
| Tool | Description |
| :--- | :--- |
| `research_start` | Launch an autonomous research task using Google's engine (Web or Drive sources). |
| `research_status` | Track the progress of active research tasks and view discovered insights. |
| `research_import` | Instantly import the findings of a research task as new sources in your notebook. |
| `notebook_query` | Ask complex, grounded questions. Answers are cited directly from your sources. |
| `chat_configure` | Fine-tune your AI's behavior by setting specific goals or preferred response lengths. |

### 🎬 Studio (AI Content Generation)
| Tool | Description |
| :--- | :--- |
| `audio_overview_create` | Transform your notebook's sources into a professional, podcast-style audio discussion. |
| `video_overview_create` | Generate a structured video explainer based on your project data. |
| `report_create` | Create professional Briefing Docs, Study Guides, or Blog Posts tailored to your sources. |
| `slide_deck_create` | Turn your research into a presenter-ready slide deck automatically. |
| `infographic_create` | Visualize complex data and relationships with an AI-generated infographic. |
| `flashcards_create` | Generate interactive study flashcards to master your notebook's content. |
| `quiz_create` | Create a comprehensive quiz to test knowledge grounded in your provided sources. |
| `data_table_create` | Extract and organize information into a structured, downloadable data table. |
| `mind_map_create` | Build a visual mind map connecting the core concepts of your notebook. |
| `studio_status` | Check the generation status of your Studio artifacts and get download links. |
| `studio_delete` | Clean up your workspace by deleting old Studio artifacts. |

### 🔑 Authentication Helpers
| Tool | Description |
| :--- | :--- |
| `refresh_auth` | Manually trigger a session refresh if you encounter connection issues. |
| `save_auth_tokens` | Manually save cookie data (legacy fallback method). |

---

## 💡 Pro Tips

- **Custom Timeouts**: Working with massive sources? Increase the timeout:
  `notebooklm-mcp serve --query-timeout 120000`
- **Check Connections**: Use `auth --show-tokens` to verify your session validity.

---

## 🛡 Security & Privacy

- **Local Storage**: Your authentication data is stored exclusively on your machine at `~/.notebooklm-mcp/auth.json`. It is never transmitted to any third-party server except Google.
- **Unofficial Tool**: This project is an independent community effort and is not affiliated with Google. It interfaces with internal endpoints and may be affected by changes to the NotebookLM web platform.

## 📄 License

Open-source and available under the [MIT License](LICENSE).

---
Crafted with precision for the AI-first developer. Part of the [Model Context Protocol](https://modelcontextprotocol.io) ecosystem.

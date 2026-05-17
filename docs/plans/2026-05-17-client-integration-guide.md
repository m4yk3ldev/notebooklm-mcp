# Multi-Client Integration Guide Implementation Plan

> **For Claude:** This is a docs plan. The author (controller) dispatches parallel research subagents (one per client cluster) to verify current MCP config formats, aggregates the findings, and writes a single comprehensive guide at `docs/clients.md`. No code changes.

**Goal:** Ship a single intuitive document — `docs/clients.md` — that shows users exactly how to wire `@m4ykeldev/notebooklm-mcp` into every major AI CLI / IDE that speaks MCP, with copy-paste-ready config blocks.

**Architecture:** One canonical doc with a top-line "pick your client" table linking to per-client sections. Each section answers four questions in the same order: **install location**, **config file**, **config block** (JSON/TOML/JSONC), **verify**. After each batch of clients we run the actual config locally where possible (Claude Code, Cursor, VS Code on this host) to make sure the snippets work, then commit.

**Tech Stack:** Markdown only. No code change. Two new files: `docs/clients.md` and an updated link in `README.md`.

---

## Client matrix (in scope)

| Cluster | Clients |
|---|---|
| Anthropic | Claude Desktop, Claude Code (CLI) |
| OpenAI | Codex CLI, OpenAI Agents SDK (Python + TS) |
| Google | Gemini CLI |
| IDE-integrated | Cursor, VS Code (Copilot Chat agent mode + Continue.dev), Windsurf, JetBrains AI Assistant, Zed |
| Open-source agents | OpenCode (sst/opencode), Cline, Aider, Goose (Block), 5ire |
| Generic | Custom `mcp-server` stdio caller (for users wiring their own runners) |

12 named clients + a generic fallback section.

---

## Pre-flight

```bash
gh pr view 5 --json state,statusCheckRollup --jq '{state, checks: [.statusCheckRollup[] | {name, conclusion}]}'
```

PR #5 (README usage doc) should be open / mergeable. The new `clients.md` is referenced from the updated README, so the two land together (squash-merge PR #5 + this work, or fold this into PR #5 before merge).

---

## Task 1 — Dispatch parallel research subagents

Five `Explore`-type subagents go out in a **single message** (parallel). Each owns one cluster and returns a fragment in the standard output schema below. None modifies files.

**Standard output schema each subagent must return:**

```markdown
### <client name>

**Status:** stable | beta | requires-self-host
**Last verified:** <date or "via WebFetch" with URL>

**Install location:**
- macOS: <path>
- Linux: <path>
- Windows: <path>

**Config file:** `<filename>` (format: json / jsonc / toml / yaml)

**Config block (minimal):**
```<format>
<exact copy-paste block>
```

**Config block (with timeout + env override):**
```<format>
<exact copy-paste block including --query-timeout and NOTEBOOKLM_COOKIES env>
```

**Verify:**
```
<one shell command or in-client prompt that proves the wiring works>
```

**Gotchas:** <one line if any; otherwise omit>
```

Cluster assignments (each subagent gets a focused prompt — see Task 2):

1. **Anthropic** (`Claude Desktop` + `Claude Code`)
2. **OpenAI** (`Codex CLI` + `Agents SDK` Python/TS)
3. **Google** (`Gemini CLI`)
4. **IDE-integrated** (`Cursor`, `VS Code` Copilot Chat + Continue.dev, `Windsurf`, `JetBrains AI Assistant`, `Zed`)
5. **Open-source agents** (`OpenCode`, `Cline`, `Aider`, `Goose`, `5ire`)

Each agent MUST:
- Verify the config format against the project's current README or docs via `WebFetch` / `gh` / Context7. Quote the source URL.
- Return the schema above. No prose outside the schema.
- Token budget: ≤ 1500 tokens per cluster.

## Task 2 — Aggregate findings into `docs/clients.md`

Controller (this session) assembles the file with:

1. **Header / TL;DR table** — one row per client, columns: `Client`, `Config file`, `Format`, `Section link`.
2. **Per-client sections** — pasted in cluster order: Anthropic → OpenAI → Google → IDE-integrated → Open-source.
3. **Generic stdio caller section** — for users wiring their own runner (covers env vars + the `serve` command + JSON-RPC over stdio expectations).
4. **Shared concerns appendix** — auth setup (link to README), `--query-timeout`, `NOTEBOOKLM_COOKIES` env, troubleshooting cross-link.

Save to `docs/clients.md`.

## Task 3 — Link from README

Insert a one-line pointer near the existing "AI Assistant Integration" header in `README.md`:

```markdown
> For Codex, Gemini CLI, OpenCode, Windsurf, Zed, JetBrains, Cline, Aider, Goose, 5ire, and the generic stdio caller, see [docs/clients.md](docs/clients.md).
```

Keep the existing three inline sections (Claude Desktop, Cursor, VS Code) — they're the most common. The link goes to the long-tail.

## Task 4 — Commit + push to the open PR branch

```bash
git checkout docs/readme-mcp-usage    # branch with the in-flight README PR
git add docs/clients.md README.md
git commit -m "docs: add multi-client integration guide (docs/clients.md)"
git push
```

`gh pr view 5` should now show the additional commit. CI re-runs automatically; on green, merge.

## Task 5 — Optional: cut v0.2.6 release

If the user wants the new docs visible on npmjs.com:

```bash
git checkout main
git pull --ff-only
make release           # 0.2.5 → 0.2.6
make release-push      # triggers CI → publish via OIDC
```

This is opt-in; docs already live on GitHub immediately.

---

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| MCP config format drift in a client (e.g. Cursor moves keys) | medium | Each research subagent must cite a URL. Re-check yearly. |
| Subagent invents a config that doesn't exist (e.g. claims a client supports MCP when it only supports it via plugin) | medium | Schema requires "Status" field; reject anything we can't confirm via WebFetch. |
| README link rot to `docs/clients.md` | low | Anchor link uses relative path; ships in the same repo. |

## Definition of done

- [ ] `docs/clients.md` exists with all 12 clients + the generic section, each in the standard schema.
- [ ] `README.md` links to it.
- [ ] PR #5 (or a successor) merged on `main`.
- [ ] No client section contains a config block whose source URL is older than 6 months without a "Last verified" note.

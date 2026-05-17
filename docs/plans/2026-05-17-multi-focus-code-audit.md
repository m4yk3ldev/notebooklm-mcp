# Multi-Focus Code Audit Plan

> **For Claude:** This is an AUDIT plan, not an implementation plan. Tasks dispatch read-only audit subagents in parallel. Each subagent returns findings; controller aggregates into a single report. No code changes during audit phase — remediation is a separate follow-up plan.

**Goal:** Produce a comprehensive multi-angle audit of `@m4ykeldev/notebooklm-mcp` (v0.2.4, ~5.6k LOC TypeScript) by dispatching specialized subagents in parallel, each with a single focus area and the matching superpower skill.

**Architecture:** Six parallel `Explore`-type subagents (read-only — cannot modify files). Each receives a tight scope, a required skill invocation, an output schema (severity-tagged findings table), and a token budget. Controller aggregates into `docs/audits/2026-05-17-summary.md`. No subagent runs the same scan twice — overlap is by design where two angles look at the same file from different lenses (e.g. auth.ts: security focus vs. code quality focus).

**Tech Stack:** Agent tool (`subagent_type: Explore`), built-in skills (security-auditor, typescript-pro, test-automator, architect-review, api-design-principles, code-reviewer), Read/Grep/Glob for source navigation.

---

## Scope

In-scope files:

```
src/
  cli.ts, server.ts, client.ts, auth.ts, browser-auth.ts
  constants.ts, types.ts, vendor.d.ts
  tools/{index,auth,notebook,query,research,source,studio}.ts
  __tests__/*.test.ts
.github/workflows/publish.yml
scripts/{pre-release.sh, release.sh, debug-*.mjs, dump-page.mjs, probe-page.mjs}
Makefile, package.json, pnpm-lock.yaml
README.md, CONTRIBUTING.md, CLAUDE.md
```

Out of scope:

- `dist/` (build output)
- `node_modules/`
- `docs/plans/` (planning docs, not product code)
- Anything Qodo/CI already gates (basic supply-chain — separate)

## Audit Foci & Agent Assignments

| # | Focus | Required Skill | Agent Type | Token Budget |
|---|---|---|---|---|
| 1 | Security & auth handling | security-auditor | Explore | ~200 lines findings |
| 2 | TypeScript correctness & type safety | typescript-pro | Explore | ~150 lines |
| 3 | RPC/API integration robustness | api-design-principles | Explore | ~150 lines |
| 4 | Test quality & coverage gaps | test-automator | Explore | ~150 lines |
| 5 | Architecture & abstractions | architect-review | Explore | ~150 lines |
| 6 | Docs accuracy vs. code | code-reviewer | Explore | ~100 lines |

All six dispatched in **one** message (parallel tool calls).

## Common Output Schema

Each subagent MUST return findings in this exact format:

```markdown
# Audit Report: <Focus Name>

## Summary
<2-3 sentences: overall posture and standout themes>

## Findings

| Severity | File:Line | Issue | Recommendation |
|---|---|---|---|
| critical | src/auth.ts:42 | … | … |
| high | … | … | … |
| medium | … | … | … |
| low | … | … | … |

## Strengths
- <bullet>
- <bullet>

## Out of scope but noted
- <anything found outside focus worth surfacing>
```

Severity ladder: `critical` (exploit / data loss path), `high` (broken contract / silent failure), `medium` (latent bug or maintainability cliff), `low` (nit with rationale).

---

## Task 1: Security & Auth Audit

**Dispatch prompt template (controller fills FOCUS-specific blanks):**

```
You are auditing the notebooklm-mcp codebase (~/github.com/me/notebooklm-mcp)
for SECURITY issues. You MUST invoke the `security-auditor` skill before
reading any source. Do not modify files — Explore agent type is read-only.

Scope:
- src/auth.ts, src/browser-auth.ts — token storage, cookie handling
- src/client.ts — outbound HTTP, CSRF token derivation, header construction
- src/cli.ts — env-var trust, file paths, argv handling
- src/server.ts, src/tools/*.ts — tool input validation, prompt-injection paths
- scripts/*.sh, scripts/*.mjs — shell injection, eval, file overwrite paths
- .github/workflows/publish.yml — privilege boundary on tag push

Specifically look for:
- Plaintext secrets persisted with weak perms (e.g. ~/.notebooklm-mcp/auth.json mode 0644 vs 0600)
- Cookie/token leakage in logs or error messages (stack traces, JSON.stringify of auth)
- Command/shell injection in scripts (unquoted vars, eval, `exec`)
- Path traversal in tool args (user-supplied file paths)
- Prompt injection vectors: tool responses concatenated into LLM context without sanitization
- TLS cert pinning, hostname validation in fetch calls
- Race conditions on token refresh
- Browser-auth CDP port (9229) reachable from outside loopback
- Missing rate limiting or retry-with-backoff exposing tokens via timing
- Hard-coded credentials or test fixtures with real keys

Use Grep for fast scans (e.g. `grep -rn "JSON.stringify.*token\|cookie\|password" src`).

Return findings in the standard schema documented in the audit plan.
Budget: ~200 lines of report.
```

## Task 2: TypeScript Correctness Audit

```
You are auditing notebooklm-mcp for TYPESCRIPT correctness. You MUST
invoke the `typescript-pro` skill before reading source.

Scope:
- All src/**/*.ts files
- tsconfig.json — confirm strict mode flags
- src/vendor.d.ts, src/types.ts — exported type surface

Look for:
- `any` escapes (search: `: any\b`, `as any`, `<any>`)
- Missing strict null checks despite strict mode
- Unsafe non-null assertions (`!.`) without preceding guard
- Type predicates that lie (assert X but return broader)
- Discriminated unions where one variant is unreachable
- Zod schemas that drift from TS types (z.infer mismatch)
- @ts-ignore / @ts-expect-error without justifying comment
- Returned types that hide errors (returning unknown / Object / {})
- Async functions missing return type annotation where inference is loose
- Generic constraints too loose / unused type parameters

Cross-check: tools/*.ts schema definitions vs the args type used in execute().

Return findings in the standard schema. Budget: ~150 lines.
```

## Task 3: RPC / API Integration Audit

```
You are auditing notebooklm-mcp for RPC AND API INTEGRATION robustness.
You MUST invoke the `api-design-principles` skill before reading source.

Scope (heaviest focus):
- src/client.ts — NotebookLMClient: callRpc, response parsing, error handling
- src/constants.ts — RPC_IDS, timeouts, CodeMapper enums
- src/tools/*.ts — RPC invocation patterns

Look for:
- Response parsing assumes shape without validating (data[0][2][3] etc. with no length check)
- Errors silently swallowed (try/catch with empty catch or generic re-throw losing context)
- Retries without idempotency check
- Timeouts not enforced (Promise.race missing) — DEFAULT_TIMEOUT vs EXTENDED_TIMEOUT misuse
- CSRF/session token refresh races (multiple in-flight calls all triggering refresh)
- Hardcoded indices into nested arrays (brittle, will break on Google response shape change)
- Status codes not differentiated (5xx vs 4xx treated identically)
- Pagination handling missing where API returns paginated results
- HTTP method mismatch (GET with body, POST without)
- Header construction that could leak auth via referer / origin

Return findings in standard schema. Budget: ~150 lines.
```

## Task 4: Test Quality & Coverage Audit

```
You are auditing notebooklm-mcp for TEST QUALITY. You MUST invoke the
`test-automator` skill before reading source.

Scope:
- src/__tests__/*.test.ts
- vitest.config.ts (coverage thresholds)
- Compare against src/**/*.ts to find gaps

Look for:
- Tests that mock the thing under test (test asserts on the mock, not behavior)
- Snapshot tests without explanation (hide regressions)
- Tests that only run happy path (no error / timeout / malformed-response cases)
- Coverage thresholds that lie (e.g. line coverage 95% but branch 50%)
- MSW handlers that don't match real Google batchexecute response shape
- Integration tests skipped or marked .skip / .todo without follow-up issue
- Async tests missing await (false-positive passes)
- Shared mutable state across tests (test order dependence)
- Missing tests for: token refresh, CSRF rotation, RPC parse failures, tool input validation rejection
- Test files named identically to source but covering only a subset

Run: `cat vitest.config.ts` and `pnpm test --reporter=verbose 2>&1 | head -50` if quick.

Return findings in standard schema. Budget: ~150 lines.
```

## Task 5: Architecture & Abstractions Audit

```
You are auditing notebooklm-mcp for ARCHITECTURE. You MUST invoke the
`architect-review` skill before reading source.

Scope:
- src/server.ts — bootstrap, DI of NotebookLMClient
- src/tools/index.ts — registerTools framework
- src/tools/*.ts — tool surface, naming, schema patterns
- src/client.ts — class shape, single-responsibility
- src/cli.ts — command structure

Look for:
- Modules that import too widely (god module, circular imports)
- Abstractions that hide more than they reveal (callback hell, wrapper-of-wrapper)
- Tool framework that requires boilerplate per tool (DRY violation)
- Tools with overlapping responsibilities or unclear separation between domains
- Magic strings instead of constants
- Lazy initialization that hides errors until first use
- Inconsistent error shape across tools (some return {status: "ok"}, others throw)
- Configuration coupling (env vars read deep in modules instead of at boundary)
- Naming drift: types.ts vs constants.ts vs vendor.d.ts — what belongs where?
- Premature abstractions (interface with one impl) or missing abstractions (copy-paste)

Return findings in standard schema. Budget: ~150 lines.
```

## Task 6: Documentation Accuracy Audit

```
You are auditing notebooklm-mcp for DOCS ACCURACY (docs vs actual code).
You MUST invoke the `code-reviewer` skill before reading.

Scope:
- README.md
- CONTRIBUTING.md
- CLAUDE.md
- docs/plans/*.md (skim only for outdated claims)

Cross-check against:
- Actual commands in Makefile
- Actual scripts in package.json
- Actual tool count and names in src/tools/*.ts
- Actual env vars / config paths in src/auth.ts, src/cli.ts
- Actual CLI flags in src/cli.ts

Look for:
- Commands documented but not in Makefile/package.json
- Tool counts that disagree across docs (README says X, CLAUDE.md says Y)
- File paths that have moved
- Install instructions that still reference npm where pnpm is now required
- Code blocks with wrong syntax highlighting or unrunnable examples
- Outdated CHANGELOG-style sections inside README
- Promises in docs that the code does not keep (e.g. "supports drag-and-drop" when no such tool)

Return findings in standard schema. Budget: ~100 lines.
```

---

## Aggregation Step (controller only, after all 6 return)

1. Collect all six reports.
2. Write `docs/audits/2026-05-17-summary.md` with sections:
   - **Top-line risks** (all `critical` + `high` from any focus, sorted by severity)
   - **Per-focus summaries** (each agent's Summary paragraph)
   - **Full findings tables** (concatenated, deduplicated where two focuses flag the same file/line)
   - **Cross-focus patterns** (if 3+ findings cluster in the same file, call it out)
   - **Recommended remediation plan** (which findings to bundle into one follow-up PR vs. separate)
3. Mark plan complete. Do NOT auto-spawn fix PRs — user decides priority.

## Constraints

- **No file modifications during audit.** All agents use `Explore` type (read-only).
- **One dispatch round.** All six agents go out in a single message. No sequential dependencies.
- **Token budget honored.** Each agent reminded of their cap in the prompt.
- **Skill invocation is mandatory.** Reject any agent report that did not invoke its named skill (or note it as a meta-finding).

## Out of scope for this plan

- Fix implementation (separate plan per remediation cluster)
- Performance / load testing (different agent type)
- Dependency / supply-chain (already covered by Qodo + CI)
- Test execution itself (vitest already runs in CI)

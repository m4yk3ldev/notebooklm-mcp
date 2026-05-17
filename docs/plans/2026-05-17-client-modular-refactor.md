# NotebookLMClient Modular Refactor Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute this plan one task at a time, running the test suite green after every commit.

**Goal:** Split the 1.4k-LOC monolithic `src/client.ts` into ≤4 focused modules without changing a single public method signature, then close the remaining coverage gaps to 100%.

**Architecture:** Hexagonal / single-responsibility refactor. The existing public class `NotebookLMClient` becomes a thin **domain facade** that composes three internal collaborators:

```
┌───────────────────────────────────────────────────────────────────┐
│  NotebookLMClient  (src/client.ts)                                │
│  ─────────────────────────────────────────────────                │
│  Domain methods (listNotebooks, query, createAudio…)              │
│  Delegates infrastructure to:                                     │
│  ┌──────────────────┐ ┌──────────────────┐ ┌─────────────────┐   │
│  │ RpcTransport     │ │ AuthState        │ │ wire (pure)     │   │
│  │ src/rpc/         │ │ src/rpc/         │ │ src/rpc/wire.ts │   │
│  │   transport.ts   │ │   auth-state.ts  │ │                 │   │
│  ├──────────────────┤ ├──────────────────┤ ├─────────────────┤   │
│  │ buildRequestBody │ │ tokens / csrf /  │ │ parseResponse   │   │
│  │ buildUrl         │ │   sessionId      │ │ extractRpcResult│   │
│  │ fetch + abort    │ │ refreshAuthOnce  │ │ extractText     │   │
│  │ readBodyWithAbort│ │   (mutex)        │ │ FromBlocks      │   │
│  │ HTTP status      │ │ persistCookies   │ │ (pure funcs)    │   │
│  │ Set-Cookie merge │ │ refreshAuthTokens│ │                 │   │
│  └──────────────────┘ └──────────────────┘ └─────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

**Three reasons to do this now**

1. **Operational safety:** A 1.4k-LOC file is a single blast-radius unit — when a sloppy `perl -i` corrupted it earlier today, the resulting dump tripped Anthropic's safety classifier and broke the session. Smaller files = smaller blast radius if anything ever corrupts again.
2. **Architectural debt (audit cross-cutting finding):** Security, TS, API, and architecture audits all flagged `client.ts` as overloaded. One refactor closes 4 audit themes.
3. **Coverage hits 100% naturally:** the uncovered lines today are mostly error / fallback branches inside the 1.4k file. After the split, each module gets its own focused test suite where the missing branches become trivial to cover.

**Tech Stack:** TypeScript strict mode, ESM, Vitest + MSW (unchanged). No new runtime deps. `tsup` bundle output remains the same single `dist/cli.js`.

**Non-goals**
- No public API change. Every external import (`NotebookLMClient`, `AuthenticationError`) keeps its current name and signature.
- No behavioural change. Cookie handling, retry logic, timeout enforcement, and error classes stay byte-equivalent.
- No new dependencies.

---

## Pre-flight (controller, once)

Confirm green baseline:

```bash
pnpm test --silent
```

Expected: `Tests 195 passed (195)` (current state on `chore/audit-2026-05-17`).

If red, fix before starting. Each task below also runs the full suite green before committing.

---

## Task 1 — Create `src/rpc/wire.ts` with pure parsing functions

**Files:**
- Create: `src/rpc/wire.ts`
- Test: `src/__tests__/rpc-wire.test.ts`
- Touch: nothing in `src/client.ts` yet (functions live in both places briefly)

**Why first:** `parseResponse`, `extractRpcResult`, `extractTextFromBlocks` are already pure (they mutate `this.sessionId` / `this.tokens` only in one spot — we'll lift those side-effects out). Moving them first lets later tasks just delete the duplicates.

**Step 1: Write failing tests for `parseResponse` + `extractTextFromBlocks` against the new module**

`src/__tests__/rpc-wire.test.ts` — copy the existing batchexecute envelope shapes from `client-rpc.test.ts` and assert against the new module exports:

```typescript
import { describe, it, expect } from "vitest";
import { parseResponse, extractTextFromBlocks } from "../rpc/wire.js";

describe("parseResponse", () => {
  it("strips )]}' prefix and parses framed chunks", () => {
    const json = JSON.stringify([["wrb.fr", "id", "{}", null, null, null, "generic"]]);
    const text = `)]}'\n\n${json.length}\n${json}`;
    expect(parseResponse(text)).toHaveLength(1);
  });

  it("warns and skips unparseable framed chunks", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    parseResponse(`)]}'\n\n5\nNOT JSON`);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("warns and skips unparseable unframed lines", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    parseResponse("not-json");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("extractTextFromBlocks", () => {
  it("returns concatenated leaf text", () => {
    const block = [[[null, null, [[null, null, [[null, null, "hello "]]]]]],
                   [null, null, [[null, null, [[null, null, "world"]]]]]];
    expect(extractTextFromBlocks(block)).toContain("hello");
  });

  it("returns empty string on malformed input (no throw)", () => {
    expect(extractTextFromBlocks(null)).toBe("");
    expect(extractTextFromBlocks([1, 2, 3])).toBe("");
  });
});
```

**Step 2: Run test — expect MODULE NOT FOUND**

```bash
pnpm test src/__tests__/rpc-wire.test.ts 2>&1 | tail -10
```

Expected: failure citing missing `src/rpc/wire.ts`.

**Step 3: Create `src/rpc/wire.ts` by COPY-PASTING the existing methods**

Mechanical copy from `src/client.ts`:
- `parseResponse(responseText: string): unknown[]` — body identical to `private parseResponse` (lines ~122–161 in current client.ts).
- `extractTextFromBlocks(data: any): string` — body identical to current `private extractTextFromBlocks`.
- Do NOT move `extractRpcResult` yet — it has side-effects on `this.sessionId` / `this.tokens`. Defer to Task 2 where AuthState gives it a clean seam.

Make every function exported, top-level, no `this`. No new imports needed beyond what `console.warn` already uses.

**Step 4: Run full suite**

```bash
pnpm test --silent 2>&1 | tail -5
```

Expected: 195 + N (new tests) pass; pre-existing client tests untouched.

**Step 5: Commit**

```bash
git add src/rpc/wire.ts src/__tests__/rpc-wire.test.ts
git commit -m "refactor(rpc): extract pure parseResponse/extractTextFromBlocks to wire module"
```

---

## Task 2 — Create `src/rpc/auth-state.ts` with `AuthState` class

**Files:**
- Create: `src/rpc/auth-state.ts`
- Test: `src/__tests__/rpc-auth-state.test.ts`
- Touch: nothing in `client.ts`

**Why second:** `extractRpcResult` (still in client.ts) needs `AuthState.recordSessionId(sid)` as its only side-effect seam. Building AuthState first means Task 3 can lift `extractRpcResult` without leaving dangling `this.` references.

**Public surface of `AuthState`:**

```typescript
export class AuthState {
  constructor(initial: AuthTokens) { /* … */ }

  get tokens(): AuthTokens;        // current full token bundle
  get csrfToken(): string;
  get sessionId(): string;
  get cookies(): Record<string, string>;

  /** Update session ID returned by the server (af.httprm). Persists. */
  recordSessionId(sid: string): void;

  /** Merge Set-Cookie names → values; persists. */
  recordSetCookies(setCookieLines: readonly string[]): void;

  /** Disk reload — true if fresher than current. */
  reloadIfNewer(): Promise<boolean>;

  /**
   * Single-flight refresh. First caller spawns the headless/manual
   * Chrome flow; concurrent callers await the same promise. Slot
   * cleared on settle so the next failure can retry.
   */
  refreshOnce(): Promise<void>;
}
```

**Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi } from "vitest";

const { refreshCookiesHeadless, runBrowserAuthFlow } = vi.hoisted(() => ({
  refreshCookiesHeadless: vi.fn(),
  runBrowserAuthFlow: vi.fn(),
}));

vi.mock("../browser-auth.js", () => ({
  refreshCookiesHeadless,
  runBrowserAuthFlow,
}));
vi.mock("../auth.js", async (orig) => ({
  ...(await orig<any>()),
  saveTokens: vi.fn(),
}));

import { AuthState } from "../rpc/auth-state.js";

const seed = () => ({
  cookies: { SID: "a", HSID: "b", SSID: "c", APISID: "d", SAPISID: "e" },
  csrf_token: "csrf-0",
  session_id: "sid-0",
  extracted_at: 1700000000,
});

describe("AuthState", () => {
  it("recordSessionId updates state and persists", () => {
    const s = new AuthState(seed());
    s.recordSessionId("new-sid");
    expect(s.sessionId).toBe("new-sid");
    expect(s.tokens.session_id).toBe("new-sid");
  });

  it("recordSetCookies merges name/value pairs", () => {
    const s = new AuthState(seed());
    s.recordSetCookies(["NEW=v1; Path=/", "SID=updated; HttpOnly"]);
    expect(s.cookies.NEW).toBe("v1");
    expect(s.cookies.SID).toBe("updated");
  });

  it("refreshOnce single-flights concurrent callers", async () => {
    refreshCookiesHeadless.mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 30));
      return { ...seed(), csrf_token: "csrf-1", extracted_at: 1700000001 };
    });
    const s = new AuthState(seed());
    await Promise.all([s.refreshOnce(), s.refreshOnce(), s.refreshOnce()]);
    expect(refreshCookiesHeadless).toHaveBeenCalledTimes(1);
    expect(s.csrfToken).toBe("csrf-1");
  });

  it("refreshOnce falls back to runBrowserAuthFlow when headless throws", async () => {
    refreshCookiesHeadless.mockRejectedValueOnce(new Error("headless broken"));
    runBrowserAuthFlow.mockResolvedValueOnce({ ...seed(), csrf_token: "csrf-fallback" });
    const s = new AuthState(seed());
    await s.refreshOnce();
    expect(runBrowserAuthFlow).toHaveBeenCalled();
    expect(s.csrfToken).toBe("csrf-fallback");
  });

  it("refreshOnce slot clears after settle (next failure can retry)", async () => {
    refreshCookiesHeadless.mockResolvedValue({ ...seed(), csrf_token: "csrf-2" });
    const s = new AuthState(seed());
    await s.refreshOnce();
    await s.refreshOnce();
    expect(refreshCookiesHeadless).toHaveBeenCalledTimes(2);
  });
});
```

**Step 2: Run — expect MODULE NOT FOUND**

```bash
pnpm test src/__tests__/rpc-auth-state.test.ts 2>&1 | tail -10
```

**Step 3: Implement `src/rpc/auth-state.ts`**

Lift the existing `refreshAuthOnce` private method body + the `authRefreshPromise` field + the Set-Cookie merge block (lines ~261–270 in current client.ts) + the `recordSessionId` logic (lines ~178–180 of current `extractRpcResult`) into the new class. Use `saveTokens` from `auth.js` for persistence.

Do NOT delete from `client.ts` yet — that's Task 3.

**Step 4: Run full suite**

```bash
pnpm test --silent 2>&1 | tail -5
```

Expected: previous 195 + new tests all green.

**Step 5: Commit**

```bash
git add src/rpc/auth-state.ts src/__tests__/rpc-auth-state.test.ts
git commit -m "refactor(rpc): introduce AuthState class with single-flight refresh mutex"
```

---

## Task 3 — Create `src/rpc/transport.ts` with `RpcTransport` class

**Files:**
- Create: `src/rpc/transport.ts`
- Test: `src/__tests__/rpc-transport.test.ts`

**Public surface:**

```typescript
export class RpcTransport {
  constructor(private auth: AuthState, private queryTimeout: number) { /* … */ }

  /** POST to /batchexecute. Returns parsed envelopes (parseResponse output). */
  callBatchexecute(rpcId: string, params: unknown, sourcePath?: string, timeout?: number): Promise<unknown[]>;

  /** POST to /v1/generate. Returns parsed envelopes. */
  callQuery(notebookId: string, body: string): Promise<unknown[]>;

  /** GET the NotebookLM landing page. Used during CSRF refresh. */
  fetchLandingHtml(): Promise<string>;
}
```

Internals: `buildRequestBody`, `buildUrl`, `buildQueryUrl`, `readBodyWithAbort`, response.ok check, Set-Cookie -> `auth.recordSetCookies`, parseResponse -> uses `wire.parseResponse`.

**Step 1: Tests — fetch mocked via msw**

Reuse the `mockBatchexecute` helper from `client-rpc.test.ts`. Cover:
- happy-path call → returns parsed envelope
- HTTP 503 → throws `HTTP 503 ...`
- AbortError propagates as `… aborted` error
- Set-Cookie response → `auth.cookies` updated

**Step 2 + 3: Implement Transport, ensuring `extractRpcResult` lives here (calls `auth.recordSessionId` for the af.httprm side-effect, throws `AuthenticationError` on code 16).**

`AuthenticationError` stays exported from `client.ts` for backward compatibility, but its definition can move to `src/rpc/errors.ts` re-exported from `client.ts`. Simpler: leave the `export class AuthenticationError` in `client.ts` and import it from there into `transport.ts`.

**Step 4 + 5: Full suite, commit**

```bash
git add src/rpc/transport.ts src/__tests__/rpc-transport.test.ts
git commit -m "refactor(rpc): introduce RpcTransport composing AuthState + wire"
```

---

## Task 4 — Slim `src/client.ts` to a domain facade

**Files:**
- Modify (delete most of): `src/client.ts`

**Strategy: KEEP every public method's signature and behaviour. The body becomes a delegation to the new collaborators.**

```typescript
// src/client.ts (post-refactor sketch)
import { AuthState } from "./rpc/auth-state.js";
import { RpcTransport } from "./rpc/transport.js";
import { RPC_IDS, /* enums */ } from "./constants.js";
import type { AuthTokens, Notebook, /* … */ } from "./types.js";

export class AuthenticationError extends Error { /* unchanged */ }

export class NotebookLMClient {
  private auth: AuthState;
  private transport: RpcTransport;
  private conversationHistory: Map<string, unknown[]> = new Map();

  constructor(tokens: AuthTokens, queryTimeout: number = EXTENDED_TIMEOUT) {
    this.auth = new AuthState(tokens);
    this.transport = new RpcTransport(this.auth, queryTimeout);
  }

  async listNotebooks(pageSize = 10): Promise<Notebook[]> {
    const result = await this.transport.callBatchexecute(
      RPC_IDS.LIST_NOTEBOOKS,
      [pageSize],
    );
    return parseNotebooks(result); // pure helper from wire.ts
  }

  // … each existing public method becomes a small delegator wrapper.
}
```

Domain-specific parsers (`parseNotebook`, `parseSource`, response shapers) can stay private in `client.ts` OR move to `src/rpc/parsers.ts` if they grow.

**Step 1: Per-method migration** — do this one method at a time, running tests after each one:
1. `listNotebooks`
2. `getNotebook`
3. `createNotebook`
4. `renameNotebook` / `deleteNotebook`
5. Source methods (`addUrlSource`, `addTextSource`, `addDriveSource`, `getSource`, `syncDrive`, `deleteSource`, `checkFreshness`)
6. `query` (also drops its inlined refresh-loop in favour of catching `AuthenticationError`, calling `auth.refreshOnce()`, retrying)
7. Studio methods (`createAudioOverview`, `createVideoOverview`, …, `pollStudio`, `deleteStudio`)
8. Research methods (`startResearch`, `pollResearch`, `importResearch`)
9. `refreshAuth`

After each method, run `pnpm test --silent`. Commit every 2–3 methods so bisect remains useful.

**Step 2: Final verification**

```bash
pnpm test --silent 2>&1 | tail -5
pnpm run build 2>&1 | tail -3
```

Both green; `dist/cli.js` builds.

**Step 3: Final commit for facade**

```bash
git add src/client.ts
git commit -m "refactor(client): collapse NotebookLMClient into thin domain facade over rpc/*"
```

---

## Task 5 — Tighten coverage to 100%

After the split, each module is smaller and missing branches become surgical to test.

**Files:**
- Modify: `vitest.config.ts` — raise thresholds:
  ```typescript
  thresholds: {
    statements: 100,
    branches: 100,
    functions: 100,
    lines: 100,
  },
  ```
- Add: tests for any module that lands below 100% after the previous tasks.

**Step 1: Run coverage, list gaps**

```bash
pnpm test --coverage 2>&1 | grep -E "\.ts\s*\|"
```

**Step 2: For every uncovered line, add a focused test in the matching `src/__tests__/<module>.test.ts`.** Typical residuals:
- platform-branch fall-throughs in `browser-auth.findChrome` (already partly covered)
- the `else if (platform === "win32")` arm in `cli.ts:77-79` (run a child process or use `vi.spyOn(process, "exit")`)
- `else if (eq > 0)` falsy branch in `auth.parseCookieString` — add a test with a cookie segment lacking `=`

**Step 3: Re-run with strict thresholds**

```bash
pnpm test --coverage 2>&1 | tail -10
```

Expected: `Coverage summary` shows 100/100/100/100. No ERROR lines.

**Step 4: Commit**

```bash
git add vitest.config.ts src/__tests__/*.test.ts
git commit -m "test: close last coverage gaps; raise threshold to 100% across the board"
```

---

## Task 6 — Update `CLAUDE.md` architecture section

**Files:**
- Modify: `CLAUDE.md` (Architecture / Key Files block)

Reflect the new layout:
- `src/client.ts` — domain facade
- `src/rpc/transport.ts` — HTTP + body abort + Set-Cookie
- `src/rpc/auth-state.ts` — tokens, mutex, refresh
- `src/rpc/wire.ts` — pure parsers

Commit:

```bash
git add CLAUDE.md
git commit -m "docs(architecture): describe rpc/* split"
```

---

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Public method signature drift breaks downstream MCP tools | low | Task 4 explicit rule: every public method keeps name + arity + return shape. Test suite catches regressions per method. |
| Coverage threshold spike (100%) blocks legitimate hot-paths that are platform-specific (e.g. win32 branches on Linux CI) | medium | If a branch is genuinely unreachable on CI, use `/* c8 ignore next */` with a comment naming the platform, not a blanket exclusion. |
| Subtle ordering change in Set-Cookie handling (split between transport + auth) | low | Test asserts cookies after a known Set-Cookie sequence; same case as today, just routed through `auth.recordSetCookies`. |
| Edit tool hits the safety filter again on a corrupted state | low | Discipline: every edit uses Edit tool with `replace_all` for multi-site replacements. No `perl -i` / `sed -i` on TS files. Validate transforms with `wc -l` + `grep -c`, never full file dumps. |

## Definition of done

- [x] Plan checked in (this file).
- [ ] All 6 tasks merged on the working branch.
- [ ] `pnpm test --coverage` reports 100/100/100/100.
- [ ] `pnpm run build` produces `dist/cli.js` byte-for-byte equivalent in public exports.
- [ ] No public method signature changed (grep diff vs main confirms).
- [ ] `make release` bumps to next version; `make release-push` ships to npm via OIDC.

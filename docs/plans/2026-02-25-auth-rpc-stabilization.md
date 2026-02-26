# Authentication and RPC Stabilization Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish a stable and reliable communication channel with Google NotebookLM by fixing the authentication refresh loop and RPC request formatting.

**Architecture:** Use a "browser-truth" approach where critical session metadata (CSRF, SID, BL) is extracted directly from a real browser context during refresh. Consolidate RPC formatting to match Google's latest standards and ensure session consistency across all request types.

**Tech Stack:** Node.js, TypeScript, WebSocket (for CDP), Vitest (for verification).

---

### Task 1: Robust Token Extraction from Browser

**Files:**
- Modify: `src/browser-auth.ts`

**Step 1: Write diagnostic logging to verify current extraction**
Modify `extractCookiesViaCDP` to log the exact `WIZ_global_data` found in the browser.

**Step 2: Implement full extraction logic**
Update `extractCookiesViaCDP` to extract `csrf`, `sid`, and `bl` (build label) directly from `window.WIZ_global_data`.

**Step 3: Enable Runtime domain**
Ensure `Runtime.enable` is called on the CDP WebSocket before trying to evaluate JS.

**Step 4: Verify with a manual run**
Run `node dist/cli.js auth` and check `auth.json` for all fields.

**Step 5: Commit**
```bash
git add src/browser-auth.ts
git commit -m "fix: implement direct browser extraction for session metadata"
```

### Task 2: Standardize RPC Request Formatting

**Files:**
- Modify: `src/client.ts`
- Modify: `src/constants.ts`

**Step 1: Update default Build Label**
Update `DEFAULT_BL` in `src/constants.ts` to a confirmed 2026 version.

**Step 2: Implement Triple-Nested RPC Format**
Update `buildRequestBody` to use `[[[rpcId, paramsJson, null, "generic"]]]` format.

**Step 3: Ensure Request ID consistency**
Ensure `_reqid` is present and incrementing in all `batchexecute` URLs.

**Step 4: Add mandatory security headers**
Add `X-Google-SIDRT: 1` and `X-Goog-Encode-Response-If-Executable: base64`.

**Step 5: Commit**
```bash
git add src/client.ts src/constants.ts
git commit -m "fix: standardize RPC request format and security headers"
```

### Task 3: Robust Retry and Session Warming

**Files:**
- Modify: `src/client.ts`

**Step 1: Consolidate retry logic**
Unify `execute` and `query` methods to use the same recursive retry pattern with `isRetry` flag.

**Step 2: Implement Session Warming**
Add a lightweight RPC call (e.g., Settings) or a GET request to the home page after a token refresh but BEFORE retrying the failed request.

**Step 3: Add retry delay**
Implement a 2-3 second delay before the retry to allow Google's backend to propagate session state.

**Step 4: Token reloading**
Implement automatic token reloading from disk if an authentication error occurs, allowing the server to pick up fresh manual logins.

**Step 5: Commit**
```bash
git add src/client.ts
git commit -m "feat: implement session warming and robust retry logic"
```

### Task 4: Final Verification and Cleanup

**Files:**
- Modify: `src/client.ts`
- Modify: `src/browser-auth.ts`

**Step 1: Run comprehensive tests**
Run `npm test` to ensure no regressions in the integration suite.

**Step 2: Perform real-world verification**
Run `node dist/cli.js serve` with `notebook_list` and verify it returns a successful response (even if empty).

**Step 3: Remove all diagnostic logs**
Remove all `console.error` and `[DEBUG]` logs added during the investigation.

**Step 4: Commit**
```bash
git add .
git commit -m "chore: cleanup diagnostic logs and finalize stabilization"
```

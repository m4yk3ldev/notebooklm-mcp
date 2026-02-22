# Background Auth Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement automated, invisible session refresh using a headless Chrome process and the dedicated persistent profile.

**Architecture:** Intercept AuthenticationError (Code 16) in the client, trigger a headless browser extraction of cookies via CDP, and retry the failed request transparently.

**Tech Stack:** TypeScript, Node.js, Chrome DevTools Protocol (CDP), WebSocket.

---

### Task 1: Refactor Chrome Launch Logic

**Files:**
- Modify: `src/browser-auth.ts`

**Step 1: Extract generic Chrome launcher**
Refactor `runBrowserAuthFlow` to use a shared internal function `launchChrome(headless: boolean)` that handles the spawn logic.

**Step 2: Validation**
Create `src/test-launcher.ts` to verify both headless and visible modes.
Run: `npx tsup src/test-launcher.ts && node dist/test-launcher.js`
Expected: Chrome launches successfully in both modes (manually verified).

**Step 3: Commit**
```bash
git add src/browser-auth.ts
git commit -m "refactor: extract shared chrome launcher logic"
```

### Task 2: Implement Headless Cookie Refresh

**Files:**
- Modify: `src/browser-auth.ts`

**Step 1: Add `refreshCookiesHeadless()`**
Implement the function that launches Chrome in headless mode, connects via CDP, and polls for cookies until success or timeout (15s).

**Step 2: Validation**
Update `src/test-launcher.ts` to trigger a headless refresh and print extracted cookies.
Run: `node dist/test-launcher.js --refresh`
Expected: Cookies printed to console without any window appearing.

**Step 3: Commit**
```bash
git add src/browser-auth.ts
git commit -m "feat: implement headless cookie refresh via CDP"
```

### Task 3: Client Interception & Retry Logic

**Files:**
- Modify: `src/client.ts`

**Step 1: Update `execute` method**
Add a try/catch block around the core execution. If `AuthenticationError` is caught, call `refreshCookiesHeadless()`, update internal tokens, and retry **once**.

**Step 2: Validation**
Simulate expiration by manually deleting a key from `auth.json` and running a tool command.
Run: `node dist/cli.js notebook_list`
Expected: Client detects error, refreshes in background, and eventually returns the list successfully.

**Step 3: Commit**
```bash
git add src/client.ts
git commit -m "feat: intercept auth errors and trigger automatic retry"
```

### Task 4: Fallback to Visible Smart Auth

**Files:**
- Modify: `src/client.ts`
- Modify: `src/browser-auth.ts`

**Step 1: Implement fallback trigger**
If `refreshCookiesHeadless()` fails (timeout or no session), call `runBrowserAuthFlow()` (visible) automatically.

**Step 2: Validation**
Clear the persistent profile `~/.notebooklm-mcp/chrome-profile` and run a tool.
Expected: Headless fails -> Visible Chrome window opens -> You login -> Tool succeeds.

**Step 3: Commit**
```bash
git add src/client.ts src/browser-auth.ts
git commit -m "feat: fallback to visible auth when headless refresh fails"
```

### Task 5: Final Build & Cleanup

**Files:**
- Delete: `src/test-launcher.ts`
- Modify: `package.json` (bump version to 0.1.21)

**Step 1: Production build**
Run: `npx tsup`
Expected: `dist/cli.js` generated without errors.

**Step 2: Final Commit**
```bash
git add .
git commit -m "chore: bump version to 0.1.21 and cleanup"
git tag v0.1.21
```

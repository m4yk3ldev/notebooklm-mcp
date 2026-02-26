# Auth Fix and MCP Stabilization Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the authentication loop so the MCP can actually connect to Google NotebookLM and retrieve notebook data.

**Architecture:** Three root causes identified. Fix them in order: (1) CDP auth resolves too early with stale cookies, (2) auth errors are silently masked as empty results, (3) stale debug logs and uncommitted experimental changes need cleanup. No new dependencies needed.

**Tech Stack:** Node.js, TypeScript, Chrome CDP (WebSocket), Google batchexecute RPC

---

## Root Cause Analysis

| Bug | File | Symptom |
|-----|------|---------|
| `validateCookies` checks names only, not validity | `src/auth.ts:13` | Expired SID/HSID pass validation → auth resolves with dead cookies |
| CDP auth doesn't verify NotebookLM actually loaded | `src/browser-auth.ts:195` | Resolves while Chrome is on `accounts.google.com` login page |
| `[16]` on retry falls through to `null` | `src/client.ts:182` | `listNotebooks` gets `null` → returns `[]` → hides auth error |
| Debug `console.error` logs in prod code | `src/client.ts:162,173,256,713` | Leaks internal data, pollutes stderr |

---

### Task 1: Fix CDP auth — require NotebookLM page, not just cookies

**Problem:** `extractCookiesViaCDP` resolves the moment `validateCookies` passes, even if Chrome is on `accounts.google.com/accountchooser`. Expired cookies from Chrome's keyring have the right names (SID, HSID, etc.) so validation passes immediately.

**Fix:** After cookies validate, evaluate `window.location.href`. Only resolve if the URL starts with `https://notebooklm.google.com`. If not, keep polling — the user still needs to log in.

**Files:**
- Modify: `src/browser-auth.ts:195-228`

**Step 1: Update the cookie validation block to also check the page URL**

Replace the current block starting at `if (validateCookies(cookies))` (line ~195) with:

```typescript
if (validateCookies(cookies)) {
  // Cookies look complete — but verify we're actually ON NotebookLM
  // (not on accounts.google.com login/chooser page)
  send("Runtime.evaluate", {
    expression: `JSON.stringify({
      href: window.location.href,
      csrf: (window.WIZ_global_data && window.WIZ_global_data.SNlM0e) || null,
      sid: (window.WIZ_global_data && window.WIZ_global_data.FdrFJe) || null,
      bl: (window.WIZ_global_data && window.WIZ_global_data.cfb2h) || null
    })`
  });

  const tokens: AuthTokens = {
    cookies,
    csrf_token: "",
    session_id: "",
    extracted_at: Date.now() / 1000,
  };

  lastExtractedTokens = tokens;
} else if (showProgress) {
  process.stderr.write(".");
}
```

**Step 2: Update the Runtime.evaluate response handler to check href**

Replace the current `if (response.result && response.result.result && ...)` block (line ~214) with:

```typescript
if (response.result?.result?.value && lastExtractedTokens) {
  try {
    const data = JSON.parse(response.result.result.value);
    // Only resolve if we're actually on NotebookLM — not the login page
    if (!data.href || !data.href.startsWith("https://notebooklm.google.com")) {
      // Still on Google login/chooser — reset and keep polling
      lastExtractedTokens = null;
      if (showProgress) process.stderr.write("🔑");
      return;
    }
    lastExtractedTokens.csrf_token = data.csrf || "";
    lastExtractedTokens.session_id = data.sid || "";
    lastExtractedTokens.bl = data.bl || "";
    saveTokens(lastExtractedTokens);
    cleanup();
    resolve(lastExtractedTokens);
  } catch (e) {
    // ignore parse errors
  }
}
```

**Step 3: Build**

```bash
npm run build
```

Expected: no TypeScript errors.

**Step 4: Test auth manually**

```bash
node dist/cli.js auth
```

Expected:
- Chrome opens
- If session is expired: Chrome shows Google login page, `🔑` progress chars appear in terminal, auth WAITS
- After logging in: auth resolves with "✅ Connection secured!"
- If session is fresh: resolves immediately

**Step 5: Commit**

```bash
git add src/browser-auth.ts
git commit -m "fix: require NotebookLM page load before resolving CDP auth"
```

---

### Task 2: Fix silent auth error masking in RPC retry

**Problem:** In `extractRpcResult` (`src/client.ts:175-187`), when Google returns `[16]` (auth error) AND `isRetry=true`, the code falls through the `if (!isRetry)` guard and continues to line 189 where it returns `item[2]` (which is `null`). Then `listNotebooks` receives `null`, hits `if (!Array.isArray(result))`, and silently returns `[]` — hiding the auth failure entirely.

**Fix:** When `[16]` is detected on retry, still throw `AuthenticationError`. The caller's outer try/catch will surface it as an error to the MCP client.

**Files:**
- Modify: `src/client.ts:174-187`

**Step 1: Change the `[16]` handler to always throw**

Replace:

```typescript
// Check for auth error (code 16)
if (
  item.length > 6 &&
  item[6] === "generic" &&
  Array.isArray(item[5]) &&
  item[5].includes(16)
) {
  // If it's the first try, throw so we can refresh
  if (!isRetry) {
    throw new AuthenticationError(
      "Authentication expired. Run `npx @m4ykeldev/notebooklm-mcp auth` to re-authenticate.",
    );
  }
}
```

With:

```typescript
// Check for auth error (code 16)
if (
  item.length > 6 &&
  item[6] === "generic" &&
  Array.isArray(item[5]) &&
  item[5].includes(16)
) {
  throw new AuthenticationError(
    "Authentication expired. Run `npx @m4ykeldev/notebooklm-mcp auth` to re-authenticate.",
  );
}
```

**Step 2: Build**

```bash
npm run build
```

**Step 3: Test that errors now surface**

```bash
node dist/cli.js serve
```

In a second terminal (or via the test script):

```bash
python3 - << 'EOF'
import subprocess, json
proc = subprocess.Popen(["node", "dist/cli.js", "serve"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
def send(msg):
    proc.stdin.write(json.dumps(msg) + "\n"); proc.stdin.flush()
    return json.loads(proc.stdout.readline())
send({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}})
r = send({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"notebook_list","arguments":{}}})
proc.terminate()
print(json.loads(r["result"]["content"][0]["text"]))
EOF
```

Expected: either `{"status":"success","notebooks":[...]}` (if auth works) or `{"status":"error","error":"Authentication expired..."}` (if still invalid) — never silent `[]`.

**Step 4: Commit**

```bash
git add src/client.ts
git commit -m "fix: always throw AuthenticationError on [16] — don't mask auth failures"
```

---

### Task 3: Remove debug logs and commit experimental RPC param changes

**Problem:** The uncommitted diff in `src/client.ts` has two separate changes mixed together:
1. Three `console.error` debug lines that should never have been in production code
2. Experimental RPC param simplifications (`listNotebooks`, `getNotebook`, `createNotebook`)

The RPC param changes need to be committed as a real change; the debug logs need to be deleted.

**Files:**
- Modify: `src/client.ts`

**Step 1: Remove the three debug console.error lines**

Delete line ~162:
```typescript
console.error(`[RPC DEBUG] Item: ${item[0]}, ID: ${item[1]}, Data exists: ${!!item[2]}`);
```

Delete line ~173:
```typescript
console.error(`[RPC DEBUG] Match found! Item: ${JSON.stringify(item)}`);
```

Delete line ~256 (in `execute`):
```typescript
console.error(`[SERVER RESPONSE] Raw text starts with: ${text.substring(0, 300)}`);
```

Delete line ~713 (in `query` method):
```typescript
console.error(`[SERVER RESPONSE] Raw text starts with: ${text.substring(0, 300)}`);
```

**Step 2: Build**

```bash
npm run build
```

Expected: clean build, no TS errors.

**Step 3: Verify no debug output leaks**

```bash
python3 - << 'EOF'
import subprocess, json
proc = subprocess.Popen(["node", "dist/cli.js", "serve"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
def send(msg):
    proc.stdin.write(json.dumps(msg) + "\n"); proc.stdin.flush()
    return json.loads(proc.stdout.readline())
send({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}})
r = send({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"notebook_list","arguments":{}}})
proc.terminate()
stderr = proc.stderr.read()
print("RESULT:", json.loads(r["result"]["content"][0]["text"]))
has_debug = "[RPC DEBUG]" in stderr or "[SERVER RESPONSE]" in stderr
print("Debug logs present:", has_debug)
assert not has_debug, "Debug logs still present!"
EOF
```

Expected: `Debug logs present: False`

**Step 4: Commit everything**

```bash
git add src/client.ts
git commit -m "fix: remove debug logs and simplify RPC params for notebook operations"
```

---

### Task 4: End-to-end verification

**Step 1: Run auth to get a fresh valid session**

```bash
node dist/cli.js auth
```

Log in when Chrome opens. Wait for "✅ Connection secured!".

**Step 2: Test notebook_list**

```bash
python3 - << 'EOF'
import subprocess, json
proc = subprocess.Popen(["node", "dist/cli.js", "serve"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
def send(msg):
    proc.stdin.write(json.dumps(msg) + "\n"); proc.stdin.flush()
    return json.loads(proc.stdout.readline())
send({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}})
r = send({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"notebook_list","arguments":{}}})
proc.terminate()
result = json.loads(r["result"]["content"][0]["text"])
print(json.dumps(result, indent=2))
assert result["status"] == "success", f"Expected success, got: {result}"
print("✅ notebook_list works!")
EOF
```

**Step 3: Test notebook_get with the target notebook**

```bash
python3 - << 'EOF'
import subprocess, json
proc = subprocess.Popen(["node", "dist/cli.js", "serve"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
def send(msg):
    proc.stdin.write(json.dumps(msg) + "\n"); proc.stdin.flush()
    return json.loads(proc.stdout.readline())
send({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}})
r = send({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"notebook_get","arguments":{"notebook_id":"f8cf9561-c834-4e4f-b3a4-9843c34093c8"}}})
proc.terminate()
result = json.loads(r["result"]["content"][0]["text"])
print(json.dumps(result, indent=2))
EOF
```

Expected: either notebook data (if this account owns it) or a clear "permission denied" error — never silent empty results.

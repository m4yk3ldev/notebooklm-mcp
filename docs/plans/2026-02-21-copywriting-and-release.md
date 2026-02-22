# Copywriting & Release v0.1.22 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refine system messages and README using copywriting principles and perform the v0.1.22 release.

**Architecture:** Systematic text replacement in source files and README, followed by standard release procedures (version bump, build, tag).

**Tech Stack:** TypeScript, Markdown, Git.

---

### Task 1: Refine CLI & Browser Auth Messages

**Files:**
- Modify: `src/browser-auth.ts`
- Modify: `src/client.ts`

**Step 1: Update Browser Auth messages**
Rewrite logs in `src/browser-auth.ts` using polished English:
- Launch message: "✨ Initializing Smart Authentication... (Setting up a secure session)"
- Waiting message: "🔓 Ready for login! If you're already signed into Google, we'll handle the rest automatically."
- Success message: "✅ Connection secured! Your NotebookLM session is now synchronized."

**Step 2: Update Client Refresh messages**
Rewrite logs in `src/client.ts`:
- Refresh attempt: "🔄 Session expired. Effortlessly restoring your connection in the background..."
- Fallback message: "⚠️ Automatic refresh encountered a hiccup. Launching a manual login window to get you back on track."

**Step 3: Validation**
Check strings manually for correctness.
Run: `npx tsup`
Expected: Success.

**Step 4: Commit**
```bash
git add src/browser-auth.ts src/client.ts
git commit -m "style: polish CLI and auth messages with professional copywriting"
```

### Task 2: Rewrite README.md for Maximum Impact

**Files:**
- Modify: `README.md`

**Step 1: Apply PAS Framework and benefits**
Rewrite the introduction and authentication sections to highlight the "Magic" of Smart Auth and the power of NotebookLM in the terminal. Use emojis and clear structure.

**Step 2: Validation**
Preview Markdown (simulated).
Expected: Persuasive and professional content.

**Step 3: Commit**
```bash
git add README.md
git commit -m "docs: rewrite README with improved copywriting and structure"
```

### Task 3: Version Bump & Release v0.1.22

**Files:**
- Modify: `package.json`
- Modify: `src/cli.ts`
- Modify: `CHANGELOG.md`

**Step 1: Update version numbers**
Set version to `0.1.22` in `package.json` and `src/cli.ts`.

**Step 2: Update CHANGELOG.md**
Add entry for `[0.1.22]` mentioning the Chrome `%U` fix and the copywriting overhaul.

**Step 3: Build & Tag**
Run: `npx tsup`
Expected: `dist/cli.js` updated.

**Step 4: Final Commit & Tag**
```bash
git add .
git commit -m "chore: bump version to 0.1.22 and finalize release"
git tag v0.1.22
```

**Step 5: Push to Remote**
Run: `git push origin main --tags`
Expected: Changes pushed to GitHub.

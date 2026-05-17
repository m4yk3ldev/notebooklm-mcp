# Pre-Release Supply-Chain Audit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a mandatory supply-chain audit that runs **both in CI (the real gate) and locally before `make release-push`**, catching known vulnerabilities, tampered packages, lockfile drift, and unexpected published files.

**Architecture:** Defense-in-depth with a strict CI gate chain — `secret-scan → osv-scan → audit → test → publish` — mirroring `hanclym_ai/.github/workflows/ci.yml`. Each gate blocks the next.

1. **gitleaks (secret-scan):** incremental scan of new commits for leaked credentials. Critical here because `auth.json` holds Google session cookies — a stray commit would publish them on npm.
2. **osv-scanner (osv-scan):** Google's Open Source Vulnerabilities scanner. Broader DB than `npm audit` alone (covers GHSA + OSV + Debian + PyPI). Scans `package-lock.json`.
3. **`scripts/pre-release.sh` (audit):** npm-specific supply-chain checks — `npm ci`, `npm audit --audit-level=high`, `npm audit signatures` (Sigstore tarball verification), `lockfile-lint` (registry pinning), `npm pack --dry-run` (publish manifest preview).
4. **Test job:** unchanged build + test.
5. **Publish:** only on `v*` tags, only after all four gates pass.

`scripts/pre-release.sh` is also invoked locally by `make release-push` for fast dev feedback before pushing. The script is CI-aware: skips the "git clean" check when `CI=true` (CI checkouts are always clean) but runs every other check identically.

**Why CI is the real gate:** the npm publish step runs in CI on tag push. A developer could push a tag directly to GitHub (`git push origin v0.2.4`) bypassing the local Makefile entirely. Without CI-side gates, every supply-chain check is advisory only.

**Hardening also added to workflow:** concurrency `cancel-in-progress: true`, `permissions: contents: read` default, `timeout-minutes` per job.

**Tech Stack:** Bash, `npm` (audit, ci, pack, audit signatures), `npx lockfile-lint` (one-shot, no dep added), existing `tsup` build + `vitest` test.

---

## Design Decisions

- **No new runtime/dev deps.** Every tool is invoked through `npx --yes` (lockfile-lint) or already present (`npm`). Adding deps to a supply-chain audit script would itself be a supply-chain risk.
- **Block `release-push`, not `release`.** `make release` only creates a local tag — recoverable. `make release-push` pushes the tag and triggers `prepublishOnly` if the dev later runs `npm publish`. The audit gates the public-facing step.
- **Fail-closed on `npm audit`.** `--audit-level=high` exits non-zero on high/critical CVEs. Moderate is informational. Devs can override with `SKIP_AUDIT_LEVEL=1` in emergencies, logged.
- **`npm audit signatures` catches tampered tarballs** — npm registry signs every published tarball with a Sigstore key; mismatch = tampered or removed package. Available since npm 9.5.
- **`lockfile-lint` catches tarball URL injection** — a classic supply-chain attack rewrites a transitive dep's `resolved` URL to a malicious mirror. Pinning to `registry.npmjs.org` over HTTPS blocks it.
- **`npm pack --dry-run` catches accidental file inclusion** — confirms only `dist/**/*.js` ships (per `files` in `package.json`), nothing like `.env`, `auth.json`, or `scripts/`.
- **`npm ci` not `npm install`** — refuses to mutate lockfile, fails on drift between `package.json` and `package-lock.json`.
- **Why no `socket` CLI by default:** requires API key for full malware DB; left as optional opt-in step at end.

---

## Task 1: Create `scripts/pre-release.sh`

**Files:**
- Create: `scripts/pre-release.sh`

**Step 1: Write the script**

```bash
#!/usr/bin/env bash
#
# Pre-release supply-chain audit.
# Runs before `make release-push` to block tampered/vulnerable deps from
# reaching npm. All checks are read-only except `npm ci` which reinstalls
# from the lockfile in-place.
#
# Override (use sparingly, logs the override):
#   SKIP_AUDIT_LEVEL=1   # accept high/critical npm audit findings
#   SKIP_SOCKET=1        # skip optional socket scan (default: skipped)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

step() { printf "${CYAN}[%s/%s] %s${NC}\n" "$1" "$TOTAL" "$2"; }
ok()   { printf "${GREEN}    ok${NC}\n\n"; }
warn() { printf "${YELLOW}    warn: %s${NC}\n\n" "$1"; }
die()  { printf "${RED}    fail: %s${NC}\n" "$1" >&2; exit 1; }

TOTAL=8

printf "${CYAN}=== Pre-release supply-chain audit ===${NC}\n\n"

# 1. Clean working tree — releases must reflect committed state.
#    Skipped in CI: GitHub Actions checkouts are always clean by construction.
step 1 "git working tree clean"
if [[ "${CI:-}" == "true" ]]; then
  printf "    skipped (CI=true)\n\n"
else
  if ! git diff --quiet || ! git diff --cached --quiet; then
    die "uncommitted changes present; commit or stash first"
  fi
  ok
fi

# 2. Clean install from lockfile — detects package.json / lockfile drift.
step 2 "npm ci (lockfile integrity)"
npm ci --no-audit --no-fund >/dev/null
ok

# 3. Build — typecheck + bundle. Catches type errors before publish.
step 3 "npm run build"
npm run build >/dev/null
ok

# 4. Tests.
step 4 "npm test"
npm test --silent
ok

# 5. Known-vulnerability scan. Fails on high/critical unless overridden.
step 5 "npm audit (high+)"
if [[ "${SKIP_AUDIT_LEVEL:-0}" == "1" ]]; then
  npm audit || true
  warn "SKIP_AUDIT_LEVEL=1 — high/critical findings ignored by operator"
else
  npm audit --audit-level=high || die "high/critical vulnerabilities found"
  ok
fi

# 6. Registry signature verification — catches tampered tarballs.
# Available in npm >= 9.5. Verifies every installed package was signed by
# the npm registry's Sigstore key.
step 6 "npm audit signatures"
npm audit signatures || die "package signature mismatch — possible tampering"
ok

# 7. Lockfile lint — pin all `resolved` URLs to https://registry.npmjs.org.
# Blocks the classic attack of swapping a transitive dep's tarball URL.
step 7 "lockfile-lint (HTTPS + npm registry only)"
npx --yes lockfile-lint \
  --path package-lock.json \
  --type npm \
  --validate-https \
  --allowed-hosts npm \
  --allowed-schemes "https:" \
  --empty-hostname false
ok

# 8. Publish preview — confirm only intended files ship.
step 8 "npm pack --dry-run (publish manifest preview)"
PACK_OUT="$(npm pack --dry-run --json)"
echo "$PACK_OUT" | node -e '
  const data = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const pkg = data[0];
  const bad = pkg.files.filter(f =>
    /(^|\/)(\.env|auth\.json|\.git|node_modules|src|scripts|tests?|__tests__)(\/|$)/i.test(f.path)
  );
  console.log(`  package: ${pkg.name}@${pkg.version}`);
  console.log(`  files:   ${pkg.files.length}`);
  console.log(`  size:    ${(pkg.size / 1024).toFixed(1)} KB`);
  if (bad.length) {
    console.error("  unexpected files in publish:");
    bad.forEach(f => console.error(`    - ${f.path}`));
    process.exit(1);
  }
'
ok

# Optional: Socket supply-chain scan. Opt-in (needs SOCKET_SECURITY_API_KEY).
if [[ "${SKIP_SOCKET:-1}" != "1" ]]; then
  printf "${CYAN}[opt] socket scan${NC}\n"
  npx --yes @socketsecurity/cli scan create . || warn "socket scan failed (non-blocking)"
fi

printf "${GREEN}=== All checks passed — safe to release-push ===${NC}\n"
```

**Step 2: Make executable**

```bash
chmod +x scripts/pre-release.sh
```

**Step 3: Smoke-test the script locally**

Run: `./scripts/pre-release.sh`

Expected: all 8 steps print `ok`, ending with `=== All checks passed ===`. If `npm audit` reports high/critical, the script exits non-zero before reaching step 6 — that's the gate working.

**Step 4: Commit**

```bash
git add scripts/pre-release.sh
git commit -m "feat(release): add pre-release supply-chain audit script"
```

---

## Task 2: Wire `pre-release` into the Makefile

**Files:**
- Modify: `Makefile`

**Step 1: Add `pre-release` target and gate `release-push` on it**

Find the existing `release-push` block:

```makefile
.PHONY: release-push
release-push:
	@git rev-parse -q --verify "refs/tags/v$(CURRENT)" >/dev/null \
	  || { echo "no local tag v$(CURRENT); run 'make release' first"; exit 1; }
	git push origin main
	git push origin "v$(CURRENT)"
```

Replace with:

```makefile
.PHONY: pre-release
pre-release:
	@./scripts/pre-release.sh

.PHONY: release-push
release-push: pre-release
	@git rev-parse -q --verify "refs/tags/v$(CURRENT)" >/dev/null \
	  || { echo "no local tag v$(CURRENT); run 'make release' first"; exit 1; }
	git push origin main
	git push origin "v$(CURRENT)"
```

Also extend the `help` block — append after the `release-push` line:

```makefile
	@printf '  make pre-release    Supply-chain audit (deps, signatures, lockfile)\n'
```

**Step 2: Verify the wiring**

Run: `make help`

Expected: output lists `make pre-release` and the `release-push` target description still appears.

Run: `make pre-release`

Expected: invokes `scripts/pre-release.sh`, all 8 steps pass.

**Step 3: Verify the gate**

Dry-run that `release-push` triggers `pre-release` first:

Run: `make -n release-push`

Expected: output begins with `./scripts/pre-release.sh` before the `git push` commands.

**Step 4: Commit**

```bash
git add Makefile
git commit -m "feat(release): gate release-push on pre-release audit"
```

---

## Task 3: Harden CI with full supply-chain gate

**Files:**
- Modify: `.github/workflows/publish.yml`

**Current state (lines 1–53):** two jobs — `test` (push/PR/tag) and `publish` (tags only, `needs: test`). No secret scan, no vuln scan, no concurrency control, no timeouts, no permissions scoping. A pushed tag reaches `npm publish` with no supply-chain checks.

**Approach mirrors `hanclym_ai/.github/workflows/ci.yml`:** strict job dependency chain `secret-scan → audit → test → publish`, each gate blocks the next. Adds the hardening primitives missing today (concurrency cancel, timeouts, minimal permissions).

**Step 1: Rewrite `publish.yml` with the full chain**

Replace the file with:

```yaml
name: Build & Publish

on:
  push:
    branches: [main]
    tags:
      - 'v*'
  pull_request:
    branches: [main]

# Default to read-only. Each job escalates only what it needs.
permissions:
  contents: read

# Kill superseded runs on the same ref.
concurrency:
  group: publish-${{ github.ref }}
  cancel-in-progress: true

jobs:
  secret-scan:
    name: Secret scan (gitleaks)
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: read
      pull-requests: read
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - name: Install gitleaks
        env:
          GITLEAKS_VERSION: 8.30.1
        run: |
          curl -sSL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
            | tar -xz gitleaks
          sudo install -m 0755 gitleaks /usr/local/bin/gitleaks
          gitleaks version

      - name: Run gitleaks (incremental)
        env:
          EVENT_NAME: ${{ github.event_name }}
          PUSH_BEFORE: ${{ github.event.before }}
          PUSH_SHA: ${{ github.sha }}
          PR_BASE_SHA: ${{ github.event.pull_request.base.sha }}
          PR_HEAD_SHA: ${{ github.event.pull_request.head.sha }}
        run: |
          ZERO_SHA="0000000000000000000000000000000000000000"
          if [ "$EVENT_NAME" = "pull_request" ]; then
            LOG_OPTS="${PR_BASE_SHA}..${PR_HEAD_SHA}"
          elif [ -n "$PUSH_BEFORE" ] && [ "$PUSH_BEFORE" != "$ZERO_SHA" ]; then
            LOG_OPTS="${PUSH_BEFORE}..${PUSH_SHA}"
          else
            LOG_OPTS="-1 HEAD"
          fi
          echo "Scanning range: $LOG_OPTS"
          gitleaks detect --source=. --no-banner --redact --verbose --exit-code 1 --log-opts="$LOG_OPTS"

  osv-scan:
    name: Dependency audit (osv-scanner)
    runs-on: ubuntu-latest
    needs: [secret-scan]
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v6
      - uses: google/osv-scanner-action/osv-scanner-action@v2.2.4
        with:
          scan-args: |-
            --lockfile=package-lock.json

  audit:
    name: Supply-chain audit (npm)
    runs-on: ubuntu-latest
    needs: [osv-scan]
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          # npm >= 9.5 for `npm audit signatures`. Node 22 ships npm 10.
          node-version: '22'
      - run: ./scripts/pre-release.sh
        env:
          CI: 'true'

  test:
    name: Run Tests
    runs-on: ubuntu-latest
    needs: [audit]
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: '22'
      - run: npm ci
      - run: npm run build
      - run: npm test

  publish:
    name: Publish to NPM
    needs: [test]
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      id-token: write
      contents: write
    steps:
      - uses: actions/checkout@v6
      # Do NOT pass registry-url: setup-node would write an
      # .npmrc with _authToken=${NODE_AUTH_TOKEN}, and a stale
      # NPM_TOKEN secret would sabotage OIDC. publishConfig.registry
      # in package.json already points to registry.npmjs.org.
      # Node 24 ships with npm >= 11.5.1 which supports
      # OIDC Trusted Publishers (node 22.x bundles npm 10.x).
      - uses: actions/setup-node@v6
        with:
          node-version: '24'
      - run: npm ci
      - run: npm run build
      - run: npm publish --access public
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ github.ref_name }}
          name: Release ${{ github.ref_name }}
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Hardening summary vs. current file:**

| Control | Before | After |
|---|---|---|
| Concurrency cancel | none | `cancel-in-progress: true` |
| Default permissions | implicit (broad) | `contents: read` |
| Per-job timeouts | none | `5–10 min` each |
| Secret scanning | none | gitleaks incremental |
| OSV vuln scan | none | osv-scanner (broader DB than `npm audit`) |
| npm supply-chain | none | `pre-release.sh` (signatures + lockfile-lint + pack) |
| Job chain | `test → publish` | `secret-scan → osv-scan → audit → test → publish` |

**Step 2: Validate workflow syntax**

If `actionlint` available:

```bash
actionlint .github/workflows/publish.yml
```

Otherwise:

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/publish.yml'))"
```

Expected: no errors.

**Step 3: Commit**

```bash
git add .github/workflows/publish.yml
git commit -m "ci: harden publish workflow with secret-scan, osv, supply-chain audit chain"
```

**Step 4: Validate on a real PR**

Open a PR with these changes. In the Actions tab, confirm:
- `secret-scan` runs first, completes in <2 min on a normal diff
- `osv-scan` runs after secret-scan passes
- `audit` runs `./scripts/pre-release.sh` with step 1 reporting `skipped (CI=true)`
- `test` runs after all three security gates pass
- `publish` does NOT start (no tag on PR branch — correct)
- Any failure in `secret-scan` / `osv-scan` / `audit` blocks merge via required status checks (configure in branch protection separately if not already set)

## Task 4: Document the new step

**Files:**
- Modify: `CONTRIBUTING.md` (add Release section if absent)
- Modify: `CLAUDE.md` (Commands block)

**Step 1: Add release section to `CONTRIBUTING.md`**

Append before the end of the file:

```markdown
## Releasing

Releases are cut from `main`. The flow:

```bash
make release        # bumps version, updates CHANGELOG, commits, tags (local only)
make pre-release    # optional: run audit early to catch issues before tagging
make release-push   # runs pre-release audit, then pushes commit + tag to origin
```

`make release-push` will refuse to push if any of the following fail:

1. Uncommitted changes in the working tree
2. `npm ci` — lockfile / `package.json` drift
3. `npm run build` — type or build errors
4. `npm test`
5. `npm audit --audit-level=high` — known high/critical CVEs in deps
6. `npm audit signatures` — tampered or unsigned packages in `node_modules`
7. `lockfile-lint` — any transitive dep resolves to a non-npm registry or non-HTTPS URL
8. `npm pack --dry-run` — unexpected files (e.g. `src/`, `scripts/`, `.env`) in the publish manifest

Emergency override (logs the bypass):

```bash
SKIP_AUDIT_LEVEL=1 make release-push   # accept current vuln findings
```

Optional supply-chain deep scan via Socket (requires `SOCKET_SECURITY_API_KEY`):

```bash
SKIP_SOCKET=0 make pre-release
```
```

**Step 2: Update `CLAUDE.md` Commands block**

In the existing `## Commands` section, add a third code block:

```markdown
```bash
# Release flow
make release        # local bump + tag
make release-push   # supply-chain audit then push (publishes via CI on tag)
make pre-release    # standalone audit
```
```

**Step 3: Commit**

```bash
git add CONTRIBUTING.md CLAUDE.md
git commit -m "docs(release): document pre-release audit and release flow"
```

---

## Task 5: Verify end-to-end on a no-op bump

**Step 1: Dry-run the version pipeline**

Run: `make version`

Expected: prints `current: 0.2.3` and a computed `next:`.

**Step 2: Run the audit in isolation**

Run: `make pre-release`

Expected: all 8 steps print `ok`, exit 0. If step 5 (`npm audit`) fails with current deps, that's a real finding — fix or document the override before merging this plan's branch.

**Step 3: Confirm gate fires on `release-push`**

Run: `make -n release-push`

Expected: first line of output is `./scripts/pre-release.sh`.

**Step 4 (optional, only if a release is actually being cut):**

```bash
make release
make release-push
```

---

## Rollback

If the audit script blocks a legitimate release:

1. Read the failing step's output — every failure points at the offending dep or file.
2. For `npm audit`: run `npm audit fix` or pin the transitive dep via `overrides` in `package.json`.
3. For `npm audit signatures`: re-run `npm ci` to reinstall; if still failing, the upstream package may have been unpublished — investigate before bypassing.
4. For `lockfile-lint`: inspect the offending `resolved` URL in `package-lock.json`; reinstall from a trusted environment.
5. For `npm pack`: adjust `files` in `package.json` or the offending path.
6. Last resort: `SKIP_AUDIT_LEVEL=1 make release-push` — only after reading findings.

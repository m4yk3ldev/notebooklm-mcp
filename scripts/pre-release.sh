#!/usr/bin/env bash
#
# Pre-release supply-chain audit.
# Runs before `make release-push` to block tampered/vulnerable deps from
# reaching npm. All checks are read-only except `pnpm install --frozen-lockfile`
# which reinstalls from the lockfile in-place.
#
# Override (use sparingly, logs the override):
#   SKIP_AUDIT_LEVEL=1   # accept high/critical pnpm audit findings
#   SKIP_SOCKET=1        # skip optional socket scan (default: skipped)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -t 1 ]]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  YELLOW='\033[1;33m'
  CYAN='\033[0;36m'
  NC='\033[0m'
else
  GREEN='' RED='' YELLOW='' CYAN='' NC=''
fi

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

# 2. Frozen install from lockfile — detects package.json / lockfile drift
#    and verifies SHA-512 integrity of every tarball against the lockfile.
step 2 "pnpm install --frozen-lockfile (lockfile integrity)"
pnpm install --frozen-lockfile --prefer-offline >/dev/null
ok

# 3. Build — typecheck + bundle. Catches type errors before publish.
step 3 "pnpm build"
pnpm run build >/dev/null
ok

# 4. Tests.
step 4 "pnpm test"
pnpm test --silent
ok

# 5. Known-vulnerability scan. Fails on high/critical unless overridden.
step 5 "pnpm audit (high+)"
if [[ "${SKIP_AUDIT_LEVEL:-0}" == "1" ]]; then
  pnpm audit || true
  warn "SKIP_AUDIT_LEVEL=1 — high/critical findings ignored by operator"
else
  pnpm audit --audit-level=high || die "high/critical vulnerabilities found"
  ok
fi

# 6. Registry signature verification — catches tampered tarballs.
# pnpm has no native equivalent, but `npm audit signatures` reads installed
# node_modules and queries the npm registry's Sigstore key, independent of
# the install tool. Requires npm >= 9.5 on PATH.
step 6 "npm audit signatures"
npm audit signatures || die "package signature mismatch — possible tampering"
ok

# 7. Lockfile registry pinning — block transitive tarball-URL injection.
# pnpm-lock.yaml omits `tarball:` when the resolved URL matches the default
# registry; any explicit tarball line is an off-registry pull and must be
# whitelisted (registry.npmjs.org) or rejected.
step 7 "pnpm-lock.yaml registry pinning"
BAD_TARBALL=$(grep -nE '^\s*tarball:' pnpm-lock.yaml | grep -vE 'registry\.npmjs\.org' || true)
BAD_GIT=$(grep -nE '^\s*resolution:.*(git\+|github:)' pnpm-lock.yaml || true)
if [[ -n "$BAD_TARBALL" || -n "$BAD_GIT" ]]; then
  [[ -n "$BAD_TARBALL" ]] && { echo "off-registry tarball URLs:"; echo "$BAD_TARBALL"; }
  [[ -n "$BAD_GIT" ]] && { echo "git/github resolutions:"; echo "$BAD_GIT"; }
  die "lockfile contains off-registry or git-based resolutions"
fi
ok

# 8. Publish preview — confirm only intended files ship.
# `npm pack --dry-run` reads package.json#files regardless of install tool.
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

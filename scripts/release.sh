#!/usr/bin/env bash
#
# Release helper driven by the Makefile.
#
#   next-version <current>        Next semver using 1-9 per-position rollover.
#   changelog <current> <next>    Keep-a-Changelog section for <next>.
#   release <current> <next>      Bump package.json, update CHANGELOG, commit, tag.

set -euo pipefail

die() { printf 'release.sh: %s\n' "$*" >&2; exit 1; }

next_version() {
  local current="${1:?current version required}"
  local re='^([0-9]+)\.([0-9]+)\.([0-9]+)$'
  [[ "$current" =~ $re ]] || die "not a semver: $current"
  local major="${BASH_REMATCH[1]}"
  local minor="${BASH_REMATCH[2]}"
  local patch="${BASH_REMATCH[3]}"
  patch=$(( patch + 1 ))
  if (( patch == 10 )); then
    patch=0
    minor=$(( minor + 1 ))
  fi
  if (( minor == 10 )); then
    minor=0
    major=$(( major + 1 ))
  fi
  printf '%d.%d.%d\n' "$major" "$minor" "$patch"
}

# Conventional-commit type -> Keep-a-Changelog heading.
prefix_heading() {
  case "$1" in
    feat)     echo "Added" ;;
    fix)      echo "Fixed" ;;
    refactor) echo "Changed" ;;
    perf)     echo "Performance" ;;
    docs)     echo "Documentation" ;;
    *)        echo "Chores" ;;
  esac
}

# "feat(scope)!: msg" -> "feat"
subject_type() {
  local subj="$1"
  local re='^([a-zA-Z]+)(\([^)]+\))?!?:'
  if [[ "$subj" =~ $re ]]; then
    echo "${BASH_REMATCH[1],,}"
  else
    echo "other"
  fi
}

# "feat(scope)!: msg" -> "msg"
subject_body() {
  sed -E 's/^[a-zA-Z]+(\([^)]+\))?!?: //' <<< "$1"
}

generate_changelog() {
  local current="${1:?current}"
  local next="${2:?next}"
  local range="HEAD"
  if git rev-parse -q --verify "refs/tags/v${current}" >/dev/null; then
    range="v${current}..HEAD"
  fi

  declare -A buckets
  local subj t heading
  while IFS= read -r subj; do
    [[ -z "$subj" ]] && continue
    t=$(subject_type "$subj")
    heading=$(prefix_heading "$t")
    buckets["$heading"]+="- $(subject_body "$subj")"$'\n'
  done < <(git log --format='%s' --no-merges "$range")

  echo "## [${next}] - $(date +%F)"
  echo

  local order=(Added Fixed Changed Performance Documentation Chores)
  local h
  for h in "${order[@]}"; do
    if [[ -n "${buckets[$h]:-}" ]]; then
      echo "### ${h}"
      printf '%s' "${buckets[$h]}"
      echo
    fi
  done
}

do_release() {
  local current="${1:?current}"
  local next="${2:?next}"

  # Refuse if files we touch already have pending changes.
  if ! git diff --quiet -- package.json CHANGELOG.md package-lock.json 2>/dev/null \
     || ! git diff --cached --quiet -- package.json CHANGELOG.md package-lock.json 2>/dev/null; then
    die "package.json / CHANGELOG.md / package-lock.json has uncommitted changes"
  fi

  if git rev-parse -q --verify "refs/tags/v${next}" >/dev/null; then
    die "tag v${next} already exists"
  fi

  # npm version updates both package.json and package-lock.json.
  # --no-git-tag-version: we commit and tag ourselves below.
  npm version "${next}" --no-git-tag-version --allow-same-version=false >/dev/null

  local section tmp
  section=$(mktemp)
  tmp=$(mktemp)
  trap 'rm -f "${section:-}" "${tmp:-}"' EXIT
  generate_changelog "$current" "$next" > "$section"

  awk -v sf="$section" '
    BEGIN { injected = 0 }
    !injected && /^## \[/ {
      while ((getline line < sf) > 0) print line
      close(sf)
      injected = 1
    }
    { print }
    END {
      if (!injected) {
        while ((getline line < sf) > 0) print line
        close(sf)
      }
    }
  ' CHANGELOG.md > "$tmp"
  mv "$tmp" CHANGELOG.md

  git add package.json CHANGELOG.md
  [[ -f package-lock.json ]] && git add package-lock.json

  git commit -m "chore(release): v${next}"
  git tag -a "v${next}" -m "v${next}"

  printf '\nCreated commit and tag v%s.\n' "${next}"
  printf 'Review with: git show v%s\n' "${next}"
  printf 'Publish via: make release-push  (or: git push origin main --tags)\n'
}

cmd="${1:-}"
[[ -z "$cmd" ]] && die 'usage: release.sh {next-version|changelog|release} ...'
shift

case "$cmd" in
  next-version) next_version "$@" ;;
  changelog)    generate_changelog "$@" ;;
  release)      do_release "$@" ;;
  *)            die "unknown subcommand: $cmd" ;;
esac

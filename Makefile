# notebooklm-mcp release automation.
#
# Usage:
#   make version         Show current version and computed next version.
#   make changelog       Preview the generated CHANGELOG section.
#   make release         Bump version, update CHANGELOG, commit, tag (no push).
#   make release-push    make release, then push commit and tag to origin.
#
# Override the computed version explicitly:
#   make release VERSION=0.2.0

SHELL       := bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

PKG       := package.json
CHANGELOG := CHANGELOG.md
RELEASE   := scripts/release.sh

CURRENT := $(shell node -p "require('./$(PKG)').version")
ifdef VERSION
NEXT := $(VERSION)
else
NEXT := $(shell $(RELEASE) next-version "$(CURRENT)")
endif

.PHONY: help
help:
	@printf 'notebooklm-mcp  %s → %s\n\n' "$(CURRENT)" "$(NEXT)"
	@printf 'Targets:\n'
	@printf '  make version        Show current and computed next version\n'
	@printf '  make changelog      Preview the generated CHANGELOG section\n'
	@printf '  make release        Bump version, update CHANGELOG, commit, tag\n'
	@printf '  make release-push   Same as release, then push commit and tag\n'
	@printf '\nOverride:\n'
	@printf '  make release VERSION=0.2.0\n'

.PHONY: version
version:
	@printf 'current: %s\n' "$(CURRENT)"
	@printf 'next:    %s\n' "$(NEXT)"

.PHONY: changelog
changelog:
	@$(RELEASE) changelog "$(CURRENT)" "$(NEXT)"

.PHONY: release
release:
	@$(RELEASE) release "$(CURRENT)" "$(NEXT)"

.PHONY: release-push
release-push: release
	git push origin main
	git push origin "v$(NEXT)"

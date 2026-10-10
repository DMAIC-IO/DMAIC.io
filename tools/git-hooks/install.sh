#!/usr/bin/env bash
# install.sh — enable the versioned hooks in this clone.
#
# Points core.hooksPath at tools/git-hooks instead of copying files into
# .git/hooks/: a copy lives outside version control and silently goes stale.
# core.hooksPath is local git config and cannot be shipped — running this
# script is the one manual step per clone.
#
#   bash tools/git-hooks/install.sh          # enable
#   git config --unset core.hooksPath        # undo

set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

[ -x tools/git-hooks/pre-push ] \
  || { echo "❌ tools/git-hooks/pre-push is missing or not executable." >&2; exit 1; }

git config core.hooksPath tools/git-hooks

# Verify what git actually uses now instead of assuming it.
actual="$(git config --get core.hooksPath || true)"
[ "$actual" = "tools/git-hooks" ] \
  || { echo "❌ core.hooksPath is '${actual:-<unset>}', expected 'tools/git-hooks'." >&2; exit 1; }

echo "✓ core.hooksPath = tools/git-hooks — pre-push is active."
echo "  Bypass in an emergency: git push --no-verify"

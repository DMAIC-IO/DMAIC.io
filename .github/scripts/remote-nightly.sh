#!/usr/bin/env bash
#
# Remote nightly script — runs on the nightly server, invoked by
# .github/workflows/nightly.yml.  Required env (passed by the workflow):
#
#   NIGHTLY_ROOT   vhost docroot, e.g. /var/www/nightly.dmaic.io
#
# Effects on the server:
#   - moves $NIGHTLY_ROOT.staging/ into $NIGHTLY_ROOT/, replacing previous content
#
# The swap is *almost* atomic: there is a brief window (sub-100ms typically)
# during which $NIGHTLY_ROOT does not exist as a directory. For nightly with
# a small audience this is acceptable.  If true atomicity is needed later,
# switch the docroot to a symlink that points at /releases/<id>/ and swap the
# symlink instead.

set -euo pipefail

: "${NIGHTLY_ROOT:?required}"

STAGING="${NIGHTLY_ROOT}.staging"

if [ ! -d "$STAGING" ]; then
  echo "Staging dir $STAGING does not exist" >&2
  exit 1
fi

PARENT=$(dirname "$NIGHTLY_ROOT")
BASENAME=$(basename "$NIGHTLY_ROOT")
BACKUP="$PARENT/.${BASENAME}.previous"

# Move current → backup, staging → current, then drop backup.
# Each `mv -Tf` is a single rename(2), so the only window is between the two
# moves, which is microseconds on a local filesystem.
if [ -d "$NIGHTLY_ROOT" ]; then
  rm -rf "$BACKUP"
  mv -Tf "$NIGHTLY_ROOT" "$BACKUP"
fi
mv -Tf "$STAGING" "$NIGHTLY_ROOT"
rm -rf "$BACKUP"

echo "Nightly deployed to $NIGHTLY_ROOT"

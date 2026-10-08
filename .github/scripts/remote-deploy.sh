#!/usr/bin/env bash
#
# Remote deploy script — runs on the production server, invoked by
# .github/workflows/release-app.yml.  Required env (passed by the workflow):
#
#   DEPLOY_ROOT   vhost docroot, e.g. /var/www/dmaic.io
#   TAG           full SemVer tag, e.g. v0.4.0
#   MAJOR_MINOR   tag stripped of the patch component, e.g. v0.4
#
# Effects on the server:
#   - moves $DEPLOY_ROOT/app/.staging/$TAG into $DEPLOY_ROOT/app/$TAG (atomic)
#   - updates $DEPLOY_ROOT/app/$MAJOR_MINOR symlink → highest patch in that minor
#   - updates $DEPLOY_ROOT/app/latest symlink     → highest stable tag overall
#
# versions.json gehört NICHT hierher: das erledigt das eigenständige
# gen-versions-json.sh, das der Workflow direkt danach aufruft. Getrennt,
# damit es ohne Staging-Verzeichnis und ohne Release erneut laufen kann.

set -euo pipefail

: "${DEPLOY_ROOT:?required}"
: "${TAG:?required}"
: "${MAJOR_MINOR:?required}"

APP_DIR="$DEPLOY_ROOT/app"
STAGING="$APP_DIR/.staging/$TAG"
TARGET="$APP_DIR/$TAG"

if [ ! -d "$STAGING" ]; then
  echo "Staging dir $STAGING does not exist" >&2
  exit 1
fi

# 1) Atomic swap of the tag directory.
#    Re-runs of the same tag overwrite cleanly; other tags are not touched.
rm -rf "$TARGET"
mv "$STAGING" "$TARGET"
rmdir --ignore-fail-on-non-empty "$APP_DIR/.staging" 2>/dev/null || true

# 2) Update /app/<MAJOR.MINOR> symlink → highest patch within that minor line.
HIGHEST_PATCH=$(ls -1d "$APP_DIR"/${MAJOR_MINOR}.* 2>/dev/null \
  | xargs -n1 basename | sort -V | tail -n1 || true)
if [ -n "$HIGHEST_PATCH" ]; then
  ln -sfn "$HIGHEST_PATCH" "$APP_DIR/.${MAJOR_MINOR}.new"
  mv -Tf "$APP_DIR/.${MAJOR_MINOR}.new" "$APP_DIR/${MAJOR_MINOR}"
fi

# 3) Update /app/latest symlink → highest stable tag overall.
LATEST=$(ls -1d "$APP_DIR"/v*.*.* 2>/dev/null \
  | grep -E '/v[0-9]+\.[0-9]+\.[0-9]+$' \
  | xargs -n1 basename | sort -V | tail -n1 || true)
if [ -n "$LATEST" ]; then
  ln -sfn "$LATEST" "$APP_DIR/.latest.new"
  mv -Tf "$APP_DIR/.latest.new" "$APP_DIR/latest"
fi

echo "Deploy complete:"
echo "  /app/$TAG/        ← rsynced"
[ -n "$HIGHEST_PATCH" ] && echo "  /app/$MAJOR_MINOR  → $HIGHEST_PATCH"
[ -n "$LATEST" ]        && echo "  /app/latest       → $LATEST"

# Die beiden && -Tests oben sind die letzten Kommandos: ohne LATEST bzw.
# HIGHEST_PATCH wäre der Exit-Code 1, obwohl der Deploy gelaufen ist.
exit 0

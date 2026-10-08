#!/usr/bin/env bash
#
# Regeneriert $DEPLOY_ROOT/versions.json auf dem Produktionsserver, indem es
# die release.json jedes /app/v*.*.*/-Ordners aggregiert. Einzige Quelle der
# Wahrheit für die Versionsliste — das private Site-Repo liefert die Datei
# bewusst NICHT mit aus (siehe dort .github/workflows/deploy-site.yml).
#
# Wird von remote-deploy.sh als letzter Deploy-Schritt aufgerufen und kann
# davon unabhängig jederzeit erneut laufen — es braucht kein Staging und kein
# Release. Idempotent.
#
# Benötigtes env:
#   DEPLOY_ROOT   vhost docroot, z. B. /usr/home/gaucty/public_html/dmaic.io
#
# Von Hand über die eigene SSH-Verbindung:
#   ssh -p 222 <user>@<host> "DEPLOY_ROOT='<docroot>' bash -s" \
#     < .github/scripts/gen-versions-json.sh
#
# Ausgabeschema:
#   {
#     "current": "0.9.0",
#     "releases": [
#       {"version": "...", "date": "...", "title": "...", "url": "/app/v0.9.0/"},
#       ...
#     ]
#   }

set -euo pipefail

: "${DEPLOY_ROOT:?required}"

APP_DIR="$DEPLOY_ROOT/app"

# Alle stabilen Tag-Ordner in SemVer-Reihenfolge. Pre-Release-Suffixe und die
# Symlinks latest/vX.Y fallen durch das Muster.
list_tags() {
  ls -1d "$APP_DIR"/v*.*.* 2>/dev/null \
    | grep -E '/v[0-9]+\.[0-9]+\.[0-9]+$' \
    | sort -V || true
}

LATEST=$(list_tags | xargs -n1 basename 2>/dev/null | tail -n1 || true)
CURRENT="${LATEST#v}"

# Temp-Datei bewusst NEBEN dem Ziel, nicht in /tmp: nur im selben Dateisystem
# ist das abschließende mv ein atomares rename(). mktemp erzeugt den Modus
# 0600; ohne das chmod erbt versions.json diese Rechte und der Webserver-User
# kann sie nach dem Deploy nicht mehr lesen.
TMP=$(mktemp "$DEPLOY_ROOT/.versions.json.XXXXXX")
chmod 644 "$TMP"
trap 'rm -f "$TMP"' EXIT

if command -v jq >/dev/null 2>&1; then
  RELEASES_ARRAY=$(
    for d in $(list_tags); do
      bn=$(basename "$d")
      [ -f "$d/release.json" ] || continue
      jq --arg url "/app/$bn/" '. + {url: $url}' "$d/release.json"
    done | jq -s .
  )
  jq -n \
    --arg current "$CURRENT" \
    --argjson releases "$RELEASES_ARRAY" \
    '{current: $current, releases: $releases}' \
    > "$TMP"
else
  # Fallback ohne jq (grob; setzt wohlgeformte release.json voraus).
  {
    printf '{\n  "current": "%s",\n  "releases": [\n' "$CURRENT"
    first=1
    for d in $(list_tags); do
      bn=$(basename "$d")
      [ -f "$d/release.json" ] || continue
      [ $first -eq 0 ] && printf ',\n'
      first=0
      sed -e 's/^/    /' \
          -e "s|}\$|, \"url\": \"/app/$bn/\"}|" \
          "$d/release.json"
    done
    printf '\n  ]\n}\n'
  } > "$TMP"
fi

mv -f "$TMP" "$DEPLOY_ROOT/versions.json"
trap - EXIT

echo "  /versions.json    ← regenerated (current=${CURRENT:-none})"

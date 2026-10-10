#!/usr/bin/env bash
#
# Regeneriert $DEPLOY_ROOT/versions.json auf dem Produktionsserver, indem es
# die release.json jedes /app/v*.*.*/-Ordners aggregiert. Einzige Quelle der
# Wahrheit für die Versionsliste — das private Site-Repo liefert die Datei
# bewusst NICHT mit aus (siehe dort .github/workflows/deploy-site.yml).
#
# Wird von release-app.yml nach remote-deploy.sh als eigener Schritt
# aufgerufen und kann davon unabhängig jederzeit erneut laufen — es braucht
# kein Staging und kein Release. Idempotent.
#
# Benötigtes env:
#   DEPLOY_ROOT   vhost docroot, z. B. /usr/home/gaucty/public_html/dmaic.io
# Optionales env:
#   TITLES_B64    base64 von .github/release-titles.json (Version → { de, en }).
#                 Jeder Eintrag ersetzt den Titel der gleichnamigen Version —
#                 so bekommen auch längst ausgelieferte Releases zweisprachige
#                 Titel, ohne dass ihre Ordner angefasst werden.
#
# Von Hand über die eigene SSH-Verbindung:
#   ssh -p 222 <user>@<host> \
#     "DEPLOY_ROOT='<docroot>' TITLES_B64='$(base64 -w0 .github/release-titles.json)' bash -s" \
#     < .github/scripts/gen-versions-json.sh
#
# Ausgabeschema (Releases in SemVer-Reihenfolge):
#   {
#     "current": "0.9.0",
#     "releases": [
#       {"version": "0.2.0", "date": "...", "url": "/v0.2/", "title": {...}},
#       {"version": "...", "date": "...", "title": {"de": "...", "en": "..."},
#        "url": "/app/v0.9.0/"},
#       ...
#     ]
#   }
#
# Braucht jq. Fehlt es, bricht das Skript ab und die alte versions.json bleibt.

set -euo pipefail

: "${DEPLOY_ROOT:?required}"
command -v jq >/dev/null 2>&1 || { echo "gen-versions-json: jq fehlt" >&2; exit 1; }

APP_DIR="$DEPLOY_ROOT/app"

# Eingefrorene Versionen aus der Zeit vor /app/<tag>/ — sie liegen direkt im
# Docroot, haben keine release.json und ändern sich nie mehr. Format:
# version|datum|ordner. Gelistet wird nur, was auf dem Server noch liegt.
LEGACY_RELEASES="0.2.0|2026-05-02|v0.2 0.3.0|2026-05-02|v0.3"

# Alle stabilen Tag-Ordner in SemVer-Reihenfolge. Pre-Release-Suffixe und die
# Symlinks latest/vX.Y fallen durch das Muster.
list_tags() {
  ls -1d "$APP_DIR"/v*.*.* 2>/dev/null \
    | grep -E '/v[0-9]+\.[0-9]+\.[0-9]+$' \
    | sort -V || true
}

# Die Alt-Versionen zählen nicht für "current" — aktuell ist der höchste Tag.
LATEST=$(list_tags | xargs -n1 basename 2>/dev/null | tail -n1 || true)
CURRENT="${LATEST#v}"

if [ -n "${TITLES_B64:-}" ]; then
  TITLES=$(printf '%s' "$TITLES_B64" | base64 -d | jq -c .)
else
  TITLES='{}'
fi

# Temp-Datei bewusst NEBEN dem Ziel, nicht in /tmp: nur im selben Dateisystem
# ist das abschließende mv ein atomares rename(). mktemp erzeugt den Modus
# 0600; ohne das chmod erbt versions.json diese Rechte und der Webserver-User
# kann sie nach dem Deploy nicht mehr lesen.
TMP=$(mktemp "$DEPLOY_ROOT/.versions.json.XXXXXX")
chmod 644 "$TMP"
trap 'rm -f "$TMP"' EXIT

{
  for entry in $LEGACY_RELEASES; do
    IFS='|' read -r version date folder <<< "$entry"
    [ -d "$DEPLOY_ROOT/$folder" ] || continue
    jq -n --arg version "$version" --arg date "$date" --arg url "/$folder/" \
      '{version: $version, date: $date, url: $url}'
  done
  for d in $(list_tags); do
    bn=$(basename "$d")
    [ -f "$d/release.json" ] || continue
    jq --arg url "/app/$bn/" '. + {url: $url}' "$d/release.json"
  done
} | jq -s \
  --arg current "$CURRENT" \
  --argjson titles "$TITLES" \
  '{
     current: $current,
     releases: (map(if $titles[.version] then .title = $titles[.version] else . end)
                | sort_by(.version | split(".") | map(tonumber)))
   }' \
  > "$TMP"

mv -f "$TMP" "$DEPLOY_ROOT/versions.json"
trap - EXIT

echo "  /versions.json    ← regenerated (current=${CURRENT:-none})"

# Goldene Export-Fixtures

Reale (oder realistisch nachgebildete) Export-Dateien aus jedem veröffentlichten
D.Mike-Release. Sie dienen als Regressions-Schutz: jede Datei hier muss von
`migrateToLatest()` ohne Fehler auf die aktuelle Version gehoben werden können —
**und** das Ergebnis muss von den Modulen ohne `setState()`-Crash gelesen werden
können.

## Naming

```
v{MAJOR.MINOR.PATCH}_single_project.json   ← exportJSON()-Format
v{MAJOR.MINOR.PATCH}_all_projects.json     ← exportAllJSON()-Format
```

## Umfang

Die Fixtures sind bewusst **breit angelegt** und decken möglichst viele Module
mit nicht-trivialen Zuständen ab, damit jedes Modul beim Import realistisch
getestet wird (nicht nur Shape-Sanity, sondern auch echte `setState()`-Pfade
mit Worksheet-Referenzen, Analyseergebnissen usw.).

Aktueller Stand:

| Datei                           | Projekte | Modul-Instanzen |
|---------------------------------|----------|-----------------|
| v0.2.0_single_project.json      | 1        | 19              |
| v0.2.0_all_projects.json        | 2        | 18              |
| v0.3.0_single_project.json      | 1        | 34              |
| v0.3.0_all_projects.json        | 3        | 38              |
| v0.5.0_8d_project.json          | 1        | 19              |
| v0.9.0_single_project.json      | 1        | 11              |
| v1.0.0_single_project.json      | 1        | 11              |

Die v0.3-Fixtures decken zusammen **alle produktiven Module** aus
`js/modules/manifest.js` mindestens einmal ab. Wenn ein neues Modul hinzukommt,
**muss** es in mindestens eine der v0.3-Fixtures aufgenommen werden, damit der
Import-Pfad in der Regression mitläuft.

Die v0.5-Fixture demonstriert den neuen `eightd`-Zyklus mit Modulen über alle
D-Phasen — sie hält die Phasen-Struktur D0…D8 + `data`/`extras` für künftige
Regressionen fest.

Die v1.0-Fixture ist der inhaltsgleiche Nachzug der v0.9-Fixture auf das erste
stabile Release: zwischen 0.9 und 1.0 hat sich am Export-Format nichts geändert
(kein Migrationsschritt in `js/core/migrations.js`), die Fixture hält die
aktuelle MAJOR.MINOR-Linie für den Release-Gate-Test
`current VERSION fixture exists` fest.

## Pflicht beim Release

Jeder MINOR/MAJOR-Bump muss:

1. Mindestens eine neue Fixture für die alte Version hier ablegen (am besten
   einen echten Export aus dem App-State, der typische Module abdeckt).
2. Den Eintrag in `tests/core/migrations.test.js` → `KNOWN_FIXTURES` ergänzen.
3. Den passenden Migrationsschritt in `js/core/migrations.js` schreiben.

Die Tests in `migrations.test.js` laden alle Fixtures via `fetch()` und prüfen,
dass sie sauber bis zur aktuellen Version migrieren. Schlägt der Test fehl,
fehlt entweder ein Migrationsschritt oder dieser ist fehlerhaft.

## Konventionen für neue/erweiterte Fixtures

- **Stabile IDs**: `instanceId`-Werte sollen lesbar und stabil sein
  (`inst-charter`, `i-ws-1`, `v2-cpk` …) — nicht zufällige UUIDs. Das macht
  Diff-Reviews und Test-Assertions deutlich einfacher.
- **Konsistente Worksheet-Refs**: wenn ein Modul auf Worksheet-Spalten verweist
  (`{ instanceId, sheetId, columnId }`), müssen die referenzierten IDs in der
  Worksheet-Fixture tatsächlich existieren — sonst läuft `setState()` zwar
  durch, aber das Modul bricht beim ersten Render.
- **Realistische Inhalte (DE/EN gemischt erlaubt)**: damit Reviewer beim
  Lesen der JSONs schnell verstehen, was das fiktive Projekt tut.
- **Keine Binärdaten**: keine eingebetteten Bilder/PDF/etc. — diese würden
  die Fixtures unnötig aufblähen, ohne den Migrationspfad zu härten.
- **Pre-cycle Fixtures (v0.2)**: kein `cycle`-Feld in `projectMeta`, keine
  `data`/`extras`-Phase, keine `phaseAchievementHistory`. Die Migration ergänzt
  diese.

## Niemals löschen

Auch wenn eine Fixture trivial aussieht — sie ist der Beweis, dass alle
historischen Datenformate weiterhin lesbar bleiben. Erst wenn ein MAJOR-Bump
das Migrationsverbot rechtfertigt (z.B. v2 → v3 unterstützt v0.x nicht mehr),
darf eine Fixture mit dem entsprechenden Vermerk im CHANGELOG entfernt werden.

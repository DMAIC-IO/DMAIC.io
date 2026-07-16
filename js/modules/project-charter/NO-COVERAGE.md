# Nicht getestete Bereiche — modules/project-charter/

## Modul (`project-charter.js`)

Lines: 91.8% (642/699) | Functions: 93.9% (169/180) | Branches: 72.0% (295/410)

`--check` exit 0 (beide Schwellen ≥ 90 %).

### Legende

| Tag  | Bedeutung |
|------|-----------|
| IG   | Per Konvention ausgeschlossen (Lifecycle/Persistenz/Chart-Teardown) — würde künstliche Fault-Injection erfordern. |
| V8   | Closure/Arrow wird im Rahmen einer getesteten Verhaltenskette ausgeführt, von der V8-Instrumentierung (IHJ) aber nicht als „covered" erfasst. |
| PRE  | Bereits vor dieser Aufgabe unabgedeckt (Org-Chart-Drag/Editor-Helfer, Goal-Reorder-Drag, Paste-/Sanitize-Helfer) — von diesem Refactoring (rein additiv, `dashboardTile`-Descriptor) unberührt. |

### Dashboard-Descriptor jetzt abgedeckt

`findCharter(ctx)` (Z.95) und `dashboardTile.enumerate(ctx)` (Z.123) — früher als **FUT**
notiert — werden seit der Einführung des dünnen Dashboard-Hosts (`app/dev/js/pages/dashboard/`,
`enumerateTiles`) bei jedem Dashboard-E2E live aufgerufen und sind damit vollständig abgedeckt.
Die früheren FUT-Zeilen entfallen. Auch der `dashboardTile.render`-Pfad ist über die
Dashboard-E2E inkl. `dashboard-tile-charter.png` Visual-Baseline 1:1 verifiziert (beide
Empty-Branches `charterEmpty`/`charterNoProblem` + Problem-Statement-Branch + Org-Chart-SVG).

### Vorbestehende, von dieser Aufgabe unberührte Bereiche (PRE)

Die verbleibenden unabgedeckten Funktionen liegen in vorbestehenden Clustern, die **nicht**
Teil dieses Refactorings sind (der Diff ist rein additiv: `findCharter` + `dashboardTile`-Descriptor):

| Bereich | Tag | Begründung |
|---------|-----|------------|
| `sanitizeHtml(html)` (Z.57-58), `problemPaste(event)` (Z.227-234) | PRE/V8 | Bestehende Paste-/Sanitize-Helfer der Problem-Statement-Contenteditable. Feuern nur bei tatsächlichem Einfügen formatierten HTMLs; im headless-E2E nicht ausgelöst. |
| Goal-Reorder-Drag-Handler (`goalDragStart`/`goalDragEnd`/`goalDragOver`/`goalDragLeave`/`goalDrop`, Z.333-376, inkl. `querySelectorAll('.pc__goal-row').forEach` Z.345) | PRE/V8 | Bestehende HTML5-Drag-Closures, feuern nur bei tatsächlicher Drag-Interaktion. |
| Org-Chart-Drag/Layout-Helfer (`_orgHideDropIndicator`, Sibling-Reorder `forEach`/`some` Z.732-757, Insert-Gap-Berechnung Z.771-774, Descendant-Check Z.811-819) | PRE/V8/IG | Imperatives Org-Chart-Drag-/Layout-Geflecht, schon vor dieser Aufgabe unter Schwelle. |

**Fazit:**
Roh-Coverage **Lines 91.8 %** / **Functions 93.9 %** liegt über der 90 %-Schwelle (`--check` exit 0).
Die zuvor als FUT geführten Dashboard-Descriptor-Funktionen `findCharter` und
`dashboardTile.enumerate` sind durch den live aufgerufenen Dashboard-Host nun vollständig
abgedeckt. Die verbleibenden unabgedeckten Funktionen sind durchweg **vorbestehende**
PRE/V8-Cluster (Paste-/Sanitize-Helfer, Goal-Reorder-Drag, Org-Chart-Drag/Layout), die dieses
rein additive Refactoring nicht berührt. Es wurden keine künstlichen Tests geschrieben, um die
PRE-/V8-/IG-Zeilen zu jagen.

Abgedeckte Szenarien (`tests/modules/project-charter.spec.js` + `tests/global/dashboard.spec.js`): Goals/Charter-Felder, Org-Chart-Editor/Modebar/Zoom/Pan, Knoten anlegen/löschen/auswählen/ein-ausklappen, Layout, Undo, PNG-/SVG-Export, Sprachwechsel, Theme-Wechsel, Modulhilfe, State-Restore nach Reload, Visual-Baselines (Empty-State, example-charter-pizza-lieferzeit), Destruction, Dashboard-Charter-Kachel (Problem-Statement/No-Problem/Empty + Org-Chart-SVG + Visual-Baseline).

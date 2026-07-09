# Nicht getestete Bereiche — modules/ishikawa/

## Modul (`ishikawa.js`)

Lines: 86.1% (581/675) | Functions: 86.2% (212/246) | Branches: 69.9% (423/605)

### Legende

| Tag  | Bedeutung |
|------|-----------|
| IG   | Per Konvention ausgeschlossen (Lifecycle/Persistenz/Chart-Teardown) — würde künstliche Fault-Injection erfordern. |
| V8   | Closure/Arrow wird im Rahmen einer getesteten Verhaltenskette ausgeführt, von der V8-Instrumentierung (IHJ) aber nicht als „covered" erfasst. |
| NOUI | Kein UI-Trigger / keine Fixture vorhanden (Image-Upload headless, Color-Picker, Drag). |
| PRE  | Bereits vor dieser Aufgabe unabgedeckt (Pareto-Chart-Editor / Alpine-View-Helfer / Image-Upload) — von diesem Refactoring (rein additiv, `dashboardTile`-Descriptor) unberührt. |

### Dashboard-Descriptor jetzt abgedeckt

`enumerateIshikawa(ctx)` (Z.380) — früher als **FUT** notiert — wird seit der Einführung
des dünnen Dashboard-Hosts (`app/dev/js/pages/dashboard/`, `enumerateTiles`) bei jedem
Dashboard-E2E live aufgerufen und ist damit vollständig abgedeckt. Die frühere FUT-Zeile
entfällt. Auch der `dashboardTile.render`-Pfad ist über die Dashboard-E2E inkl.
`dashboard-tile-ishikawa.png` Visual-Baseline 1:1 verifiziert.

### Vorbestehende, von dieser Aufgabe unberührte Bereiche (PRE)

Die 34 unabgedeckten Funktionen liegen ausschließlich in vorbestehenden Clustern, die
**nicht** Teil dieses Refactorings sind (der Diff ist rein additiv: `dashboardTile`-Descriptor
+ `enumerateIshikawa`):

| Bereich | Tag | Begründung |
|---------|-----|------------|
| Pareto-Chart-Editor-Closures (Z.~1167-1378: `onEditorToggle`/`setTimeout`-Render, `_buildParetoEditor`, `cpOpen`-Color-Picker-Callbacks, `edRangeRow`/`edSelectRow`/`edCheckboxRow`-`rerender`-Closures, Trend-Chart-Lifecycle, `chartManager.destroy`-Teardown) — ~32 Funktionen | PRE/V8/IG/NOUI | Imperatives Chart-Editor-/Lifecycle-Geflecht, das schon vor dieser Aufgabe unter 90 % lag. Die Editor-Callbacks feuern nur bei tatsächlicher UI-Interaktion im Color-Picker/Range-Editor; die `chartManager.destroy`-Pfade laufen im Teardown, werden von der V8-Closure-Instrumentierung aber nicht als hit markiert. |
| Image-Upload-Helfer (`formatImgSize`-Branch Z.645, `uploadImages`-Compression-Fehlerpfad Z.659-660) | PRE/NOUI | Bild-Upload-/Kompressionspfade, im headless-E2E ohne echten File-Input/Kompressionsfehler nicht ausgelöst. |
| Alpine-View-Helfer `isCollapsed(id)` (Z.724), Drag-Cleanup `querySelectorAll('.ishikawa__drag-over')…remove` (Z.941) | PRE/V8 | Bestehende View-/Drag-Helfer, von dieser Aufgabe unberührt. |

**Fazit:**
Roh-Coverage **Lines 86.1 %** / **Functions 86.2 %** liegt unter der 90 %-Schwelle — dieser Wert
ist jedoch **vorbestehend** und wird von ~32 Pareto-Chart-Editor-Closures dominiert, die dieses
rein additive Refactoring nicht berührt (die Werte stiegen gegenüber der Vor-Messung sogar
leicht — 84.7 % → 86.1 % Lines —, weil `enumerateIshikawa` nun live abgedeckt ist). Die durch
dieses Refactoring eingeführten Descriptor-Bausteine (`enumerateIshikawa`, `dashboardTile.render`)
sind über die Dashboard-E2E inkl. `dashboard-tile-ishikawa.png` Visual-Baseline vollständig
verifiziert. Effektive Coverage des Refactoring-Diffs: **100 %** (alle neu hinzugefügten Zeilen
sind `hit`). Es wurden keine künstlichen Tests geschrieben, um die PRE-/V8-/NOUI-Zeilen zu jagen.

Abgedeckte Szenarien (`tests/modules/ishikawa.spec.js` + `tests/global/dashboard.spec.js`): Kategorien/Ursachen anlegen/editieren/löschen, Drag-Reorder, Scope-In/Out-Galerie, Pareto-Chart-Rendering, Sprachwechsel, Theme-Wechsel, Modulhilfe, State-Restore, Visual-Baselines, Destruction, Dashboard-Ishikawa-Kachel + Visual-Baseline.

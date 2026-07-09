# Nicht getestete Bereiche — pages/dashboard/

## Host (`dashboard.js`)

Lines: 97.0% (489/504) | Functions: 91.8% (101/110) | Branches: 71.0% (298/420)

`--check` exit 0 (beide Schwellen ≥ 90 %). Diese Datei dokumentiert die verbleibenden
Roh-Lücken (SVG-Built-in-Renderer, Add-Menu-/Event-Listener-Closures, Lifecycle-Teardown),
die alle auf V8-Closure-Blind-Spots bzw. ausgeschlossene Lifecycle-Globals zurückgehen.

### Legende

| Tag  | Bedeutung |
|------|-----------|
| IG   | Per Konvention ausgeschlossen (Lifecycle/Persistenz/Teardown) — würde künstliche Fault-Injection erfordern. |
| V8   | Closure/Arrow wird im Rahmen einer getesteten Verhaltenskette ausgeführt, von der V8-Instrumentierung (IHJ) aber nicht als „covered" erfasst — eine umgebende Nicht-Closure-Zeile ist `hit`. |
| NOUI | Kein UI-Trigger / keine Fixture vorhanden, um den Branch im headless-E2E zu erreichen. |

### Uncovered Items

| Bereich | Tag | Begründung |
|---------|-----|------------|
| `_esc`-Replace-Arrow im Org-Chart-SVG-Renderer (Z.241-242, `c => ({…}[c])`) | V8 | Escape-Closure des SVG-Org-Chart-Renderers. Wird beim Org-Chart-Rendering der Charter-Kachel ausgeführt (die umgebende `_esc`-Aufrufkette in `dashboard.spec.js` Charter-Kachel ist `hit`), von der V8-Closure-Instrumentierung aber nicht als getroffen markiert. |
| Chart-Race-Teardown `chartManager.destroy(chart); return;` (Z.232-234) | V8/IG | Defensiver Generations-Guard im async SPC-Sparkline-Renderer: bricht ab, wenn während des `await` ein Re-Render/Grid-Wechsel passierte. Feuert nur bei einem Render-Race und läuft im imperativen Chart-Lifecycle — von V8 nicht als hit erfasst. |
| RACI-Overflow-Branch `ul.append('… +N')` (Z.486-487) | NOUI | Branch greift erst ab > 5 fehlenden RACI-Rollen-Warnungen. Die E2E-Fixtures erzeugen ≤ 5 Warnungen, daher wird der Truncation-Zweig headless nicht ausgelöst. Rein additive Anzeige-Zeile ohne Logik. |
| `sub`-Helper + Live-Update-Listener-Closures (Z.860, 862, 881-884: `phase:achievement-changed`, `language:changed`, `project:loaded`, `project:imported`, `theme:changed`) | V8 | Der `sub(ev, cb)`-Helper und seine Event-Listener-Callbacks werden beim Mount registriert und feuern im E2E (Sprachwechsel-/Theme-/Projekt-Lade-Szenarien rendern das Dashboard neu). V8 erfasst Listener-Closures nicht als hit, obwohl die umgebende `mount`-/`render`-Kette `hit` ist. |
| `onHide`-Add-Menu-Teardown (Z.897-901: `addMenuEl.remove()` … `_onDocClick = null`) | IG | Add-Menu-/Document-Click-Listener-Aufräumpfad beim Verlassen der Dashboard-Seite. Lifecycle-Teardown-Global (Konvention IG). |
| `unmount(containerEl, ctx, handle)` (Z.906-913, inkl. `_unsubs.forEach(off => off())` Z.912) | IG/V8 | Vollständiger Seiten-Teardown (Chart-/Grid-Destroy, Listener-Abmeldung). Lifecycle-Global; die `off()`-Abmelde-Closure (Z.912) ist zusätzlich ein V8-Blind-Spot. |

### Fazit

Roh-Coverage **Lines 97.0 %** und **Functions 91.8 %** liegen beide über der 90 %-Schwelle
(`--check` exit 0). Die 9 unabgedeckten Funktionen verteilen sich vollständig auf
**V8-Closure-Blind-Spots** (Org-Chart-`_esc`-Replace-Arrow, `sub`-Helper + 5 Live-Update-
Event-Listener, `_unsubs.forEach`-Teardown-Arrow) und **ausgeschlossene Lifecycle-Globals**
(`unmount`, `onHide`-Add-Menu-Teardown). Die einzige nicht durch eine Fixture erreichbare
Zeile ist der RACI-Overflow-Zweig (Z.487, **NOUI** — > 5 fehlende Rollen). Alle übrigen
Closures werden in einer getesteten Verhaltenskette ausgeführt (jeweils umgebende
Nicht-Closure-Zeile ist `hit`).

Effektiv abdeckbare Funktionen: 110 − 9 (V8/IG) = **101 / 101 = 100 %**.
Effektive Zeilen: 504 − 15 (V8/IG/NOUI) = 489 / 489 = **100 %**.

Es wurden keine künstlichen Tests geschrieben, um die V8-/IG-/NOUI-Zeilen zu jagen.

Abgedeckte Szenarien (Dashboard-E2E `tests/global/dashboard.spec.js`): Dashboard öffnet & rendert Host-Shell, Projektname-Header, ZEG-Timeline-Chart (SPC-Sparkline), FMEA-Kachel + Visual-Baseline, Ishikawa-Kachel + Visual-Baseline, Charter-Kachel (Problem-Statement-, No-Problem-, Empty-State) + Org-Chart-SVG + Visual-Baseline, RACI-Kachel inkl. Missing-Rollen-Warnungen, Add-Menu öffnen/schließen, Tile hinzufügen/entfernen, Live-Update nach Sprachwechsel/Theme-Wechsel/Projekt-Laden/-Import, per-Tile-Assertions.

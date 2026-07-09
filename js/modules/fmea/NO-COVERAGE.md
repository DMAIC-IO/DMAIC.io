# Nicht getestete Bereiche — modules/fmea/

## Modul (`fmea.js`)

Lines: 98.7% (149/151) | Functions: 100% (53/53) | Branches: 84.3% (102/121)

`--check` exit 0 (beide Schwellen ≥ 90 %).

### Legende

| Tag  | Bedeutung |
|------|-----------|
| IG   | Per Konvention ausgeschlossen (Lifecycle/Persistenz/Chart-Teardown) — würde künstliche Fault-Injection erfordern. |
| V8   | Closure/Arrow wird im Rahmen einer getesteten Verhaltenskette ausgeführt, von der V8-Instrumentierung (IHJ) aber nicht als „covered" erfasst. |

### Uncovered Items

| Bereich | Tag | Begründung |
|---------|-----|------------|
| `chartManager.destroy(chart)` im Burndown-Teardown (Z.328-329) | V8/IG | Imperatives Chart-Lifecycle im `destroy()`/Popout-Close-Pfad. Der Aufruf läuft im E2E-Destruction-Test, wird von der V8-Closure-Instrumentierung aber nicht als hit markiert (bestehende, von dieser Aufgabe unberührte Zeile). |

**Fazit:**
Roh-Coverage **Lines 98.7 %** und **Functions 100 %** liegen beide über der 90 %-Schwelle (`--check` exit 0). Die `dashboardTile.enumerate`-Funktion `enumerateFmea` wird seit der Einführung des dünnen Dashboard-Hosts (`app/dev/js/pages/dashboard/`, `enumerateTiles`) bei jedem Dashboard-E2E live aufgerufen und ist damit vollständig abgedeckt — die frühere FUT-Notiz entfällt. Die einzige verbleibende unabgedeckte Stelle ist der `chartManager.destroy`-Burndown-Teardown (V8/IG). Effektiv abdeckbare Zeilen: 151 − 2 (V8/IG) = 149 / 149 = **100 %**. Es wurden keine künstlichen Tests geschrieben, um die V8-Zeilen zu jagen.

# Nicht getestete Bereiche — core/

## Modul (`kernel.js`)

Lines: 93.9% (46/49) | Functions: 83.3% (5/6) | Branches: 50.0% (5/10)

### Legende

| Tag  | Bedeutung |
|------|-----------|
| IG   | Per Konvention ausgeschlossen (Persistenz/Fehlerinjektion/Lifecycle) — würde künstliches Fault-Injection oder vorbefülltes-Seed-Umgehen erfordern. |
| V8   | Closure/Arrow wird im Rahmen einer getesteten Verhaltenskette ausgeführt bzw. registriert, von der V8-Instrumentierung (IHJ) aber nicht als „covered" erfasst. |
| DEAD | Über die UI nicht erreichbar — defensiver Guard, der praktisch nicht feuern kann (alle realen Pfade liefern gültige Werte). |
| NOUI | Kein UI-Trigger / headless nicht auslösbar (z. B. echter Fullscreen, `location.reload`, 4 s-Aktivierungs-Timeout). |

### Uncovered Items

| Bereich | Tag | Begründung |
|---------|-----|------------|
| `eventBus.on('settings:changed', …)`-Callback-Body (Z.73-76) | NOUI | Der Callback re-appliziert die Glossar-Inline-Konfiguration, wenn die Einstellung umgeschaltet wird. Die Registrierung selbst läuft bei jedem Boot (Z.73 als `on(...)`-Aufruf ist hit). Das Toggle-UI, das `settings:changed` feuert, existiert noch nicht (Kommentar: „UI for the toggle comes later"), daher betritt kein E2E-Test den Callback-Body. Die identische Logik auf dem `language:changed`-Pfad (Z.79-81) ist abgedeckt (E2E wechselt die Sprache). |

**Fazit:**
Roh-Coverage **Lines 93.9 %** liegt über der 90 %-Schwelle. **Functions 83.3 %** (5/6) unterschreitet die Schwelle ausschließlich wegen der einen `settings:changed`-Closure (Z.73), deren Body (Z.74-76) mangels Toggle-UI nicht ausgelöst werden kann; die umgebende Registrierung (Z.73) und alle übrigen Funktionen/Zeilen sind hit. Effektiv = 5 / (6 − 1) = **100 %** der sinnvoll abdeckbaren Funktionen bzw. 46 / (49 − 3) = **100 %** der sinnvoll abdeckbaren Zeilen. `bootKernel` wird bei jedem E2E-Page-Load vollständig durchlaufen; es bestehen keine echten testbaren Lücken. Sobald der Settings-Toggle für `glossary.inlineLinksEnabled` UI-seitig existiert, wird dieser Callback automatisch mit abgedeckt.

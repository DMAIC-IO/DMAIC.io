# Nicht getestete Bereiche — pages/algorithm-lab

## Modul (`algorithm-lab.js`)

Einzige nicht abgedeckte Stelle: der `unmount`-Hook (NOUI — kein UI-Trigger zerstört die Page).

### Legende

| Tag  | Bedeutung |
|------|-----------|
| IG   | Per Konvention ausgeschlossen (Persistenz/Fehlerinjektion/Lifecycle) — würde künstliches Fault-Injection oder vorbefülltes-Seed-Umgehen erfordern. |
| V8   | Closure/Arrow wird im Rahmen einer getesteten Verhaltenskette ausgeführt bzw. registriert, von der V8-Instrumentierung (IHJ) aber nicht als „covered" erfasst. |
| DEAD | Über die UI nicht erreichbar — defensiver Guard, der praktisch nicht feuern kann (alle realen Pfade liefern gültige Werte). |
| NOUI | Kein UI-Trigger / headless nicht auslösbar (z. B. echter Fullscreen, `location.reload`, Page-`destroy()` ohne UI-Auslöser). |

### Uncovered Items

| Bereich | Tag | Begründung |
|---------|-----|------------|
| `unmount(el, ctx, handle)` → `eventBus.off(...)` | NOUI | Der `unmount`-Hook wird ausschließlich aus `page.destroy()` in `create-page.js` heraus aufgerufen. Die Algorithm-Lab-Page wird im normalen App-Flow nie zerstört — es gibt keinen UI-Trigger, der `page.destroy()` auslöst (die Page wird einmal lazy gemountet und über die Lebensdauer der App wiederverwendet, geöffnet/geschlossen via `show()`/`hide()`). Daher betritt kein E2E-Test diesen Closure-Body. Ein Test wäre rein zahlengetrieben (künstlicher Direktaufruf von `page.destroy()` ohne reales UI-Verhalten) und wird bewusst nicht geschrieben. |

**Fazit:**
Die Page ist jetzt ein Standard-`createPage`-Host: `templateUrl` (lab.html) + der `components`-Hook registrieren die beiden Alpine-Komponenten (`algorithmLab` + `labTryIt`), `mount()` verdrahtet nur noch Registry/`theme:changed`/`lab:navigate` und liefert ein `navigate(algoId, tab)`-Handle für das `lab:navigate`-Routing in app.js. Alle realen Pfade — initialer Mount + Template-Render, `navigate` (über `lab:navigate` und über das app.js-Handle), `onTheme` (Prism-Theme-Swap bei `theme:changed`) — werden von algorithm-lab-ui.spec.js und overlay.spec.js durchlaufen. Einzig der `unmount`-Pfad ist NOUI (kein UI-Trigger zerstört die Page).

Abgedeckte Pfade: Lazy-Mount der Algorithm-Lab beim ersten Öffnen der Dev-Area (templateUrl-Fetch + `components`-Hydration), Toggle (öffnen/schließen) über den Header-Button, Schließen via Escape-Taste, Schließen beim Öffnen eines anderen Overlays (Exklusivität), Force-Open + Navigate über ein `lab:navigate`-Event, Theme-Swap.

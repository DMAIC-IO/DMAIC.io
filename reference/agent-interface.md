# Agentenfläche `window.qprovement.interact` — Vertrag

Dieses Dokument beschreibt die öffentliche Schnittstelle, über die ein
externer Agent (ein Sprachmodell, ein Skript, ein Testwerkzeug) die App
liest und bedient: Aufrufform, Aktionen, Referenzen, Antwort- und
Fehlerform, Shape-Grammatik, Lese- und Schreibvertrag, Grenzen und
Vertragsversion.

Die maschinenlesbare Wahrheit steht im Code, nicht hier:

| Datei | Inhalt |
|---|---|
| `js/core/agent/agent-contract.js` | Vertragsversion, Fehlercodes (`ERRORS`), Aktionskatalog mit Ergebnisformen (`OPS`) |
| `js/core/agent/agent-shape.js` | Shape-Grammatik, Pfadzugriff |
| `js/core/agent/agent-refs.js` | Referenzform `{ $from, path }` |
| `js/core/agent/agent-validate.js` | die sechs Prüfstufen vor jeder Ausführung |
| `js/core/agent/agent-read.js` | die `read()`-Projektion (Umfang statt Masse) |
| `js/core/agent/agent-revisions.js` | der Merker „Lesen vor Schreiben" |
| `js/core/hash.js` | `cyrb53`, der Inhaltshash hinter den Revisionen |
| `js/core/agent/agent-briefing-text.js` | der Agententext (nur über `interact()`) |

Dass die Zahl der Fehlercodes hier und in `ERRORS` übereinstimmt, hält
`tools/build/agent-docs-sync.test.mjs` (`npm run test:build`).

## Die Fläche

```js
await window.qprovement.interact();          // Briefing + ops/errors + Katalog + Instanzen + Ansicht
await window.qprovement.interact(aktion);    // eine Aktion
await window.qprovement.interact([a1, a2]);  // ein Stapel
```

`window.qprovement` ist eingefroren und hat genau einen Schlüssel. Das ist
die dokumentierte Ausnahme zur Projektkonvention „keine globalen Variablen".

Jeder Aufruf durchläuft zuerst das Einwilligungstor. Ohne Zustimmung fließt
**keine** Information — auch nicht der Katalog. Lehnt der Nutzer ab, kommt
`consent_denied` zurück.

**Die Beschreibungsantwort.** Der parameterlose Aufruf liefert

```js
{ ok: true, contract, appVersion, language, briefing, ops, errors, catalog, instances, view }
```

`ops` nennt je Aktion `{ params, result }`, wörtlich aus `OPS`; `errors`
nennt alle Codes aus `ERRORS`. Beide sind aus dem Code abgeleitet, nicht
nebenher aufgeschrieben. Die Prosa steht nur im Briefing.

**`briefing`** ist das Rollen-Briefing der Fläche als **Klartext** in der
aktiven Sprache. Klartext und nicht Markdown, weil ein Agent den Text liest
und nicht rendert — `agent-briefing.js` nimmt `**fett**` und
`{{term:id|Beschriftung}}` heraus, bevor der Text ins Kontextfenster geht.

Die Quelle ist `js/core/agent/agent-briefing-text.js`, per dynamischem
`import()` geladen (so bleibt sie außerhalb des Start-Bundles). Es gibt genau
**eine** Verwendung: `interact()` → `briefing`. Der Text ist kein Hilfekapitel
und keine statische Seite; er hat sechs Abschnitte (`rolle`, `arbeitsweise`,
`ausschliesslich`, `vertrag`, `fehlgriffe`, `grenzen`), in dieser
Reihenfolge, weil wer nur den Anfang liest das Wichtigste gelesen haben soll.

## Aktionen

Eine Aktion ist ein Objekt `{ op, id?, …Felder }`. Erlaubt sind genau die
Felder aus `OPS[op].params`; **ein unbekanntes Feld ist ein Fehler**
(`unknown_param`). Die optionale `id` macht das Ergebnis der Aktion für
spätere Aktionen desselben Stapels referenzierbar und muss im Stapel
eindeutig sein (`duplicate_id`).

| `op` | Felder | Ergebnis | schreibt |
|---|---|---|---|
| `project.read` | — | `{ contract, appVersion, language, view, instances: [{ id, module, name, phase }] }` | nein |
| `catalog.read` | — | `{ contract, modules: [{ id, name, whenToUse, available, phase }] }` | nein |
| `module.describe` | `module`, `sections?` | `{ module, name, whenToUse, available, phase, actions, fields, asyncTasks, notes, sections, prose }` | nein |
| `module.add` | `module`, `phase?` | `{ instanceId, module, phase }` | ja |
| `module.remove` | `instance` | `{ instanceId, removed }` | ja |
| `instance.open` | `instance` | `{ instanceId, module, phase }` | nein |
| `instance.call` | `instance`, `method`, `args?`, `module?` | `{ instanceId, method, value }` | ja, außer `method: 'read'` |
| `instance.set` | `instance`, `values`, `module?` | `{ instanceId, values }` | ja |

**Ansichtswechsel.** `instance.call` mit `method: 'read'`, `instance.set` und
die Model-Kommandos eines Moduls mit deklarativem Model wechseln die Ansicht
nicht: sie gehen über den Kerndienst `instances` und wirken in jeder Phase,
auch auf eine Instanz, die in dieser Sitzung nie eingehängt war. Mit
Ansichtswechsel (Anzeigen und Einhängen der Zielinstanz) laufen weiter:
Kommandos des Viewmodels, `asyncTask`-Aktionen samt `.cancel`, alle Aktionen
eines Altmoduls und das `read()` eines Altmoduls mit eigenem `read()`, dieses
aber nur, wenn die Instanz nicht eingehängt ist (andere Phase oder nie
geöffnet); eine Instanz der angezeigten Phase liest es ohne Ansichtswechsel.
`instance.open` ist der ausdrückliche Weg, eine Instanz anzuzeigen.

`module.describe` liefert je Aktion `{ name, help, returns, params, keys }`
und je Lesefeld `{ name, type, help, bulk, bulkKind?, derived, rules?, keys }`. `bulkKind`
(`'table'` oder `'tree'`) steht nur an einem Massenfeld und nennt die Art seines
Umfangs-Deskriptors in `read()`. `derived: false`
heißt „die Lesefläche ist die persistierte Model-Form", `true` heißt „das
Modul hat sie eigens erklärt".

**`keys` steht immer da.** An jeder Aktion, jedem Feld und jedem Schlüssel —
ohne erklärte Struktur als leere Liste, nie abwesend. Ein Eintrag ist
`{ name, type, help, optional, keys }`: bei einem generischen Setter wie
`setParam(key, value)` je zulässigem Schlüssel, bei einem Ergebnisfeld wie
`result` je Kennzahl, verschachtelt in `keys` der nächsten Ebene. Eine
Ebene tiefer ist die Ergebnisform `any` (die Grammatik kennt keine
Rekursion). `optional: true` heißt, der Schlüssel fehlt in manchen
Zuständen (je Kartentyp, bei einseitiger Toleranz). Ein `type` der Form
`Object<string, T>` ist eine Map mit Schlüsseln aus den Daten (je Prüfer);
`keys` beschreibt dann **einen** Eintrag. Derselbe `help`-Text erscheint in
der Oberfläche an der Beschriftung, wenn der Mensch Alt hält.

**Aktionsnamen mit Punkt.** Ein Modul kann Teil-Viewmodels haben; ihre
Methoden heißen `<teil>.<methode>` (`draft.addQuestion`) und werden wie
jede andere über `instance.call` mit `method: 'draft.addQuestion'` gerufen.
Das gilt nur für Module in der Altform; Module mit deklarativem Model gliedern
ihren `view`-Block in Teile (`view: [teilA, teilB]`), deren Kommandos und
Methoden flach unter ihrem Namen stehen, ohne Punkt.

### Module mit deklarativem Model: Kommandos und `instance.set`

Ein Modul, dessen Model mit `defineModel` erklärt ist (`app/dev/js/core/model.js`),
führt seine Aktionen als **Kommandos**: `describe` nennt je Kommando genau einen
Parameter `command` vom Typ `object`, seine Schlüssel stehen in `keys`
(`{ name, type, help, optional }`). Aufgerufen wird mit einem Objekt:

    { op: 'instance.call', instance, method: 'moveItem',
      args: [{ fromCol: 'inputs', fromIdx: 0, toCol: 'process', toIdx: 2 }] }

`sipoc` (erstes Modul in neuer Form):
`{ op: 'instance.call', instance, method: 'addItem', args: [{ col: 'inputs', text: 'Teig' }] }` → `value: 0`.
`moveItem` nimmt `{ fromCol, fromIdx, toCol, toIdx }`; `toIdx` ist die Position NACH dem
Verschieben (eigene Spalte bis Länge − 1, fremde bis Länge). Ein Schlüssel mit
`rules: ['trim', 'nonEmpty']` in `module.describe` wird getrimmt und lehnt leeren Text ab
(`invalid text "  "; allowed: a non-empty text`).
Ein Feld vom Typ Datensatzliste (`rules: ['datasets', …]`) nennt je Spaltenslot seine Regeln
unter `slots`, z. B. `slots: { valueRef: ['columnRef', 'types:numeric', 'minCount:1', 'required'] }`.

Datensätze (Feldart `datasets`) sind eine Liste von Zeilen, deren Schlüssel die
Spaltenslots des Moduls sind: `[{ valueRef: { instanceId, columnId }, groupRef: null }]`.
Ein Slot ist ein Spaltenbezug oder `null`; unbekannte Schlüssel werden abgelehnt, die Liste
braucht mindestens eine Zeile, und ohne das Token `multi` in `rules` genau eine. In
`module.describe` steht je Feld `rules: ['datasets', 'multi'?]` und `slots` mit den Regeln
je Slot (`columnRef`, `types:<art>`, `minCount:<n>`; `required` = die Zeile ist ohne diesen
Slot unvollständig, bleibt aber gültig und liefert im abgeleiteten Ergebnis keine Reihe;
`group` = der Slot nimmt jeden Spaltentyp und darf `null` bleiben, also „keine Gruppierung“).
`instance.set` prüft nur die Form der Zeilen, nicht, ob die Spalten existieren.

Ein fehlender Schlüssel antwortet wie ein fehlendes Argument (`missing argument
"toIdx" of moveItem; expected: …`), ein unbekannter mit `unknown moveItem param
"x"; available: …`.

Felder setzt `instance.set`:

    { op: 'instance.set', instance, values: { alpha: 0.1, mode: 'less' } }

Alles wird geprüft, dann alles geschrieben; scheitert ein Wert, ist nichts
geschrieben (`call_failed`). Setzbar sind die Felder aus `describe` — keine
Ansichtsfelder (`unknown field "<x>"; available: …`) und keine Felder, die das
Model mit `agentWrite: false` sperrt (Bild-Felder, `image()`): `describe` führt
sie nicht unter `settable`, `instance.set` darauf antwortet mit `call_failed`.
Kommandos, deren Parameter ein gesperrtes Feld enthält, stehen nicht im
Katalog. Ein Modul alter Form antwortet auf `instance.set` mit `call_failed`.

Formatierter Text (Feldart `richText`, z. B. `problemStatement` im `project-charter`) ist
eine Zeichenkette in einer Markdown-Teilmenge: `**fett**`, `*kursiv*`, `\n` als
Zeilenumbruch, `\` maskiert. In `module.describe` trägt das Feld die Regel-Tokens
`richText` und `format:…` (die Schreibweise) sowie bei gesetzter Grenze `maxLength:<n>`;
die Grenze gilt für den **Klartext** ohne die Markierungen. Ein längerer Text wird mit
`invalid <feld> …; allowed: a text of at most <n> plain characters (without ** and * marks)`
abgelehnt, nichts wird geschrieben. `read()` liefert den Text unverändert mit Markierungen.

Regeln über mehrere Felder (Invarianten des Models) nennt `module.describe`
unter `notes`, je Regel ein Satz in der UI-Sprache, z. B. für `msa-typ2`
`notes: ['USG muss kleiner als OSG sein']`; ohne solche Regeln ist `notes`
leer. Verletzt ein Schreiben (`instance.set` oder ein Kommando) eine solche
Regel, trägt die Ablehnung `invariant` mit dem Namen der Regel, und die Meldung
nennt hinter `allowed:` ihren Satz:

    { ok: false, error: 'call_failed', invariant: 'limitsOrder',
      message: 'Aufruf von "instance.set" ist fehlgeschlagen: invalid usl 1; allowed: USG muss kleiner als OSG sein' }

Spaltenfelder (`columnRef`) nennen eine Arbeitsblattspalte als
`{ instanceId, sheetId?, columnId }`; eine Liste von Spalten ist
`list(columnRef)`. In `module.describe` tragen sie die Regel-Tokens
`columnRef`, `types:<art>` (zulässige Spaltenarten, z. B. `types:numeric`) und
`minCount:<n>` (Mindestzahl Werte). `instance.set` prüft nur die Form; eine
falsche Form wird mit `invalid colRef1 …; allowed: a column reference
{ instanceId, sheetId?, columnId }` abgelehnt. Ob Blatt und Spalte existieren, prüft das
Model nicht — das zeigt sich im abgeleiteten Ergebnis
(`{ status: 'insufficient', reason }`).

`dmaic-calendar` (Termine als Kommandos):
`{ op: 'instance.call', instance, method: 'addEvent', args: [{ title: 'Review', date: '2026-03-02', time: '14:00', duration: 45 }] }`
→ `value: <id>`. `addEvent` nimmt `{ title, date, time?, duration?, desc?, phase? }`
(`time` auf 5 Minuten gerastert, Vorgabe `09:00`; `duration` in Minuten, Vorgabe 60);
`updateEvent` nimmt `{ id, … }` mit denselben optionalen Schlüsseln; `removeEvent` nimmt
`{ id }`. `read()` liefert die Termine unter `events`. `phase` akzeptiert jede Phase eines
bekannten Zyklus; ohne `phase` gilt die erste Phase des aktiven Zyklus. In
`module.describe` trägt `phase` (Feld und Parameter) die Regeln
`['phase', 'phases:<id>,<id>,…']` mit den Phasen des aktiven Zyklus. Die Aktionen
`setAxisFrom`, `setAxisTo`, `setDayFrom` und `setDayTo` gibt es nicht mehr; ein Aufruf
antwortet mit `unknown_method`. Tagesachse und Wochentage sind Ansichtsfelder.

#### Asynchrone Abläufe

Dauert eine Berechnung (Bootstrap, Permutationstest), führt das Modul sie als
asynchronen Ablauf (`asyncTask`). `describe` nennt ihn unter `asyncTasks`
(`{ name, auto, help, params }`) und im Katalog als zwei Aktionen:

- `<name>` startet den Ablauf und **wartet bis zum Ende**. Erfolg: `value` ist
  der Rückgabewert des Ablaufs. Fehler im Ablauf: `call_failed` mit dem Text
  des Fehlers. Abbruch: `value: { cancelled: true }`, kein Fehler. Parameter
  stehen wie bei Kommandos in einem Objekt: `args: [{ … }]`.
- `<name>.cancel` ohne Parameter bricht einen laufenden Ablauf ab (er läuft
  sofort, nicht in der Kette) und antwortet `{ cancelled: boolean }` (`false`, wenn keiner lief).

Läuft der Ablauf schon, oder nennt das Modul einen Grund, warum er nicht
starten kann (fehlende oder ungültige Eingaben), antwortet die Aktion mit
`call_failed` und diesem Grund; es wird nichts gestartet und nichts gequeued.
Ein Ablauf mit `auto: true` startet von selbst, wenn sich seine Eingaben
ändern; er hat keine Aktionen, nur den Status.

`read()` führt unter `asyncTasks` den Status je Ablauf:
`{ running, progress, error }` (`progress` 0…1 oder `null`), bei `auto`-Abläufen
zusätzlich `value`. Das Ergebnis eines manuellen Ablaufs steht dort nicht; es
liegt, wo das Modul es hinschreibt (bei `resampling` im Feld `result`). Der
Status gehört zur Anzeige, er wird nicht gespeichert.

Beispiel für einen `auto`-Ablauf: `multi-vari` rechnet den Ablauf `analysis` aus
Messwert, Faktorzeilen, Modellform und Schätzer sowie dem Arbeitsblatt von selbst,
entprellt. Es gibt dafür keine Aktion; der Agent setzt die Felder (`instance.set` auf
`measurement`, `modelForm`, `estimator`, `showPoints`, `connectMeans`, `showGroupMean`,
`showRefLine`) und die Faktorzeilen über die Kommandos `addFactor` (liefert die neue
`id`), `removeFactor { id }`, `moveFactor { fromIdx, toIdx }` und
`setFactorColumn { id, ref }`; die Faktorzeilen sind 2 bis 4. `read()` liefert die Felder
samt `factors` und unter `asyncTasks.analysis` den Status mit `value` (`{ result, error, message }`, das Ergebnis steht in `value.result`);
die Anzeigeschalter rechnen nicht neu.

Beispiel für ein Schema-Modul ohne eigene Aktion: `msa-typ2` (Messsystemanalyse
Typ 2). `describe` nennt außer `read` keine Aktion; der Agent setzt die Felder über
`instance.set`: `part`, `operator`, `measurement` (Spaltenbezug oder `null`), `lsl`,
`usl` (Zahl oder `null`), `alpha`, `k` (`6` oder `5.15`), `verdictBasis` (`auto`,
`tolerance` oder `studyVar`) und `sigmaHist` (Zahl größer 0 oder `null`), zum Beispiel
`{ op: 'instance.set', instance, values: { k: 5.15 } }` oder
`{ op: 'instance.set', instance, values: { lsl: 6, usl: 14 } }`. Eine untere
Grenze, die nicht unter der oberen liegt, wird abgewiesen (Invariante `limitsOrder`);
ebenso ein `sigmaHist` kleiner oder gleich 0. `read()` liefert die Felder und unter
`analysis` das berechnete Ergebnis (Varianzkomponenten, Kennzahlen, Urteil); ohne
Prüferspalte rechnet das Modul als Typ 3.

Beispiel für ein Schema-Modul mit einem Kommando und Spaltenlisten: `msa-typ5`
(Attributive Messsystemanalyse). Der Agent setzt die Felder über `instance.set`:
`type` (`binary`, `nominal` oder `ordinal`), `positiveLevel` (Stufe als Text oder
`null`), `weights` (`linear` oder `quadratic`), `alpha` (`0.01`, `0.05` oder `0.1`),
`ruleSet` (`aiag` oder `bosch`), `layout` (`long` oder `wide`), `trials` (ganze Zahl
ab 1), die Spaltenbezüge `part`, `appraiser`, `rating`, `reference`, `replicate`
und die Liste `ratings` (Bewertungsspalten im breiten Layout, doppelte Bezüge
werden repariert). Das Kommando `swapPositive` hat keine Parameter und vertauscht
die positive mit der negativen Stufe; hat die Bewertung keine zweite Stufe,
wird es mit `positiveLevel` als Parameter abgewiesen. `read()` liefert die Felder,
unter `levels` die Stufen (`all`, `positive`, `negative`) und unter `analysis`
das berechnete Ergebnis; es rechnet bei jeder Änderung neu, ohne Entprellung.

Beispiel für ein Schema-Modul mit Kommandos auf einer Schrittliste:
`opportunity-flowchart` (Wertschöpfungskette mit Unterschritten). Jedes Kommando
nimmt genau ein Objekt. `addStep` (`side`: `va` oder `nva`, optional `index`) und
`addSubstep` (`stepId`) liefern die neue id zurück. `removeStep`, `moveStep`
(`id`, `index` als Endposition, optional `side` zum Wechsel der Seite), `setSide`,
`removeSubstep`, `moveSubstep` (`stepId`, `substepId`, `index`) und `setExpanded`
(`id`, `expanded`) nehmen die ids aus `read()`. `appendSteps` hängt mehrere
Schritte (`title`, `description`, `side`) an und liefert deren Anzahl. Titel und
Beschreibung eines Schritts setzt der Agent über `instance.set` auf `steps`; das
Aufklappen steht nicht in `steps`, sondern nur im Kommando `setExpanded`. Der
Import aus anderen Modulen läuft über `ctx.instances` und ist für den Agenten
nicht sichtbar.

`settle` (die interne Ruhe vor einem `read()`) wartet zusätzlich auf laufende
`auto`-Abläufe, höchstens 20 Sekunden, und geht danach ohne Fehler weiter.

### Phasenprüfung in zwei Stufen

Eine angegebene `phase` (z. B. in `module.add`) durchläuft zwei Hürden.
Zuerst: kennt der aktive Zyklus diese Phase überhaupt? Erst wenn ja, folgt
die zweite: darf **dieses** Modul in diese Phase? Beide Fälle melden
denselben Fehlercode `unknown_phase` (der Vertrag kennt nur einen Code für
Phasenfehler), aber unterschiedliche Meldungen und ein unterschiedliches
`available` — einmal die Phasen des Zyklus, einmal die des Moduls. Der
Meldungsschlüssel `unknownPhaseInCycle` bedeutet „die Phase existiert in
diesem Zyklus nicht", `unknownPhase` bedeutet „die Phase existiert, aber
nicht für dieses Modul". Dieselbe Prüfung läuft im Vollzug noch einmal, damit
auch eine Phase, die erst über eine Referenz entsteht, nicht ungeprüft
ankommt.

### Die Singleton-Regel gilt auch für den Agenten

Ein Modul mit `def.singleton` darf nur **eine** Instanz haben — für den
Agenten wie für die Oberfläche. Ein zweites `module.add` scheitert mit
`module_singleton`, auch wenn beide im **selben** Stapel stehen.

## Referenzen

Eine Aktion darf sich auf das Ergebnis jeder **vorherigen** Aktion desselben
Stapels beziehen, auch auf Leseergebnisse:

```js
await window.qprovement.interact([
  { op: 'module.add', id: 'a', module: 'five-why' },
  { op: 'instance.call', instance: { $from: 'a', path: 'instanceId' }, method: 'read' },
]);
```

Die Form ist ausdrücklich ein Objekt `{ $from: '<id>', path: '<punktpfad>' }`
und kein Platzhalterstring: `"$a.x"` wäre von echten Nutzerdaten, die mit
`$` beginnen, nicht zu unterscheiden. `path` ist ein Punktpfad mit
Zahlenindizes — keine Arithmetik, keine Filter, keine Ausdrücke. Wer
transformieren muss, liest und schickt einen zweiten Stapel.

Geprüft wird vor der Ausführung: die Referenz zeigt nur rückwärts
(`forward_ref`), und der Pfad steht in der **deklarierten** Ergebnisform der
referenzierten Aktion (`bad_shape`, siehe „Shape-Grammatik"). Scheitert die
Auflösung zur Laufzeit trotzdem, kommt `unresolved_ref`.

**Aufgelöste Referenzen werden nachgeprüft.** Der Typ-Check eines
Parameters, der eine Referenz ist, kann erst im Vollzug laufen, weil sein
Wert erst dann entsteht. Er läuft direkt nach dem Auflösen und **vor** der
Aktion (`wrong_type`); ein referenzierter Wert kommt nie ungeprüft an.

## Antwort- und Fehlerform

Ein Stapel antwortet mit

```js
{ ok, contract, results: [ { ok: true, id, result }
                         | { ok: false, id, error, message, available?, invariant? } ] }
```

`ok` ist `true`, wenn jeder Eintrag gelungen ist. `available` nennt, wo
sinnvoll, die gültigen Möglichkeiten (Modul-ids, Instanzen, Methoden,
Phasen, Pfadschlüssel). `invariant` steht nur an einem `call_failed`, das eine
Regel über mehrere Felder verletzt hat, und nennt deren Namen (siehe
„Module mit deklarativem Model“). Ein Fehler sagt, **was** das Problem ist, und nennt
die Möglichkeiten; einen Lösungsvorschlag gibt er nicht — das ist Sache des
Agenten. Meldungen stehen in der UI-Sprache.

Der **ganze** Stapel wird geprüft, bevor irgendetwas ausgeführt wird. Fällt
die Prüfung durch, läuft nichts, und die Antwort ist

```js
{ ok: false, contract, error: 'validation_failed', message, index, id, cause }
```

mit `cause` als dem eigentlichen Fehler (`{ ok: false, error, message, available? }`).
Beim ersten Laufzeitfehler bricht die Ausführung ab; die bis dahin erzielten
Teilergebnisse stehen in `results`.

Sonderformen ohne `results`-Liste: `consent_denied` und `surface_failed`
(`{ ok: false, contract, error, message }`). `flush_failed` trägt
`results` mit, siehe „Schreibvertrag".

### Fehlercodes

| Code | Bedeutung |
|---|---|
| `consent_denied` | der Nutzer hat den Zugriff abgelehnt |
| `unknown_op` | `op` ist keine Aktion aus dem Katalog |
| `unknown_module` | Modul-id unbekannt |
| `unknown_phase` | Phase unbekannt im Zyklus oder für das Modul (siehe „Phasenprüfung") |
| `unknown_instance` | Instanz-id unbekannt |
| `unknown_method` | das Modul gibt diese Methode nicht als Aktion frei |
| `unknown_section` | `module.describe` kennt diesen Handbuchabschnitt nicht |
| `missing_param` | Pflichtfeld der Aktion fehlt |
| `unknown_param` | Feld, das die Aktion nicht kennt |
| `wrong_type` | Feld hat den falschen Typ (auch nach Auflösen einer Referenz) |
| `duplicate_id` | eine `id` kommt im Stapel mehrfach vor |
| `missing_op` | Eintrag ohne `op` |
| `bad_shape` | Eintrag ist kein Aktionsobjekt, oder ein Referenzpfad steht nicht in der deklarierten Ergebnisform |
| `forward_ref` | Referenz zeigt nicht auf eine vorherige Aktion |
| `unresolved_ref` | Referenz ist zur Laufzeit nicht auflösbar |
| `module_not_agent_ready` | das Modul ist nicht für Agenten freigegeben (`available: false`) |
| `module_singleton` | das Modul darf nur einmal vorkommen und hat schon eine Instanz |
| `project_completed` | das Projekt ist abgeschlossen und schreibgeschützt |
| `validation_failed` | Hülle einer gescheiterten Prüfung; der eigentliche Fehler steht in `cause` |
| `call_failed` | die Methode in `instance.call` hat geworfen oder abgesagt |
| `op_failed` | eine Aktion ist unerwartet gescheitert; die Meldung nennt die `op` |
| `surface_failed` | äußerer Fang-Punkt von `interact()` |
| `flush_failed` | der Stapel hat geschrieben, der Zustand konnte aber nicht gespeichert werden |
| `stale_revision` | der Agent schreibt in eine Instanz (oder ändert die Projektstruktur), deren aktuellen Stand er nicht gelesen hat — erst `read` bzw. `project.read`, dann erneut |

`op_failed` bleibt dem Wurf *aus einer Aktion* vorbehalten, `call_failed`
dem Methodenwurf in `instance.call`, `surface_failed` allem davor und danach
(Einwilligung, Prüfung, Referenzauflösung, Beschreibung).

### Argumentmeldungen von Modulmethoden

Ein ungültiges Argument an eine Modulmethode endet als `call_failed`; die
Meldung trägt ein Listenwort und die Menge dahinter, damit ein Agent seinen
Fehler selbst findet (`js/core/agent/agent-argcheck.js`).

| Prüfer | Listenwort | Beispielmeldung |
|---|---|---|
| `requireEnum` | `allowed:` | `invalid mode "x"; allowed: DEG, RAD` |
| `requireEnum` mit `numeric` | `allowed:` | nimmt für numerische Listenglieder auch eine Zahl oder einen Dezimalzahl-Text an und gibt das Listenglied zurück |
| `requireKnownId` | `available:` | `unknown stepId "x"; available: s-1, s-2` |
| `requireIndex` | `allowed:` | `invalid idx 9; allowed: 0..3` |
| `requireIndex` mit `existing` | `allowed:` | `invalid idx 3; allowed: 0..2`, leer `invalid index 0; allowed: none, the collection is empty` |
| `requireBoolean` | `allowed:` | `invalid on "ja"; allowed: true, false` |
| `requireNumericText` | `allowed:` | `invalid value null; allowed: any string or finite number, "" clears it` |
| `requireArity` | `expected:` | `missing argument "values" of setCells; expected: columnId, startRow, values` |
| `requireText` | `allowed:` | `invalid text 7; allowed: any string, "" clears it` |
| `requireNumber` | `allowed:` | `invalid mu0 "zehn"; allowed: any finite number` |
| `requireNumber` mit Bereich | `allowed:` | `invalid value 0.3; allowed: a number from 0.5 to 0.99` |
| `requireNumber` mit `integer` | `allowed:` | `invalid n 2.5; allowed: a whole number from 1 to 50` |
| `requireForm` (Schlüssel mit `nonEmpty`) | `allowed:` | `invalid text "  "; allowed: a non-empty text` |
| `requireForm` (`_schema.version`) | `allowed:` | `invalid _schema.version "9"; allowed: up to 1.0 (saved by a newer version of this module)` |

`requireNumber` nimmt endliche Zahlen und Zahlentexte (`'10'`) und schreibt
die Zahl. Außerhalb eines Bereichs **wirft** der Setter — er klemmt nicht
still auf den Rand.

## Shape-Grammatik

Die Ergebnisformen in `OPS` folgen einer geschlossenen, absichtlich armen
Grammatik. Sie existiert, damit die Referenzprüfung statisch sein kann:

```
'string' | 'number' | 'boolean' | 'any'
{ key: <shape>, … }      Objekt mit genau diesen Schlüsseln
[ <shape> ]              Array; Pfadsegmente müssen Ziffernfolgen sein
{ $nullable: <shape> }   zur Laufzeit diese Form ODER null
```

`$nullable` ist ein Wort der Grammatik, kein Schlüssel.
`OPS['project.read'].result.view` ist heute die einzige Nullable-Form (kein
Modul offen → `null`). Die Referenzprüfung lässt die Form **als Ziel** zu
(`path: 'view'` ist gültig) und lehnt den Abstieg **durch** sie ab
(`path: 'view.module'`), weil zur Prüfzeit nicht feststeht, ob ein Modul
offen ist. Die Ablehnung ist `bad_shape` (Meldungsschlüssel
`agent.errors.nullableRef`) und nennt in `available` die **inneren**
Schlüssel, damit der Agent weiß, was er bekommt, wenn er das Feld selbst
liest und im nächsten Stapel verzweigt.

**Ergebnisform und tatsächliche Rückgabe passen zusammen.** Die
Referenzprüfung lässt einen Pfad nur zu, wenn er in der **deklarierten**
Ergebnisform steht, nicht gegen das, was die Aktion zur Laufzeit liefert.
Für jede neue Aktion und jede Änderung an einer bestehenden gilt deshalb:
die `result`-Form in `agent-contract.js` und die tatsächliche Rückgabe in
`agent-ops.js`/`agent-catalog.js` stimmen exakt überein. Ein Feld, das nur
zur Laufzeit existiert, ist nicht referenzierbar; ein deklariertes Feld, das
nicht geliefert wird, täuscht eine Referenzierbarkeit vor, die ins Leere
läuft.

## Lesevertrag: `read()`

Der **einzige** Weg zu Feldwerten ist `instance.call` mit `method: 'read'`.
`project.read` liefert Instanzen samt Modul und Phase, `module.describe`
das Feldschema — beides ohne Werte.

```js
{ op: 'instance.call', instance, method: 'read', args: [options?] }
// options: { fields?: string[], rows?: { from: number, to: number } }
```

**Umfang statt Masse.** Ein Massenfeld (`bulk: true` in `module.describe`)
kommt ohne `options.fields` nicht als Daten, sondern als
Umfangs-Deskriptor, der seine Art trägt (`bulkKind` des Felds in
`module.describe` nennt sie vorab):

| Art | Deskriptor |
|---|---|
| Tabelle | `{ $bulk: true, kind: 'table', rowCount, columns }` |
| Baum | `{ $bulk: true, kind: 'tree', nodeCount, depth }` |

Nennt `options.fields` das Feld, kommen die Daten. Mit `options.rows` kommt
nur der Ausschnitt `[from, to)`, dazu ein Schwesterschlüssel
`<feld>$range: { from, to, rowCount }`. Ein ungültiger Bereich ist ein
ungültiger Aufruf (`call_failed`). `columns` nennt die Spalten **dieses**
Feldes; führt ein Modul mehrere tabellarische Massenfelder, kann `columns`
leer sein — eine falsche Spaltenliste wäre schlechter als keine.

**Ausgelassene Teilwerte.** Große Teilwerte, die ein Agent nicht braucht
(Bild-Daten-URLs, Vollkopien in Snapshots), stehen in `read()` als
`{ $omitted: true, bytes }` (Länge der JSON-Serialisierung) — auch bei
`options.fields`. `null` bleibt `null`, damit „kein Bild" von „Bild
ausgelassen" unterscheidbar bleibt. Ausgelassene Werte sind über `read()`
nicht abrufbar. Bei Modulen mit deklarativem Model erklärt das Model die
Auslassung am Feld selbst: das Merkmal `omitOnRead: true` (die Feldart
`image()` trägt es), die Pfade leitet der Kern aus dem Schema ab
(`[]` je Liste, `.<schlüssel>` je Objekt, `{}` je Map, der leere Pfad für das
Feld selbst); eine Marke `@agentOmit` ist dort nicht nötig.

**Abgeleitete Ergebnisse.** Jede Ableitung des Models (`derived`) erscheint
in `read()` — als Zahlen, nicht als Anzeigetexte. In `module.describe` steht ein
solches Feld mit `derived: true`; es ist nur lesbar, `instance.set` lehnt es
ab. Beispiel `hypothesis-test`, Feld `result`:

    { status: 'ok', route: { name, algoId, … }, samples: [ … ],
      main: { statistic, df, p, ci, decision, … }, power, pairwise, … }

Solange Eingaben fehlen, steht dort `{ status: 'insufficient', reason }`; scheitert
die Rechnung, `{ error: <Meldung> }`. Das Ergebnis folgt dem Zustand: wer eine Spalte
wählt (`instance.set` auf `colRef1`) oder einen Wert im Arbeitsblatt ändert, liest
beim nächsten `read()` das neu gerechnete Ergebnis.

Ableitungen können auch Massenfelder sein (`bulk: true, bulkKind: 'table',
derived: true`, etwa die Punkte einer Regelkarte). Sie verhalten sich wie jedes
Massenfeld: `read()` liefert den Deskriptor ohne Nennung der Zeilen, die vollen
Zeilen kommen mit `read({ fields: ['points'] })`, ein Zuschnitt mit `rows`.
Beispiel `attribute-control-chart`: `result` (Kennzahlen, Grenzen, Verletzungen)
und `points` (Zeilentabelle); schreibend bleibt nur das Kommando
`toggleRule({ ruleId, on })`.

**`read()` liest.** Ein `read()` ist nebenwirkungsfrei; es ist deshalb auch
im abgeschlossenen Projekt erlaubt.

## Schreibvertrag

### Aufrufe sind serialisiert, und nichts wirft nach außen

`interact()` legt jeden Aufruf in eine Kette (Ausnahme: reine Abbruch-Stapel, siehe unten): **die Prüfung gilt gegen den
Zustand zum Beginn der Ausführung**, und zwei nebenläufige Aufrufe können
ihre Effekte nicht verschränken. Ein Stapel B wird erst geprüft, wenn
Stapel A fertig ist — kein Seiteneffekt vor vollständiger Prüfung.

Ein asynchroner Ablauf, den der Agent startet, hält diese Kette bis zu seinem
Ende. Ein Stapel, der nur aus Abbrüchen besteht (`instance.call` mit
`<name>.cancel` eines asynchronen Ablaufs), läuft darum sofort und an der Kette
vorbei; er erreicht auch Läufe, die der Agent selbst gestartet hat. Enthält ein
Stapel daneben eine andere Aktion, oder heißt die Methode nur zufällig
`….cancel`, ohne ein Ablauf-Abbruch zu sein, bleibt er in der Kette. Ein
Abbruch-Stapel läuft auch, während ein Stapel der Kette noch arbeitet; nach
einer fremden Änderung kann er darum `stale_revision` melden.

**`ok: true` heißt „angewandt und gespeichert".** Nach einem Stapel, der
geschrieben hat, speichert die Fläche einmal beide Persistenzhälften
(`saveNow()` für die oberste Zustandsebene, `flushNow()` für die
Modulzustände) und antwortet erst danach — einmal am Ende, nicht je
Aktion. Ein nur lesender Stapel spült nicht. Was ein Schreibzugriff ist, entscheidet eine Stelle
(`isWritingAction` in `agent-validate.js`), siehe die Spalte „schreibt"
unter „Aktionen".

**Hinweis an den Nutzer.** Hat ein Aufruf Instanzen geändert (`instance.set`,
`instance.call` außer `read`), die am Ende des Aufrufs nicht angezeigt werden
(nicht das aktive Modul des sichtbaren Reiters), zeigt die App **einen** Toast
je Aufruf mit Knopf „Anzeigen“ (öffnet die erste geänderte Instanz). Auch
wirksame Änderungen eines abgebrochenen Stapels zählen. Der Agent muss dafür
nichts tun und erhält keinen zusätzlichen Antwortinhalt.

Scheitert das Speichern, wirft `interact()` nicht: es antwortet
`{ ok: false, contract, error: 'flush_failed', message, results }`. Die
`results` des Stapels bleiben erhalten — der Agent soll wissen, **was**
passiert ist und **dass** es nicht gesichert ist, und bereits gelandete
Schreibvorgänge nicht für nicht passiert halten und wiederholen.

`interact()` gibt **nie** eine rohe Ausnahme nach außen. Ein Wurf aus einer
Aktion wird `op_failed`, jeder andere `surface_failed`.

### Lesen vor Schreiben

Die Fläche führt, nur im Speicher, je Instanz und für die Projektstruktur
(Phasen, Instanzliste) einen Merker: die Revision, die der Agent zuletzt
gesehen hat. Eine Revision ist der `cyrb53`-Hash über den Inhalt — gleicher
Inhalt, gleiche Revision, ein Ansichtswechsel macht also nichts veraltet.
Die Revisionen rechnet der `stateManager`. Für den Agenten zählen die
Ansichtsfelder eines Moduls nicht dazu: aktiver Reiter, aktives Element,
Auf- und Zuklappen, Filter und Sortierung der Anzeige, Zellauswahl. Ein Klick
des Nutzers führt also nicht zu `stale_revision`. Diese Felder bleiben
gespeichert, stehen aber nicht in `read()`, und keine Aktion setzt sie gezielt.
Eine Inhaltsaktion darf sie als Folge ändern: `addEndpoint` zeigt den neuen
Endpunkt, ein Schreiben auf ein Blatt macht es sichtbar.

| Aktion | setzt den Merker |
|---|---|
| `instance.call` mit `method: 'read'` | der Instanz, auf die aktuelle Revision |
| `project.read`, `interact()` ohne Parameter | der Projektstruktur |
| eigenes `instance.call` (nicht `read`), erfolgreich | der Instanz, auf die Revision nach der Aktion |
| eigenes `instance.set`, erfolgreich | der Instanz, auf die Revision nach der Aktion |
| eigenes `module.add`, erfolgreich | der Projektstruktur und der neuen Instanz |
| eigenes `module.remove`, erfolgreich | der Projektstruktur; der Merker der Instanz entfällt |

Vor dem Merken wartet die Fläche bei einer eingehängten Instanz, bis die
Persistenz der Aktion gelaufen ist (auch nach `read`), damit eigene Änderungen
nicht als fremde zählen. Bei einer nicht eingehängten Instanz setzt sie den
Merker direkt: der Dienst `instances` hat den Zustand schon synchron
gespeichert, der gespeicherte Stand ist der Stand.
`catalog.read`, `module.describe` und `instance.open` setzen nichts.

Geprüft wird zur Ausführungszeit, Aktion für Aktion: `instance.call` mit
`method !== 'read'` und `instance.set` verlangen, dass der Merker der Instanz vorhanden und gleich
ihrer aktuellen Revision ist; `module.add` und `module.remove` verlangen das
für die Projektstruktur. Sonst antwortet die Aktion mit `stale_revision` —
ohne Token und ohne `available`; die Meldung nennt den Aufruf, der es
behebt (`read` bzw. `project.read`). Der Stapel bricht ab wie bei jedem
Laufzeitfehler.

- **Nie gelesen heißt veraltet**, auch nach einem Neuladen der Seite.
- **Eine Nebenwirkung auf eine andere Instanz** macht diese veraltet: der
  Agent hat ihren neuen Inhalt nicht gesehen.
- **Eine unbekannte Instanz** meldet weiter `unknown_instance`, vor jeder
  Revisionsprüfung.

### Im abgeschlossenen Projekt antwortet die Fläche ehrlich

Ein abgeschlossenes Projekt ist schreibgeschützt. Ein schreibender Aufruf
scheitert schon in der Prüfung, bevor irgendetwas läuft — ein Stapel läuft
also nicht halb und scheitert dann am Schreibschutz:

| Aktion | im abgeschlossenen Projekt |
|---|---|
| `module.add`, `module.remove` | abgelehnt (`project_completed`) |
| `instance.call` mit `method !== 'read'` | abgelehnt (`project_completed`) |
| `instance.set` | abgelehnt (`project_completed`) |
| `instance.call` mit `method: 'read'` | **erlaubt** |
| `project.read`, `catalog.read`, `module.describe`, `instance.open` | erlaubt |

Die Ausnahme für `read` ist notwendig: sie ist der einzige Weg zu
Feldwerten, und ein abgeschlossenes Projekt ist genau der Zustand, in dem
man es auswerten will. Findet `module.add` die neue Instanz nach dem
Anlegen nicht, meldet es `op_failed`, statt eine Id zu erfinden.

## Dateien als Inhalt

Wo die Oberfläche eine Datei zum Download anbietet, bietet ein Modul dem
Agenten eine Aktion `build…`, die die Datei als Inhalt zurückgibt:
`{ fileName, mimeType, content }`. Der Download in der Oberfläche ruft
dieselbe Aktion; die Nebenwirkungen (zum Beispiel Exportmerker oder
„verschickt am“) sind identisch. Ob und wohin der Agent den Inhalt weitergibt,
entscheidet der Nutzer. Erstes Modul mit dieser Form ist der
Fragebogen-Baukasten (`draft.buildSurveyFile`, `recipients.buildRecipientFile`,
`results.buildReport`).

## Grenzen

- Der Agent bekommt **Zahlen, keine Bilder**: ein Diagramm sieht er nicht.
- Es gibt **kein Rückgängig**. Die Absicherung ist der Projekt-Export, zu
  dem beim Erteilen der Einwilligung aufgefordert wird.
- Nicht jedes Modul ist freigegeben. Welche es sind, sagt der Katalog
  (`available` in `catalog.read` bzw. `interact()`); bei den anderen
  antwortet `instance.call` mit `module_not_agent_ready`. Der Katalog ist
  dennoch vollständig — der Agent kann beraten, welches Werkzeug jetzt
  richtig ist, und den Nutzer es bedienen lassen.
- `instance.call` auf ein Viewmodel-Kommando, eine `asyncTask`-Aktion oder
  eine Aktion eines Altmoduls **wechselt die Ansicht**: es zeigt die
  Zielinstanz an, bevor es die Methode aufruft, weil das Viewmodel nur
  eingehängt lebt. Ein Stapel über mehrere solcher Instanzen wechselt
  entsprechend oft. Lesen, `instance.set` und Model-Kommandos wechseln die
  Ansicht nicht (siehe „Aktionen"). Das steht im Briefing, Abschnitt „Der
  Vertrag" → Ansichtswechsel — ein Agent darf sich nicht darauf verlassen,
  dass die sichtbare Ansicht nach einem Aufruf dieselbe ist wie davor.

## Vertragsversion

Jede Antwort trägt `contract` (derzeit `3`), die Beschreibungsantwort
zusätzlich `appVersion`. `contract` wird nur bei einem Bruch der Hülle
erhöht — Aktionsform, Referenzsyntax, Fehler*form*, Ergebnis-Hülle. Neue
`op`s, neue Fehler*codes*, neue Antwortfelder oder neu freigegebene Module
sind **kein** Bruch: die Fläche kennt heute 24
Fehlercodes (`ERRORS` in `agent-contract.js`). Diese Regel entscheidet
künftige Änderungen: ein neuer Code löst keinen Bump aus, eine neue Form
schon. Invariante, von einem Test gehalten: `ERRORS[k] === k.toLowerCase()`.

Geschichte: `contract: 2` gilt seit 2026-10-28 (Hülle ohne `usage`, stärkere
Haltbarkeitszusage). `stale_revision` allein wäre nach dieser Regel kein Bump
gewesen.

Ansichtsfelder (2026-11-01, `contract` bleibt `2`, die Hülle ist unverändert): Die
Setter der Ansichtsfelder sind keine Aktionen mehr, ein Aufruf antwortet
`unknown_method`. `worksheet` nennt sein Blatt: die Spaltenaktionen tragen
`sheetId` als ersten Parameter, `read({ sheetId })` liest ein Blatt, ohne Angabe
das erste, und die Antwort führt `sheetId` statt `activeSheetId`. `rest-api` nennt
seinen Endpunkt: die Detailaktionen tragen `endpointId` als ersten Parameter,
`lastResponse` und `scheduleRunning` stehen je Endpunkt in `endpoints[]`.

Deklaratives Model (2026-11-03, `contract` bleibt `2`): neue `op` `instance.set`;
Kommandos von Schema-Modulen nehmen ein Objekt in `args[0]`. Beides ist nach
der Regel oben kein Bruch — neue `op`, gleiche Hülle, keine neuen Fehlercodes.

Asynchrone Abläufe (2026-11-07, `contract` bleibt `2`): neue Aktionen
`<name>` und `<name>.cancel`, neues Feld `asyncTasks` in `read()` und
`describe`. Neue Aktionen und Antwortfelder, gleiche Hülle, keine neuen
Fehlercodes — kein Bruch.

`bulkKind` und Phasen in `describe` (2026-11-08, `contract` bleibt `2`): Massenfelder
tragen `bulkKind`; Felder und Parameter vom Typ Phase tragen die Regeln
`phase` und `phases:<id>,…` mit den Phasen des aktiven Zyklus. Neue
Antwortfelder, gleiche Hülle, keine neuen Fehlercodes — kein Bruch.

Nacharbeiten (2026-11-08, `contract` bleibt `2`; ab `contract` 3 überholt, siehe
unten): `read()` führte jedes `computed` des `view`-Blocks, `describe` nannte den
Schlüsselbaum aus dem `@returns` der `computed`-Methode — jetzt gilt das für die
`derived` des Models. Neue Regel-Tokens an Feldern und Parametern:
`afterRemovalFrom:<pfad>`, `unique`, `sorted`, `maxCount:<n>`. Aktionen
`….cancel` laufen an der Warteschlange vorbei. Neue Antwortfelder und
Tokens, gleiche Hülle, keine neuen Fehlercodes — kein Bruch.

Lesevertrag ohne Ansichtshilfen (2026-11-11, `contract` 3): `read()` liefert die
Felder und die `derived` des Models, dazu `asyncTasks` — nicht mehr die `computed`
des view-Blocks (Auswahllisten, Vorschauen, Anzeigereihen); sie sind Ansichtshilfen
und keine Daten. `readBulk` entfällt, Massenfelder stehen in `derivedBulk` des
Models. Damit ändert sich die Form der Antwort von `read()`; ein Agent, der eine
Ansichtshilfe las, bekommt sie nicht mehr. Eine gespeicherte Einwilligung mit
`contract: 2` bleibt gültig — `agent-consent.js` vergleicht die Version nicht.

Invariantentexte (2026-11-11, `contract` bleibt `3`): `module.describe` trägt
`notes` mit den Sätzen der Regeln über mehrere Felder; eine Ablehnung wegen
einer solchen Regel trägt `invariant` und nennt den Satz hinter `allowed:` statt
`a value that keeps <name>`. Neues Antwort- und Fehlerfeld, gleiche Hülle,
keine neuen Fehlercodes — kein Bruch.

Aktionsnamen mit Punkt (`draft.addQuestion`) sind ebenfalls kein Bruch: die
Aktionsform `{ op: 'instance.call', instance, method, args }` bleibt,
`method` bleibt ein String, neu ist nur die Menge seiner Werte. Ein Bump
würde zudem jede gespeicherte Einwilligung als veraltet markieren.

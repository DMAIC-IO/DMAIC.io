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
| `module.describe` | `module`, `sections?` | `{ module, name, whenToUse, available, phase, actions, fields, sections, prose }` | nein |
| `module.add` | `module`, `phase?` | `{ instanceId, module, phase }` | ja |
| `module.remove` | `instance` | `{ instanceId, removed }` | ja |
| `instance.open` | `instance` | `{ instanceId, module, phase }` | nein |
| `instance.call` | `instance`, `method`, `args?` | `{ instanceId, method, value }` | ja, außer `method: 'read'` |

`module.describe` liefert je Aktion `{ name, help, returns, params, keys }`
und je Lesefeld `{ name, type, help, bulk, derived, keys }`. `derived: false`
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
                         | { ok: false, id, error, message, available? } ] }
```

`ok` ist `true`, wenn jeder Eintrag gelungen ist. `available` nennt, wo
sinnvoll, die gültigen Möglichkeiten (Modul-ids, Instanzen, Methoden,
Phasen, Pfadschlüssel). Ein Fehler sagt, **was** das Problem ist, und nennt
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
Umfangs-Deskriptor, der seine Art trägt:

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
nicht abrufbar.

**`read()` liest.** Ein `read()` ist nebenwirkungsfrei; es ist deshalb auch
im abgeschlossenen Projekt erlaubt.

## Schreibvertrag

### Aufrufe sind serialisiert, und nichts wirft nach außen

`interact()` legt jeden Aufruf in eine Kette: **die Prüfung gilt gegen den
Zustand zum Beginn der Ausführung**, und zwei nebenläufige Aufrufe können
ihre Effekte nicht verschränken. Ein Stapel B wird erst geprüft, wenn
Stapel A fertig ist — kein Seiteneffekt vor vollständiger Prüfung.

**`ok: true` heißt „angewandt und gespeichert".** Nach einem Stapel, der
geschrieben hat, speichert die Fläche einmal beide Persistenzhälften
(`saveNow()` für die oberste Zustandsebene, `flushNow()` für die
Modulzustände) und antwortet erst danach — einmal am Ende, nicht je
Aktion. Ein nur lesender Stapel spült nicht. Was ein Schreibzugriff ist, entscheidet eine Stelle
(`isWritingAction` in `agent-validate.js`), siehe die Spalte „schreibt"
unter „Aktionen".

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
Die Revisionen rechnet der `stateManager`, für Oberfläche und Agent gleich.

| Aktion | setzt den Merker |
|---|---|
| `instance.call` mit `method: 'read'` | der Instanz, auf die aktuelle Revision |
| `project.read`, `interact()` ohne Parameter | der Projektstruktur |
| eigenes `instance.call` (nicht `read`), erfolgreich | der Instanz, auf die Revision nach der Aktion |
| eigenes `module.add`, erfolgreich | der Projektstruktur und der neuen Instanz |
| eigenes `module.remove`, erfolgreich | der Projektstruktur; der Merker der Instanz entfällt |

Vor dem Merken wartet die Fläche, bis die Persistenz der Aktion gelaufen ist
(auch nach `read`), damit eigene Änderungen nicht als fremde zählen.
`catalog.read`, `module.describe` und `instance.open` setzen nichts.

Geprüft wird zur Ausführungszeit, Aktion für Aktion: `instance.call` mit
`method !== 'read'` verlangt, dass der Merker der Instanz vorhanden und gleich
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
| `instance.call` mit `method: 'read'` | **erlaubt** |
| `project.read`, `catalog.read`, `module.describe`, `instance.open` | erlaubt |

Die Ausnahme für `read` ist notwendig: sie ist der einzige Weg zu
Feldwerten, und ein abgeschlossenes Projekt ist genau der Zustand, in dem
man es auswerten will. Findet `module.add` die neue Instanz nach dem
Anlegen nicht, meldet es `op_failed`, statt eine Id zu erfinden.

## Grenzen

- Der Agent bekommt **Zahlen, keine Bilder**: ein Diagramm sieht er nicht.
- Es gibt **kein Rückgängig**. Die Absicherung ist der Projekt-Export, zu
  dem beim Erteilen der Einwilligung aufgefordert wird.
- Nicht jedes Modul ist freigegeben. Welche es sind, sagt der Katalog
  (`available` in `catalog.read` bzw. `interact()`); bei den anderen
  antwortet `instance.call` mit `module_not_agent_ready`. Der Katalog ist
  dennoch vollständig — der Agent kann beraten, welches Werkzeug jetzt
  richtig ist, und den Nutzer es bedienen lassen.
- `instance.call` **wechselt die Ansicht**: es zeigt die Zielinstanz an,
  bevor es ihre Methode aufruft, weil das Viewmodel nur in der aktiven
  Ansicht lebt. Ein Stapel über mehrere Instanzen wechselt entsprechend oft.
  Das ist beabsichtigt und steht im Briefing, Abschnitt „Der Vertrag" →
  Ansichtswechsel — ein Agent darf sich nicht darauf verlassen,
  dass die sichtbare Ansicht nach einem Aufruf dieselbe ist wie davor.

## Vertragsversion

Jede Antwort trägt `contract` (derzeit `2`), die Beschreibungsantwort
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

Aktionsnamen mit Punkt (`draft.addQuestion`) sind ebenfalls kein Bruch: die
Aktionsform `{ op: 'instance.call', instance, method, args }` bleibt,
`method` bleibt ein String, neu ist nur die Menge seiner Werte. Ein Bump
würde zudem jede gespeicherte Einwilligung als veraltet markieren.

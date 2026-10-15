/**
 * D.Mike — Argumentprüfungen der Agentenfläche (agent-argcheck.js)
 *
 * Die Fehlermeldungen, die jedes freigegebene Modul braucht, an EINER Stelle.
 * Die Regel der Fläche ist „ungültiges Argument wirft, fachliche Absage
 * liefert einen Wert" — geworfen wird hier also, und `agent-ops.js` macht
 * daraus `call_failed` samt Meldung.
 *
 * Grund für die eigene Datei: die Pilotmodule hatten dieselbe Meldung drei
 * Mal gebaut (`unknown … id "x"; available: …`) und das Aufzähl-Argument ein
 * Mal generisch. Die GESTALT der Meldung ist dabei längst Vertrag — ein Agent
 * liest das Listenwort und die Liste dahinter, um seinen Tippfehler selbst zu
 * finden, und die Paritätstests sichern sie mit `toContain` zu. Darum steht
 * sie hier wörtlich so, wie sie vorher an fünf Aufrufstellen stand.
 *
 * Fünf Prüfer, drei Listenwörter — das ist der vollständige Vertrag:
 *
 * | Prüfer | Listenwort | Beispielmeldung |
 * |---|---|---|
 * | `requireEnum`    | `allowed:`  | `invalid mode "x"; allowed: DEG, RAD` |
 * | `requireKnownId` | `available:`| `unknown stepId "x"; available: s-1, s-2` |
 * | `requireIndex`   | `allowed:`  | `invalid idx 9; allowed: 0..3` |
 * | `requireArity`   | `expected:` | `missing argument "values" of setCells; expected: columnId, startRow, values` — ein optionaler Parameter steht darin in Klammerform (`[name]`) |
 * | `requireText`    | `allowed:`  | `invalid text 7; allowed: any string, "" clears it` |
 *
 * Ein neuer Prüfer nimmt eines dieser drei Listenwörter, oder er begründet
 * sein viertes hier.
 *
 * Build-Gate `undeclared_option_source` (agent-data.mjs): hängt das dritte
 * Argument von `requireEnum`/`requireKnownId` an `this` (`this.model.opts`,
 * `Object.keys(this.model.keys())`, `this.columns()`), muss die Lesefläche
 * dieselbe Menge unter diesem Namen nennen — sonst erfährt ein Agent sie nur
 * aus dem Fehlschlag. Konstanten sind frei. Erkennung ist formgebunden;
 * Spread im Array-Literal, `(x ?? [])` und Cache-Variablen sieht sie nicht.
 *
 * Die Kernschicht benutzt von diesen Funktionen genau eine — `requireArity`,
 * aus `agent-ops.js` vor dem Methodenaufruf. Ein fehlendes Argument IST ein
 * ungültiges Argument eines Methodenaufrufs und gehört damit in dieselbe
 * Fehlerform wie die übrigen vier (`call_failed` samt Meldung); die
 * Ablehnungen der Kernschicht an ihren eigenen Stufen bleiben
 * AXI-Fehlerobjekte (`agent-errors.js`).
 */

/**
 * Ein Aufzähl-Argument gegen seine ERKLÄRTE Wertemenge prüfen.
 *
 * Die Oberfläche kann einen Wert daneben nicht erzeugen (eine Liste von
 * `<option>`, zwei Segmentknöpfe), ein Agent schon. Ungeprüft landete er im
 * Model, und eine Engine liest einen unbekannten Wert als ihren letzten
 * `else`-Zweig: der Aufruf meldete Erfolg, das Ergebnis wäre das einer
 * anderen Rechnung, und der falsche Wert wanderte in das Projekt des Nutzers.
 *
 * @param {string} name Name des Arguments (erscheint in der Meldung)
 * @param {any} value der übergebene Wert
 * @param {readonly string[]} allowed die erklärte Wertemenge
 * @throws {Error} wenn `value` nicht in `allowed` steht
 * @returns {void}
 */
export function requireEnum(name, value, allowed) {
  if (!allowed.includes(value)) {
    throw new Error(`invalid ${name} ${JSON.stringify(value)}; allowed: ${allowed.join(', ')}`);
  }
}

/**
 * Eine id gegen die Liste der vorhandenen ids prüfen.
 *
 * Fast jede Mutation eines Models kehrt bei einer unbekannten id STILL
 * zurück. Ohne diese Prüfung bekäme ein Agent, der sich vertippt, Erfolg
 * gemeldet und baute den nächsten Schritt auf Daten, die es nicht gibt. Die
 * Liste der vorhandenen ids gehört in die Meldung, damit er seinen Tippfehler
 * sieht statt zu raten.
 *
 * @param {string} kind Art der id, wie sie in der Meldung steht — der Name
 *   des Parameters (`'columnId'`, `'nodeId'`) oder seine Umschreibung
 *   (`'sheet id'`)
 * @param {any} id der übergebene Wert
 * @param {readonly any[]} availableIds die vorhandenen ids, in Anzeigereihenfolge
 * @throws {Error} wenn `id` nicht in `availableIds` steht
 * @returns {void}
 */
export function requireKnownId(kind, id, availableIds) {
  if (!availableIds.includes(id)) {
    throw new Error(`unknown ${kind} ${JSON.stringify(id)}; available: ${availableIds.join(', ')}`);
  }
}

/**
 * Eine Einfügeposition gegen die aktuelle Länge der Sammlung prüfen.
 *
 * Ein Model, das eine Einfügeposition KLAMMERT (`Math.max(0, Math.min(idx,
 * length))`), tut bei einem Wert außerhalb des gültigen Bereichs still etwas
 * ANDERES als behauptet — negativ landet vorn, zu groß landet hinten, und
 * der Aufruf meldet trotzdem Erfolg. Ein Agent, der sich bei der Lücke
 * vertippt (`idx: 99` auf einer Kette mit drei Schritten), bekäme eine
 * Zusage für eine Position, die es nicht gibt, statt eines Fehlers. Ebenso
 * ein nicht-ganzzahliger Wert (`'x'`), den `Number.isInteger` ausschließt,
 * bevor er lautlos als `NaN`/`0` interpretiert wird.
 *
 * @param {string} name Name des Arguments (erscheint in der Meldung)
 * @param {any} value der übergebene Wert
 * @param {number} length aktuelle Länge der Sammlung — `value === length`
 *   heißt „ans Ende einfügen" und ist gültig
 * @throws {Error} wenn `value` keine ganze Zahl in `[0, length]` ist
 * @returns {void}
 */
export function requireIndex(name, value, length) {
  if (!Number.isInteger(value) || value < 0 || value > length) {
    throw new Error(`invalid ${name} ${JSON.stringify(value)}; allowed: 0..${length}`);
  }
}

/**
 * Die Argumentzahl eines Methodenaufrufs gegen den Parametersatz prüfen.
 *
 * `agent-ops.js` ruft die Senke mit `...(action.args ?? [])` auf: ein
 * WEGGELASSENES Argument kommt als `undefined` an. Eine Senke, die ihren
 * dokumentierten Leerwert (`null`, `''`, `-1`) annimmt, löschte damit bei
 * einem Aufruf mit zu wenigen Argumenten still einen Wert und meldete
 * Erfolg — gemessen an `ce-matrix.setScore(0, 0)`, wo das dritte Argument
 * fehlte und die Bewertung verschwand.
 *
 * Geprüft wird hier und nicht in der Senke: dieselben Senken ruft auch die
 * Oberfläche, und dort ist ein weggelassenes Argument zulässig (der
 * Leistenknopf ruft `addRows()`, Alpine CSP erlaubt im `@click` kein
 * Argument). Eine Prüfung in der Senke bräche also die Bedienung. Der
 * Parametersatz, gegen den geprüft wird, ist der der erzeugten Registry —
 * dieselbe Quelle, aus der der Agent die Signatur liest.
 *
 * Ein ausdrücklich übergebenes `null` bleibt ein Argument: der
 * dokumentierte Leerwert ist weiter erreichbar (Ruling 52).
 *
 * @param {string} method Name der Methode (erscheint in der Meldung)
 * @param {readonly any[]} args die übergebenen Argumente
 * @param {ReadonlyArray<{ name: string, optional?: boolean }>} params der
 *   Parametersatz der Aktion, in Reihenfolge
 * @throws {Error} wenn ein Pflichtargument fehlt
 * @returns {void}
 */
export function requireArity(method, args, params) {
  const list = Array.isArray(params) ? params : [];
  const expected = list.map(p => (p.optional ? `[${p.name}]` : p.name)).join(', ');
  for (let i = 0; i < list.length; i++) {
    if (list[i].optional) continue;
    if (i < args.length) continue;
    throw new Error(`missing argument ${JSON.stringify(list[i].name)} of ${method}; expected: ${expected}`);
  }
}

/**
 * Ein freies Textargument prüfen, dessen dokumentierter Leerwert die leere
 * Zeichenkette ist.
 *
 * Das Eingabefeld der Oberfläche kann nur eine Zeichenkette liefern, ein
 * Agent jeden Typ. Ohne diese Prüfung landete eine Zahl oder ein Objekt im
 * Zustand und tauchte als `[object Object]` in der Anzeige auf. `''` bleibt
 * ausdrücklich zulässig — er ist der dokumentierte Leerwert (Ruling 52).
 *
 * Die Rückgabe erlaubt die Kurzform `this.model.feld = requireText(…)`;
 * Aufrufer, die nur prüfen wollen, ignorieren sie.
 *
 * @param {string} name Name des Arguments (erscheint in der Meldung)
 * @param {any} value der übergebene Wert
 * @throws {Error} wenn `value` keine Zeichenkette ist
 * @returns {string} der geprüfte Text
 */
export function requireText(name, value) {
  if (typeof value !== 'string') {
    throw new Error(`invalid ${name} ${JSON.stringify(value)}; allowed: any string, "" clears it`);
  }
  return value;
}

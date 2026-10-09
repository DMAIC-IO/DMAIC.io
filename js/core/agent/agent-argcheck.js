/**
 * D.Mike — Argumentprüfungen der Agentenfläche (agent-argcheck.js)
 *
 * Die zwei Fehlermeldungen, die jedes freigegebene Modul braucht, an EINER
 * Stelle. Die Regel der Fläche ist „ungültiges Argument wirft, fachliche
 * Absage liefert einen Wert" — geworfen wird hier also, und `agent-ops.js`
 * macht daraus `call_failed` samt Meldung.
 *
 * Grund für die eigene Datei: die Pilotmodule hatten dieselbe Meldung drei
 * Mal gebaut (`unknown … id "x"; available: …`) und das Aufzähl-Argument ein
 * Mal generisch. Die GESTALT der Meldung ist dabei längst Vertrag — ein Agent
 * liest „available:"/„allowed:" und die Liste, um seinen Tippfehler selbst zu
 * finden, und die Paritätstests sichern sie mit `toContain` zu. Darum steht
 * sie hier wörtlich so, wie sie vorher an fünf Aufrufstellen stand.
 *
 * Die Kernschicht selbst benutzt diese Funktionen nicht: ihre eigenen
 * Ablehnungen sind AXI-Fehlerobjekte (`agent-errors.js`), keine Ausnahmen.
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

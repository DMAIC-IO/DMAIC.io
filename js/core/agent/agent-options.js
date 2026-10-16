/**
 * D.Mike — Wählbare Mengen für die Agentenfläche (agent-options.js)
 *
 * Eine bedingte Wertemenge, gegen die eine `@agent`-Aktion prüft, muss in der
 * Lesefläche stehen (Plan E1). Für Spaltenbezüge ist diese Menge in jedem
 * Analysemodul dieselbe Rechnung — sie steht deshalb hier, einmal, und nicht
 * 20-mal im Modul.
 *
 * Rein: kein DOM, kein `window`.
 */
import { discoverColumns, refToKey } from '../../ui/column-picker.js';

/**
 * Die wählbaren Spalten EINES Slots als flache Liste für die Lesefläche.
 *
 * @param {object} stateManager der StateManager aus `module._context`
 * @param {{ types?: string[], minCount?: number, maxCount?: number,
 *   filter?: (col: object) => boolean }} [opts]
 *   dieselben Einschränkungen, die der Wähler DIESES Slots bekommt — der
 *   Spaltentyp heißt `'numeric'`, nicht `'number'`; `filter` hat dieselbe
 *   Bedeutung wie die Wähleroption (Prädikat über den Eintrag aus
 *   `discoverColumns`, angewendet nach Typ und Anzahl)
 * @returns {{ key: string, name: string }[]} je Spalte ihr Schlüssel (die Form,
 *   die `refToKey` erzeugt) und ihr Anzeigename
 */
export function pickableColumnList(stateManager, opts = {}) {
  const cols = discoverColumns(stateManager, opts);
  const kept = typeof opts.filter === 'function' ? cols.filter(opts.filter) : cols;
  return kept.map(col => ({
    key: refToKey(col),
    name: col.columnName || col.shortName || refToKey(col),
  }));
}

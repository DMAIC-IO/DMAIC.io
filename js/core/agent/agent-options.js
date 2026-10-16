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
import { discoverColumns, groupColumnsBySheet, refToKey } from '../../ui/column-picker.js';

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
  return discoverFiltered(stateManager, opts).map(columnEntry);
}

/**
 * Die Ziele einer Übergabe an einen bestehenden Worksheet: je Blatt seine
 * wählbaren Spalten und danach ein Eintrag „neue Spalte“ mit dem Schlüssel
 * `instanceId|sheetId|__new__` — dieselbe Menge und Reihenfolge, die ein
 * Zielwähler mit `allowCreateWorksheet` anbietet (beide gruppieren über
 * `groupColumnsBySheet`).
 *
 * @param {object} stateManager der StateManager aus `module._context`
 * @param {object} [opts] dieselben Einschränkungen wie bei `pickableColumnList`
 * @returns {{ key: string, name: string }[]} je Ziel sein Schlüssel und sein
 *   Anzeigename; ein Eintrag „neue Spalte“ trägt den Namen seines Blatts
 */
export function targetColumnList(stateManager, opts = {}) {
  return groupColumnsBySheet(discoverFiltered(stateManager, opts)).flatMap(({ items, newColumnKey }) => [
    ...items.map(columnEntry),
    { key: newColumnKey, name: items[0].sheetName || newColumnKey },
  ]);
}

function discoverFiltered(stateManager, opts) {
  const cols = discoverColumns(stateManager, opts);
  return typeof opts.filter === 'function' ? cols.filter(opts.filter) : cols;
}

function columnEntry(col) {
  return {
    key: refToKey(col),
    name: col.columnName || col.shortName || refToKey(col),
  };
}

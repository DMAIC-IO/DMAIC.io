/**
 * D.Mike — Fassade für den reaktiven Lesezugriff auf Arbeitsblätter (worksheet-data.js)
 *
 * `ctx.data` im view-Block: dünne Fassade über den Leser `Source`
 * (`core/source.js`) und die reinen Spaltenfunktionen (`core/source-columns.js`).
 * Jedes Lesen hängt dort an die reaktiven Zähler der Arbeitsblatt-Instanz; ein
 * `computed` oder Getter, der so liest, rechnet neu, sobald sich das Blatt
 * ändert. Die Zähler leben in `core/source.js` und werden hier re-exportiert.
 */
import { deferredSource, installWorksheetRevisions, bumpWorksheetRevisions } from './source.js';
import { facadeOf } from './source-columns.js';

export { installWorksheetRevisions, bumpWorksheetRevisions };

/**
 * @typedef {{ instanceId: string, sheetId?: string, columnId: string }} ColumnRef
 * @typedef {{ name: string, type: string, role: string|null, roleConfirmed: boolean }} WorksheetColumnInfo
 * @typedef {{ values: (ref: ColumnRef|null) => any[]|null,
 *   numeric: (ref: ColumnRef|null) => number[]|null,
 *   name: (ref: ColumnRef|null) => string|null,
 *   column: (ref: ColumnRef|null) => WorksheetColumnInfo|null,
 *   columns: (filter?: { types?: string[], minCount?: number }) => { key: string, name: string }[],
 *   sheet: (ref: { instanceId: string, sheetId: string }|null) => { id: string, name: string, rowCount: number, columns: { id: string, name: string, type: string, meta: object|null }[] }|null,
 *   sheets: (instanceId: string|null) => { id: string, name: string, rowCount: number }[]|null }} WorksheetData
 */

/**
 * Lesezugriff auf Arbeitsblattspalten; `column(ref)` liefert Name, Typ, Rolle und Rollenbestätigung (ohne Werte); `columns(filter)` listet die wählbaren Spalten als `{ key, name }` (reaktiv auf jede Änderung und auf neue Arbeitsblätter); `sheet(ref)` nennt Zeilenzahl und Spalten eines Blatts mit ihren Merkmalen (`meta`, Kopie, sonst `null`); `null`, wenn `ref` fehlt oder Blatt/Spalte nicht auflösbar sind.
 * `numeric` liest wie das Arbeitsblatt (`parseNumeric`): Dezimalkomma zählt, Leerwerte, Text und Wahrheitswerte fallen heraus; `Infinity` bleibt ausgeschlossen.
 * @param {{ get: (path: string) => any }} stateManager  mit registriertem Leser (`registerWorksheetReader`)
 * @returns {Readonly<WorksheetData>}
 */
export function createWorksheetData(stateManager) {
  // Lazy: der Leser muss erst beim ersten Lesen registriert sein.
  return Object.freeze(facadeOf(deferredSource(stateManager)));
}

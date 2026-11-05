/**
 * D.Mike — SIPOC: Migrationen des gespeicherten Zustands (Spec E1 §5.2).
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js (das Schema darf sich ändern, die Migration nicht).
 */

/** Spaltenschlüssel im Formatstand 1.0. */
const COLUMN_KEYS_1_0 = ['suppliers', 'inputs', 'process', 'outputs', 'customers'];

/**
 * '0→1.0': Altstände ohne `_schema` — kanonisch `{ columns }` oder nackte
 * Spaltenkarte; fehlende Spalten und Nicht-Arrays werden `[]`, Nicht-Strings
 * fallen heraus, fremde Schlüssel fallen weg.
 * @param {object} json Kopie des gespeicherten Zustands
 * @returns {{ columns: Record<string, string[]> }}
 */
export function from0(json) {
  const hasColumns = json.columns !== null && typeof json.columns === 'object' && !Array.isArray(json.columns);
  const source = hasColumns ? json.columns : json;
  const columns = {};
  for (const key of COLUMN_KEYS_1_0) {
    const list = source[key];
    columns[key] = Array.isArray(list) ? list.filter((v) => typeof v === 'string') : [];
  }
  return { columns };
}

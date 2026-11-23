/**
 * D.Mike — Tortendiagramm: fremde Beispielformen. Rein.
 *
 * Eigene Beispiele tragen schon `datasets` und bleiben unverändert. Fremde
 * Formen liefern einen einzelnen Spaltenbezug (`valueRef`, `defectsRef`,
 * `columnRef`, `colRef`) und optional `labelRef`; daraus wird eine Zeile
 * `datasets`. Alle anderen Schlüssel fallen weg.
 */

/**
 * Fremde Beispielform in die eigene übersetzen.
 * @param {Record<string, any>} data
 * @param {{ id?: string, title?: object }} _meta
 * @returns {Record<string, any>}
 */
export function fromExample(data, _meta) {
  if (Array.isArray(data.datasets)) return data;
  const value = data.valueRef || data.defectsRef || data.columnRef || data.colRef || null;
  const label = data.labelRef || null;
  /** @type {Record<string, any>} */
  const out = {};
  if (data.sourceWorksheetData) out.sourceWorksheetData = data.sourceWorksheetData;
  if (value || label) out.datasets = [{ value, label }];
  return out;
}

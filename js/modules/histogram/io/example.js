/**
 * D.Mike — Histogramm: fremde Beispielformen. Rein.
 *
 * Das Histogramm lädt auch Beispiele anderer Module: ein einzelner
 * Spaltenbezug (`columnRef`, `colRef`, `seriesRefs`, `colRefsK`) oder ein
 * CSV-Datensatz wird zu einer Zeile `datasets`.
 */

/**
 * Fremde Beispielform in die eigene übersetzen; fremde Schlüssel fallen weg.
 * @param {Record<string, any>} data
 * @param {{ id?: string, title?: object }} meta
 * @param {{ csvToWorksheet: (data: object, meta: object) => object|null }} helpers
 * @returns {Record<string, any>}
 */
export function fromExample(data, meta, { csvToWorksheet }) {
  if (Array.isArray(data.datasets)) return data;
  let source = data.sourceWorksheetData;
  let ref = data.columnRef || data.colRef
    || (Array.isArray(data.seriesRefs) ? data.seriesRefs[0] : null)
    || (Array.isArray(data.colRefsK) ? data.colRefsK[0] : null) || null;
  if (!source && !ref && Array.isArray(data.columns)) {
    source = /** @type {any} */ (csvToWorksheet(data, meta));
    if (source) ref = { instanceId: '__source__', sheetId: source.activeSheetId, columnId: 'c-0' };
  }
  /** @type {Record<string, any>} */
  const out = {};
  if (source) out.sourceWorksheetData = source;
  if (ref) out.datasets = [{ valueRef: ref, groupRef: null }];
  return out;
}

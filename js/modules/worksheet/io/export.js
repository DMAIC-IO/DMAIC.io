/**
 * D.Mike — Arbeitsblatt: Exporte (io/export.js)
 *
 * Mapper-Rohform für den Export des aktiven Blatts, wie die Altform
 * (`DataGrid.downloadCSV/XLSX/JSON`): Kopf aus Name oder Kurzname, Zeilen in
 * Spaltenreihenfolge. Dateien, Trenner und Meldungen baut der Kern
 * (`core/exporter.js`).
 *
 * Rein: kein DOM, kein i18n.
 */

/** Name des Blatts in der XLSX-Datei, wie in der Altform. */
export const XLSX_SHEET_NAME = 'Data';

/**
 * Die Spaltenköpfe eines Blatts: Name, sonst Kurzname.
 * @param {any} sheet @returns {string[]}
 */
export function headersOf(sheet) {
  return sheet.columns.map((/** @type {{ name: string, shortName: string }} */ c) => c.name || c.shortName);
}

/**
 * Kopfzeile und Datenzeilen eines Blatts (CSV, XLSX).
 * @param {any} sheet @returns {Array<Array<string|number|boolean|null>>}
 */
export function sheetRows(sheet) {
  const { rowCount, columns } = sheet.data;
  const rows = [headersOf(sheet)];
  for (let r = 0; r < rowCount; r++) rows.push(columns.map((/** @type {any[]} */ col) => col[r] ?? null));
  return rows;
}

/**
 * Die Zeilen eines Blatts als Objekte, Schlüssel = Spaltenkopf (JSON).
 * @param {any} sheet @returns {Array<Record<string, string|number|boolean|null>>}
 */
export function sheetRecords(sheet) {
  const heads = headersOf(sheet);
  const { rowCount, columns } = sheet.data;
  const out = [];
  for (let r = 0; r < rowCount; r++) {
    /** @type {Record<string, any>} */
    const row = {};
    heads.forEach((h, c) => { row[h] = columns[c][r] ?? null; });
    out.push(row);
  }
  return out;
}

/**
 * D.Mike — Arbeitsblatt: Exporte (io/export.js)
 *
 * Mapper-Rohform für den Export des aktiven Blatts, wie die Altform
 * (`DataGrid.downloadCSV/XLSX/JSON`): Kopf aus Name oder Kurzname, Zeilen in
 * Spaltenreihenfolge. Die Rohform baut der Kern (`core/datagrid/table/export.js`,
 * auch für die Vorschau des DoE-Planers); hier nur der Zuschnitt aufs Blatt.
 *
 * Rein: kein DOM, kein i18n.
 */
import { gridHeaders, gridRows, gridRecords, gridCsv } from '../../../core/datagrid/table/export.js';

export { XLSX_SHEET_NAME, EXPORT_FILE_NAME } from '../../../core/datagrid/table/export.js';

/**
 * Die Spaltenköpfe eines Blatts: Name, sonst Kurzname.
 * @param {any} sheet @returns {string[]}
 */
export function headersOf(sheet) {
  return gridHeaders(sheet.columns);
}

/**
 * Kopfzeile und Datenzeilen eines Blatts (CSV, XLSX).
 * @param {any} sheet @returns {Array<Array<string|number|boolean|null>>}
 */
export function sheetRows(sheet) {
  return gridRows(sheet.columns, sheet.data);
}

/**
 * Die Zeilen eines Blatts als Objekte, Schlüssel = Spaltenkopf (JSON).
 * @param {any} sheet @returns {Array<Record<string, string|number|boolean|null>>}
 */
export function sheetRecords(sheet) {
  return gridRecords(sheet.columns, sheet.data);
}

/**
 * CSV-Text des Blatts, zeichengleich zur Altform (`DataGrid.exportToCSV`),
 * siehe `gridCsv`.
 * @param {any} sheet @param {string} lang App-Sprache (`de` | `en`)
 * @returns {string}
 */
export function sheetCsv(sheet, lang) {
  return gridCsv(sheet.columns, sheet.data, lang);
}

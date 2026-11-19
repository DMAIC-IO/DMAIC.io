/**
 * D.Mike — Raster: Exporte einer Tabelle (core/datagrid/table/export.js)
 *
 * Rohform für den Export einer Tabelle des Rasters, wie die Altform
 * (`DataGrid.downloadCSV/XLSX/JSON`): Kopf aus Name oder Kurzname, Zeilen in
 * Spaltenreihenfolge. Genutzt vom Arbeitsblatt (aktives Blatt) und von der
 * Vorschau des DoE-Planers. XLSX und JSON baut der Kern (`core/exporter.js`);
 * den CSV-Text baut `gridCsv` zeichengleich zur Altform (`DataGrid.exportToCSV`).
 *
 * Rein: kein DOM, kein i18n.
 */
import { formatGridLossless } from '../datagrid-utils.js';
import { decimalSeparator } from '../../number-format.js';

/**
 * Spaltenkopf und Werte, wie der Export sie liest.
 * @typedef {{ name?: string, shortName?: string, format?: { decimals?: number|null }|null }} ExportColumn
 * @typedef {{ rowCount: number, columns: any[][] }} ExportData
 */

/** Name des Blatts in der XLSX-Datei, wie in der Altform. */
export const XLSX_SHEET_NAME = 'Data';

/** Dateiname ohne Endung, wie in der Altform (`data.csv`, `data.xlsx`, `data.json`). */
export const EXPORT_FILE_NAME = 'data';

/** Trenner der CSV-Datei, wie in der Altform. */
const CSV_DELIMITER = ';';

/**
 * Die Spaltenköpfe: Name, sonst Kurzname.
 * @param {ExportColumn[]} columns @returns {string[]}
 */
export function gridHeaders(columns) {
  return columns.map((c) => c.name || c.shortName || '');
}

/**
 * Kopfzeile und Datenzeilen (CSV, XLSX).
 * @param {ExportColumn[]} columns @param {ExportData} data
 * @returns {Array<Array<string|number|boolean|null>>}
 */
export function gridRows(columns, data) {
  const rows = [gridHeaders(columns)];
  for (let r = 0; r < data.rowCount; r++) rows.push(data.columns.map((col) => col[r] ?? null));
  return rows;
}

/**
 * Die Zeilen als Objekte, Schlüssel = Spaltenkopf (JSON).
 * @param {ExportColumn[]} columns @param {ExportData} data
 * @returns {Array<Record<string, string|number|boolean|null>>}
 */
export function gridRecords(columns, data) {
  const heads = gridHeaders(columns);
  const out = [];
  for (let r = 0; r < data.rowCount; r++) {
    /** @type {Record<string, any>} */
    const row = {};
    heads.forEach((h, c) => { row[h] = data.columns[c][r] ?? null; });
    out.push(row);
  }
  return out;
}

/**
 * Ein Text der CSV-Datei: in Anführungszeichen nur, wenn er Trenner,
 * Anführungszeichen oder Zeilenumbruch enthält.
 * @param {string} s @returns {string}
 */
function csvField(s) {
  if (s.includes(CSV_DELIMITER) || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * CSV-Text, zeichengleich zur Altform (`DataGrid.exportToCSV`): Zeile
 * `sep=;`, Kopf, Zeilen mit `\r\n`, ohne Umbruch am Schluss. Zahlen ohne
 * Anführungszeichen mit dem Dezimalzeichen der Sprache und den
 * Nachkommastellen der Spalte (`format.decimals`), Wahrheitswerte als
 * `true`/`false`, leere Zellen leer. Ein Kopf mit Trenner, Anführungszeichen
 * oder Umbruch steht in Anführungszeichen (die Altform ließ ihn roh).
 * @param {ExportColumn[]} columns @param {ExportData} data
 * @param {string} lang App-Sprache (`de` | `en`)
 * @returns {string}
 */
export function gridCsv(columns, data, lang) {
  const decimal = decimalSeparator(lang);
  const numLang = decimal === ',' ? 'de' : 'en';
  const decimals = columns.map((c) => c.format?.decimals);
  const lines = [`sep=${CSV_DELIMITER}`, gridHeaders(columns).map(csvField).join(CSV_DELIMITER)];
  for (let r = 0; r < data.rowCount; r++) {
    const cells = data.columns.map((col, c) => {
      const v = col[r];
      if (v == null) return '';
      if (typeof v === 'number') {
        // Das Dezimalzeichen (`,` oder `.`) ist nie der Trenner `;`: kein Quoting.
        return formatGridLossless(v, decimals[c], numLang);
      }
      return csvField(String(v));
    });
    lines.push(cells.join(CSV_DELIMITER));
  }
  return lines.join('\r\n');
}

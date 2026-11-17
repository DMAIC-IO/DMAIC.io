/**
 * D.Mike — Arbeitsblatt: Exporte (io/export.js)
 *
 * Mapper-Rohform für den Export des aktiven Blatts, wie die Altform
 * (`DataGrid.downloadCSV/XLSX/JSON`): Kopf aus Name oder Kurzname, Zeilen in
 * Spaltenreihenfolge. XLSX und JSON baut der Kern (`core/exporter.js`); den
 * CSV-Text baut `sheetCsv` zeichengleich zur Altform (`DataGrid.exportToCSV`).
 *
 * Rein: kein DOM, kein i18n.
 */
import { formatGridLossless } from '../../../core/datagrid/datagrid-utils.js';
import { decimalSeparator } from '../../../core/number-format.js';

/** Name des Blatts in der XLSX-Datei, wie in der Altform. */
export const XLSX_SHEET_NAME = 'Data';

/** Dateiname ohne Endung, wie in der Altform (`data.csv`, `data.xlsx`, `data.json`). */
export const EXPORT_FILE_NAME = 'data';

/** Trenner der CSV-Datei, wie in der Altform. */
const CSV_DELIMITER = ';';

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
 * CSV-Text des Blatts, zeichengleich zur Altform (`DataGrid.exportToCSV`):
 * Zeile `sep=;`, Kopf, Zeilen mit `\r\n`, ohne Umbruch am Schluss. Zahlen
 * ohne Anführungszeichen mit dem Dezimalzeichen der Sprache und den
 * Nachkommastellen der Spalte (`format.decimals`), Wahrheitswerte als
 * `true`/`false`, leere Zellen leer. Ein Kopf mit Trenner, Anführungszeichen
 * oder Umbruch steht in Anführungszeichen (die Altform ließ ihn roh).
 * @param {any} sheet @param {string} lang App-Sprache (`de` | `en`)
 * @returns {string}
 */
export function sheetCsv(sheet, lang) {
  const decimal = decimalSeparator(lang);
  const numLang = decimal === ',' ? 'de' : 'en';
  const { rowCount, columns } = sheet.data;
  const decimals = sheet.columns.map((/** @type {{ format?: { decimals?: number } }} */ c) => c.format?.decimals);
  const lines = [`sep=${CSV_DELIMITER}`, headersOf(sheet).map(csvField).join(CSV_DELIMITER)];
  for (let r = 0; r < rowCount; r++) {
    const cells = columns.map((/** @type {any[]} */ col, /** @type {number} */ c) => {
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

/**
 * D.Mike — XLSX / XLSM / XLS / ODS Parser (xlsx-parser.js)
 *
 * Reads spreadsheet files via SheetJS (bundled from node_modules via core/vendor/xlsx.js).
 * Each sheet in the workbook becomes one entry in the output `sheets[]`,
 * preserving the sheet name from the source file. Column types (numeric/text)
 * are detected from the raw JS types SheetJS produces.
 *
 * Output schema matches mpx-parser.js / csv-parser.js — see data-import.js.
 */

import { ensureXLSX, XLSX } from '../../core/export-utils.js';

/** ≥80% non-empty cells with finite numeric value → numeric column. */
function detectColumnType(values) {
  let numeric = 0;
  let nonEmpty = 0;
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    nonEmpty++;
    if (typeof v === 'number' && Number.isFinite(v)) numeric++;
  }
  if (nonEmpty === 0) return 'text';
  return (numeric / nonEmpty) >= 0.8 ? 'numeric' : 'text';
}

/** Format a JS Date in compact ISO; drop trailing midnight time. */
function formatDate(d) {
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const hms = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  return hms === '00:00:00' ? ymd : `${ymd} ${hms}`;
}

/** Convert raw SheetJS values into our internal cell representation. */
function normalize(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return formatDate(v);
  if (typeof v === 'string') return v === '' ? null : v;
  return String(v);
}

/** Force every cell to numeric or null. */
function coerceNumeric(values) {
  return values.map((v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = String(v).trim().replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  });
}

/** Force every cell to string or null (preserving null for empties). */
function toText(values) {
  return values.map((v) => {
    if (v === null || v === undefined) return null;
    return typeof v === 'string' ? v : String(v);
  });
}

/**
 * Parse an XLSX/XLSM/XLS/ODS file from an ArrayBuffer.
 *
 * @param {ArrayBuffer} buffer
 * @param {{hasHeader?:boolean}} [opts]
 * @returns {Promise<{format:string, sheets:Array<object>}>}
 */
export async function parseXlsx(buffer, opts = {}) {
  await ensureXLSX();
  const hasHeader = opts.hasHeader !== false;

  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  } catch (err) {
    const e = new Error(`xlsx parse: ${  err.message}`);
    e.code = 'errXlsxParse';
    throw e;
  }

  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    const e = new Error('No sheets in workbook');
    e.code = 'errXlsxEmpty';
    throw e;
  }

  const sheets = [];
  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      blankrows: false,
      raw: true,
    });

    if (!rows.length) continue;

    let colCount = 0;
    for (const r of rows) if (r.length > colCount) colCount = r.length;
    if (colCount === 0) continue;

    const headerRow = hasHeader ? rows[0] : null;
    const dataRows = hasHeader ? rows.slice(1) : rows;

    const columns = [];
    for (let c = 0; c < colCount; c++) {
      const rawHeader = headerRow && headerRow[c] != null
        ? String(headerRow[c]).trim()
        : '';
      const colName = rawHeader || `C${c + 1}`;
      const rawValues = dataRows.map((r) =>
        normalize(c < r.length ? r[c] : null)
      );
      const type = detectColumnType(rawValues);
      columns.push({
        name: colName,
        shortName: `C${c + 1}`,
        type,
        values: type === 'numeric' ? coerceNumeric(rawValues) : toText(rawValues),
      });
    }

    if (columns.length === 0) continue;
    sheets.push({
      name,
      rowCount: dataRows.length,
      columns,
    });
  }

  if (sheets.length === 0) {
    const e = new Error('No data found in any sheet');
    e.code = 'errXlsxEmpty';
    throw e;
  }

  return { format: 'xlsx', sheets };
}

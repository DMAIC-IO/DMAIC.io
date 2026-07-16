/**
 * D.Mike — CSV / TSV Parser (csv-parser.js)
 *
 * Reads delimited text files (CSV, TSV, semicolon-, pipe-separated) using
 * PapaParse (bundled from node_modules). Encoding can be chosen because
 * Excel-exported CSVs are commonly Windows-1252 / Latin-1 rather than UTF-8.
 * The delimiter is auto-detected by default but can be overridden.
 *
 * Output schema matches mpx-parser.js — see data-import.js for the contract.
 */

import { Papa } from '../../core/vendor/papaparse.js';

/**
 * Resolve with the bundled PapaParse. Kept async for existing
 * `await loadPapa()` call sites.
 * @returns {Promise<object>}
 */
function loadPapa() {
  return Promise.resolve(Papa);
}

/** Decode a buffer with the given encoding, replacing invalid bytes. */
function decode(buffer, encoding) {
  try {
    return new TextDecoder(encoding, { fatal: false }).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Filename → stem without extension, used as the sheet name. */
function basename(filename) {
  if (!filename) return 'Sheet 1';
  const noPath = filename.replace(/^.*[\\/]/, '');
  const stem = noPath.replace(/\.[^.]+$/, '');
  return stem || noPath;
}

const NUMERIC_RE = /^-?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?$/;

/** ≥80% non-empty values parse as finite numbers → numeric column. */
function detectColumnType(values) {
  let numeric = 0;
  let nonEmpty = 0;
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    nonEmpty++;
    const s = String(v).trim();
    if (NUMERIC_RE.test(s)) numeric++;
  }
  if (nonEmpty === 0) return 'text';
  return (numeric / nonEmpty) >= 0.8 ? 'numeric' : 'text';
}

/** Coerce strings to numbers; accepts both "." and "," as decimal separator. */
function coerceNumeric(values) {
  return values.map(v => {
    if (v === null || v === undefined || v === '') return null;
    const s = String(v).trim().replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  });
}

const DELIMITER_MAP = {
  comma: ',',
  semicolon: ';',
  tab: '\t',
  pipe: '|',
};

/** Resolve a user-facing delimiter key to a literal character (or '' for auto). */
function resolveDelimiter(key) {
  if (!key || key === 'auto') return '';
  if (key in DELIMITER_MAP) return DELIMITER_MAP[key];
  return key;
}

/**
 * Parse a CSV/TSV ArrayBuffer.
 *
 * @param {ArrayBuffer} buffer
 * @param {{filename?:string, delimiter?:string, encoding?:string, hasHeader?:boolean, skipRows?:number}} [opts]
 * @returns {Promise<{format:string, sheets:Array<object>}>}
 */
export async function parseCsv(buffer, opts = {}) {
  const Papa = await loadPapa();
  const encoding = opts.encoding || 'utf-8';
  const hasHeader = opts.hasHeader !== false;
  const skipRows = Math.max(0, Math.floor(Number(opts.skipRows) || 0));
  let text = stripBom(decode(buffer, encoding));

  // CMM presets (Zeiss CALYPSO, Hexagon PC-DMIS …) often prepend metadata
  // lines before the actual column header. Drop them before delimiter-detect.
  if (skipRows > 0) {
    const lines = text.split(/\r?\n/);
    text = lines.slice(skipRows).join('\n');
  }

  if (!text.trim()) {
    const e = new Error('Empty CSV file');
    e.code = 'errCsvEmpty';
    throw e;
  }

  const result = Papa.parse(text, {
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
    delimiter: resolveDelimiter(opts.delimiter),
  });

  const rows = (result && result.data) || [];
  if (rows.length === 0) {
    const e = new Error('CSV contains no parseable rows');
    e.code = 'errCsvEmpty';
    throw e;
  }

  let colCount = 0;
  for (const r of rows) if (r.length > colCount) colCount = r.length;
  if (colCount === 0) {
    const e = new Error('No columns in CSV');
    e.code = 'errCsvEmpty';
    throw e;
  }

  const headerRow = hasHeader ? rows[0] : null;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const columns = [];
  for (let c = 0; c < colCount; c++) {
    const rawName = headerRow && headerRow[c] != null ? String(headerRow[c]).trim() : '';
    const name = rawName || `C${c + 1}`;
    const stringValues = dataRows.map(r => {
      const v = c < r.length ? r[c] : null;
      if (v === null || v === undefined) return null;
      const s = String(v);
      return s === '' ? null : s;
    });
    const type = detectColumnType(stringValues);
    columns.push({
      name,
      shortName: `C${c + 1}`,
      type,
      values: type === 'numeric' ? coerceNumeric(stringValues) : stringValues,
    });
  }

  return {
    format: 'csv',
    sheets: [{
      name: basename(opts.filename),
      rowCount: dataRows.length,
      columns,
    }],
  };
}

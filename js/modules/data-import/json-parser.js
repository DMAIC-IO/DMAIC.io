/**
 * D.Mike — JSON / NDJSON Parser (json-parser.js)
 *
 * Supports the three JSON flavors that appear in practice for tabular data:
 *
 *   1. Records array (the format the worksheet itself emits):
 *        [{"name": "A", "value": 1}, {"name": "B", "value": 2}]
 *      → keys form column names (in insertion order of the first record).
 *
 *   2. Column-oriented object:
 *        {"name": ["A", "B"], "value": [1, 2]}
 *      → top-level keys are column names, values are arrays of equal length.
 *
 *   3. NDJSON / JSONL (one record per line; common for streaming logs):
 *        {"name": "A", "value": 1}
 *        {"name": "B", "value": 2}
 *      → each line is parsed as a record.
 *
 * Wrapper objects (`{"data": [...]}`, `{"rows": [...]}`, `{"records": [...]}`)
 * are unwrapped automatically when the wrapped value is a records array.
 *
 * Output schema matches the other parsers — see data-import.js.
 */

const NDJSON_EXTS = new Set(['ndjson', 'jsonl']);

function filenameStem(filename) {
  if (!filename) return 'Sheet 1';
  const noPath = filename.replace(/^.*[\\/]/, '');
  return noPath.replace(/\.[^.]+$/, '') || noPath;
}

function extOf(filename) {
  const m = /\.([^.]+)$/.exec(filename || '');
  return m ? m[1].toLowerCase() : '';
}

/** Read an ArrayBuffer as UTF-8 text and strip an optional BOM. */
function decodeUtf8(buffer) {
  const s = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** ≥80% non-empty values are finite numbers → numeric column. */
function detectColumnType(values) {
  let numeric = 0;
  let nonEmpty = 0;
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    nonEmpty++;
    if (typeof v === 'number' && Number.isFinite(v)) numeric++;
  }
  if (nonEmpty === 0) return 'text';
  return numeric / nonEmpty >= 0.8 ? 'numeric' : 'text';
}

function coerceNumeric(values) {
  return values.map((v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = String(v).trim().replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  });
}

/** Stringify everything except null/undefined; booleans become "true"/"false". */
function toText(values) {
  return values.map((v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string') return v === '' ? null : v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return JSON.stringify(v);
  });
}

/** Records-array → column dictionary preserving first-record key order. */
function recordsToColumns(records) {
  const colOrder = [];
  const colSeen = new Set();
  for (const rec of records) {
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) continue;
    for (const k of Object.keys(rec)) {
      if (!colSeen.has(k)) { colSeen.add(k); colOrder.push(k); }
    }
  }
  return colOrder.map((name) => ({
    name,
    values: records.map((rec) => {
      if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return null;
      const v = rec[name];
      return v === undefined ? null : v;
    }),
  }));
}

/** Column-oriented object {col: [v1,v2,...]} where every value is an array. */
function isColumnOrientedObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  if (keys.length === 0) return false;
  return keys.every((k) => Array.isArray(obj[k]));
}

function columnObjectToColumns(obj) {
  const keys = Object.keys(obj);
  const maxLen = keys.reduce((m, k) => Math.max(m, obj[k].length), 0);
  return keys.map((name) => {
    const arr = obj[name];
    const values = new Array(maxLen);
    for (let i = 0; i < maxLen; i++) values[i] = i < arr.length ? arr[i] : null;
    return { name, values };
  });
}

/** Try to interpret a parsed JSON value as a tabular dataset → columns. */
function interpretJson(parsed) {
  if (Array.isArray(parsed)) {
    return recordsToColumns(parsed);
  }
  if (parsed && typeof parsed === 'object') {
    for (const key of ['data', 'rows', 'records']) {
      if (Array.isArray(parsed[key])) return recordsToColumns(parsed[key]);
    }
    if (isColumnOrientedObject(parsed)) return columnObjectToColumns(parsed);
  }
  return null;
}

/** Parse NDJSON: one record per non-empty line. */
function parseNdjson(text) {
  const records = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let rec;
    try {
      rec = JSON.parse(trimmed);
    } catch (err) {
      const e = new Error(`Invalid NDJSON line: ${  err.message}`);
      e.code = 'errJsonParse';
      throw e;
    }
    records.push(rec);
  }
  return records;
}

/** Final assembly: typed columns with shortName + rowCount. */
function finalize(rawColumns) {
  const maxLen = rawColumns.reduce((m, c) => Math.max(m, c.values.length), 0);
  return rawColumns.map((col, i) => {
    const padded = col.values.length === maxLen
      ? col.values
      : col.values.concat(new Array(maxLen - col.values.length).fill(null));
    const norm = padded.map((v) => {
      if (v === null || v === undefined) return null;
      if (typeof v === 'string') return v === '' ? null : v;
      return v;
    });
    const type = detectColumnType(norm);
    return {
      name: col.name || `C${i + 1}`,
      shortName: `C${i + 1}`,
      type,
      values: type === 'numeric' ? coerceNumeric(norm) : toText(norm),
    };
  });
}

/**
 * @param {ArrayBuffer} buffer
 * @param {{filename?:string}} [opts]
 * @returns {Promise<{format:string, sheets:Array<object>}>}
 */
export async function parseJson(buffer, opts = {}) {
  const text = decodeUtf8(buffer).trim();
  if (!text) {
    const e = new Error('Empty JSON file');
    e.code = 'errJsonEmpty';
    throw e;
  }

  const ext = extOf(opts.filename);
  const ndjsonByExt = NDJSON_EXTS.has(ext);

  let columns;

  if (ndjsonByExt) {
    columns = recordsToColumns(parseNdjson(text));
  } else {
    let parsed;
    try {
      parsed = JSON.parse(text);
      columns = interpretJson(parsed);
    } catch {
      // Fall through to NDJSON heuristic — first non-blank line must parse.
      try {
        columns = recordsToColumns(parseNdjson(text));
      } catch {
        columns = null;
      }
    }
  }

  if (!columns || columns.length === 0) {
    const e = new Error('No tabular data recognized');
    e.code = 'errJsonStructure';
    throw e;
  }

  const finalized = finalize(columns);
  const rowCount = finalized[0]?.values.length ?? 0;
  if (rowCount === 0) {
    const e = new Error('No data rows');
    e.code = 'errJsonEmpty';
    throw e;
  }

  return {
    format: 'json',
    sheets: [{
      name: filenameStem(opts.filename),
      rowCount,
      columns: finalized,
    }],
  };
}

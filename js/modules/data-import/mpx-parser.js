/**
 * D.Mike — Minitab .mpx Parser (mpx-parser.js)
 *
 * .mpx is a ZIP archive (OPC packaging, like .xlsx) containing one of two
 * worksheet representations, depending on the Minitab version that wrote it:
 *
 *   A) Modern JSON format (Minitab 21+): `project_metadata_NN.json` lists
 *      worksheets, each `sheets/N/sheet.json` describes its columns, and the
 *      raw cell data lives in `blobs/blobN` (numeric = Float64 LE array,
 *      text = UTF-16 LE strings terminated by U+0000).
 *
 *   B) Legacy XML format (older Minitab, .mwx-style): worksheet data is
 *      embedded directly in XML payloads inside the archive. Minitab does not
 *      publish the schema, so this parser uses three heuristics:
 *        1. Element-based:  <Column Name="..." Type="..."> with <Value>… children.
 *        2. Tabular:        OOXML-style <row><c><v>…</v></c></row> grouped by column index.
 *        3. Cell-based:     repeated <Cell ColumnIndex="i" RowIndex="j">value</Cell>.
 *
 * The parser auto-detects the format: if any `sheets/N/sheet.json` entry is
 * present it takes the JSON path, otherwise it falls back to the XML strategies.
 *
 * Output schema:
 * {
 *   format: 'mpx',
 *   sheets: [
 *     {
 *       name: string,
 *       columns: [{ name, shortName, type: 'numeric'|'text', values: any[] }],
 *       rowCount: number,
 *     }
 *   ],
 * }
 */

import { readZip, bytesToText } from './zip-reader.js';

/**
 * Parse a Minitab .mpx file from an ArrayBuffer.
 * @param {ArrayBuffer} buffer
 * @returns {Promise<{format:string, sheets:Array<object>}>}
 */
export async function parseMpx(buffer) {
  let entries;
  try {
    entries = await readZip(buffer);
  } catch (err) {
    const e = new Error(`zip: ${  err.message}`);
    e.code = 'errZip';
    throw e;
  }

  // Prefer the JSON layout when present (Minitab 21+ writes only this).
  const jsonSheets = _tryParseJsonMpx(entries);
  if (jsonSheets && jsonSheets.length > 0) {
    return { format: 'mpx', sheets: jsonSheets };
  }

  // Fall back to the legacy XML strategies.
  const sheets = [];
  let sheetCounter = 0;

  for (const [path, bytes] of entries) {
    if (!_looksLikeWorksheetXml(path)) continue;
    const xml = bytesToText(bytes);
    const doc = _parseXml(xml);
    if (!doc) continue;

    const parsedSheets = _extractSheets(doc, path);
    for (const sheet of parsedSheets) {
      if (sheet.columns.length === 0) continue;
      if (!sheet.name) sheet.name = `Worksheet ${++sheetCounter}`;
      sheets.push(sheet);
    }
  }

  if (sheets.length === 0) {
    const e = new Error('No recognizable Minitab worksheet data found.');
    e.code = 'errMpxStructure';
    throw e;
  }

  return { format: 'mpx', sheets };
}

// ─── JSON-style mpx (Minitab 21+) ────────────────────────────────

/**
 * Detect & parse the JSON-style .mpx layout. Returns an array of sheets
 * (possibly empty) on success, or `null` if the archive doesn't carry the
 * expected JSON files.
 * @param {Map<string,Uint8Array>} entries
 */
function _tryParseJsonMpx(entries) {
  const sheetPaths = [];
  for (const path of entries.keys()) {
    if (/^sheets\/\d+\/sheet\.json$/i.test(path)) sheetPaths.push(path);
  }
  if (sheetPaths.length === 0) return null;

  sheetPaths.sort((a, b) => {
    const ia = parseInt(a.match(/sheets\/(\d+)/i)[1], 10);
    const ib = parseInt(b.match(/sheets\/(\d+)/i)[1], 10);
    return ia - ib;
  });

  // Pull worksheet display names from project_metadata_*.json if present.
  const nameByUriBase = new Map();
  let metaEntry = null;
  for (const path of entries.keys()) {
    if (/^project_metadata(_\d+)?\.json$/i.test(path)) { metaEntry = path; break; }
  }
  if (metaEntry) {
    const meta = _parseJsonEntry(entries.get(metaEntry));
    const items = meta?.Worksheets?.Items;
    if (Array.isArray(items)) {
      for (const item of items) {
        if (item?.Uri && item?.Name) {
          const base = String(item.Uri).replace(/^\/+/, '').replace(/\.json$/i, '');
          nameByUriBase.set(base, String(item.Name));
        }
      }
    }
  }

  const sheets = [];
  for (let i = 0; i < sheetPaths.length; i++) {
    const path = sheetPaths[i];
    const json = _parseJsonEntry(entries.get(path));
    if (!json) continue;

    const sheet = _buildJsonSheet(json, entries);
    if (!sheet || sheet.columns.length === 0) continue;

    if (!sheet.name) {
      const baseKey = path.replace(/\.json$/i, '');
      sheet.name = nameByUriBase.get(baseKey) || `Worksheet ${i + 1}`;
    }
    sheets.push(sheet);
  }
  return sheets;
}

function _parseJsonEntry(bytes) {
  if (!bytes) return null;
  try {
    return JSON.parse(bytesToText(bytes));
  } catch {
    return null;
  }
}

/**
 * Build one sheet from a parsed `sheet.json`. Columns reference blob entries
 * via URIs like `/blobs/blob1?size=1000`.
 */
function _buildJsonSheet(sheetJson, entries) {
  const data = sheetJson?.Data;
  if (!data || !Array.isArray(data.Columns)) return null;

  const sheetName = (data.PrivateTitle || data.Name || '').toString().trim();
  const columns = [];

  for (let i = 0; i < data.Columns.length; i++) {
    const col = data.Columns[i];
    const body = col?.WorksheetVarBody;
    const varBody = body?.VarData?.VarDataBody;
    if (!body || !varBody) continue;

    const colName = (body.Name || '').toString().trim() || `C${i + 1}`;
    const cellCt = Number.isFinite(varBody.CellCt) ? varBody.CellCt : 0;

    let type, values;
    if (varBody.HasTextData && typeof varBody.TextData === 'string') {
      type = 'text';
      values = _readTextBlob(entries, varBody.TextData, cellCt);
    } else if (varBody.HasNumericData && typeof varBody.NumericData === 'string') {
      type = 'numeric';
      values = _readNumericBlob(entries, varBody.NumericData, cellCt);
    } else {
      // Unknown variable type (e.g. date/time, formula). Skip — keeping the
      // surrounding columns intact is more useful than failing the import.
      continue;
    }

    columns.push({
      name: colName,
      shortName: `C${i + 1}`,
      type,
      values,
    });
  }

  if (columns.length === 0) return null;

  // Trim trailing empty rows shared across all columns — Minitab pre-allocates
  // CellCt slots (commonly 1000) even when only a fraction is filled.
  const populatedRows = _trailingNullCutoff(columns);
  for (const c of columns) c.values.length = populatedRows;

  return { name: sheetName, columns, rowCount: populatedRows };
}

/**
 * Return the row count after stripping trailing rows where every column is
 * null/empty. We keep interior nulls intact (they are real missing values).
 */
function _trailingNullCutoff(columns) {
  let n = 0;
  for (const c of columns) if (c.values.length > n) n = c.values.length;
  while (n > 0) {
    let allEmpty = true;
    for (const c of columns) {
      const v = c.values[n - 1];
      if (v != null && v !== '') { allEmpty = false; break; }
    }
    if (!allEmpty) break;
    n--;
  }
  return n;
}

/**
 * Decode a numeric blob: a contiguous array of IEEE-754 Float64 values,
 * little-endian. The blob URI looks like `/blobs/blob2?size=1000`.
 */
function _readNumericBlob(entries, uri, cellCt) {
  const path = _resolveBlobPath(uri);
  const bytes = path ? entries.get(path) : null;
  if (!bytes) return new Array(cellCt).fill(null);

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const available = Math.floor(bytes.byteLength / 8);
  const count = cellCt > 0 ? Math.min(cellCt, available) : available;
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    const v = view.getFloat64(i * 8, true);
    out[i] = _isMissingNumeric(v) ? null : v;
  }
  while (cellCt > 0 && out.length < cellCt) out.push(null);
  return out;
}

/**
 * Minitab stores numeric missing values either as IEEE NaN or as the sentinel
 * 1.0e30 (the published "max value" in the .mpx numeric format). Anything
 * outside the finite range, or whose absolute value crosses 1e29, is treated
 * as missing.
 */
function _isMissingNumeric(v) {
  if (!Number.isFinite(v)) return true;
  if (Math.abs(v) >= 1e29) return true;
  return false;
}

/**
 * Decode a text blob: UTF-16 LE strings (with a BOM at the start), each cell
 * terminated by U+0000. The blob URI looks like `/blobs/blob1?size=1000`.
 */
function _readTextBlob(entries, uri, cellCt) {
  const path = _resolveBlobPath(uri);
  const bytes = path ? entries.get(path) : null;
  if (!bytes) return new Array(cellCt).fill(null);

  let off = 0;
  let encoding = 'utf-16le';
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    off = 2;
  } else if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    off = 2;
    encoding = 'utf-16be';
  }
  const decoder = new TextDecoder(encoding);

  const out = [];
  let start = off;
  for (let i = off; i + 1 < bytes.length; i += 2) {
    if (bytes[i] === 0 && bytes[i + 1] === 0) {
      const chunk = bytes.subarray(start, i);
      const s = chunk.byteLength > 0 ? decoder.decode(chunk) : '';
      out.push(s === '' ? null : s);
      start = i + 2;
      if (cellCt > 0 && out.length >= cellCt) break;
    }
  }
  if (start < bytes.length && (cellCt <= 0 || out.length < cellCt)) {
    // eslint-disable-next-line no-control-regex -- strip trailing NUL padding from decoded MPX bytes
    const tail = decoder.decode(bytes.subarray(start)).replace(/ +$/, '');
    if (tail !== '') out.push(tail);
  }
  while (cellCt > 0 && out.length < cellCt) out.push(null);
  return out;
}

/**
 * Extract the entry path from a blob URI like `/blobs/blob1?size=1000` →
 * `blobs/blob1`. Returns null for empty / unparseable URIs.
 */
function _resolveBlobPath(uri) {
  if (!uri || typeof uri !== 'string') return null;
  const trimmed = uri.trim();
  if (trimmed === '') return null;
  return trimmed.replace(/^\/+/, '').split('?')[0];
}

// ─── XML entry filtering ──────────────────────────────────────────

function _looksLikeWorksheetXml(path) {
  const lower = path.toLowerCase();
  if (!lower.endsWith('.xml') && !lower.endsWith('.mwx')) return false;
  if (lower === '[content_types].xml') return false;
  if (lower.startsWith('_rels/') || lower.includes('/_rels/')) return false;
  if (lower.endsWith('.rels')) return false;
  // Skip obvious non-data metadata files.
  if (/(?:^|\/)project\.xml$/.test(lower)) return false;
  if (/(?:^|\/)graph\d*\.xml$/.test(lower)) return false;
  if (/(?:^|\/)report\d*\.xml$/.test(lower)) return false;
  if (/(?:^|\/)settings\.xml$/.test(lower)) return false;
  if (/(?:^|\/)theme\d*\.xml$/.test(lower)) return false;
  if (/(?:^|\/)styles\.xml$/.test(lower)) return false;
  return true;
}

// ─── XML parsing ──────────────────────────────────────────────────

function _parseXml(text) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) return null;
    return doc;
  } catch {
    return null;
  }
}

// ─── Sheet extraction ─────────────────────────────────────────────

/**
 * Try each strategy on the document and return the first non-empty result.
 * @returns {Array<{name:string, columns:Array, rowCount:number}>}
 */
function _extractSheets(doc, path) {
  const results = [];

  // Strategy 1 — element-per-column with <Value> children
  const colNodes = _findColumnElements(doc);
  if (colNodes.length > 0) {
    const sheet = _buildSheetFromColumnElements(colNodes, doc, path);
    if (sheet.columns.length > 0) results.push(sheet);
    return results;
  }

  // Strategy 2 — OOXML-style sheetData / row / c structure
  const rowNodes = _findRowElements(doc);
  if (rowNodes.length > 0) {
    const sheet = _buildSheetFromRows(rowNodes, doc, path);
    if (sheet.columns.length > 0) results.push(sheet);
    return results;
  }

  // Strategy 3 — flat <Cell> elements with row/column indices
  const cellNodes = _findIndexedCells(doc);
  if (cellNodes.length > 0) {
    const sheet = _buildSheetFromIndexedCells(cellNodes, doc, path);
    if (sheet.columns.length > 0) results.push(sheet);
    return results;
  }

  return results;
}

// ── Helpers ──────────────────────────────────────────────────────

/** Compare element local names case-insensitively (XML namespaces often add prefixes). */
function _localName(el) {
  return (el.localName || el.nodeName || '').toLowerCase();
}

function _attr(el, ...names) {
  for (const n of names) {
    const v = el.getAttribute(n) ?? el.getAttribute(n.toLowerCase()) ?? el.getAttribute(n.toUpperCase());
    if (v != null && v !== '') return v;
  }
  return null;
}

function _trim(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

function _sheetNameFromDoc(doc, path) {
  // Try common metadata holders first.
  const candidates = ['Worksheet', 'worksheet', 'Sheet', 'sheet', 'WorksheetName', 'Name'];
  for (const tag of candidates) {
    const nodes = doc.getElementsByTagName(tag);
    for (const n of nodes) {
      const name = _attr(n, 'Name', 'name', 'Title', 'title');
      if (name) return name;
    }
  }
  // Fall back to the file name.
  const file = path.split('/').pop().replace(/\.(xml|mwx)$/i, '');
  return file || '';
}

function _classifyType(values) {
  if (values.length === 0) return 'numeric';
  let numericCount = 0;
  let nonNullCount = 0;
  for (const v of values) {
    if (v == null || v === '') continue;
    nonNullCount++;
    if (typeof v === 'number' && Number.isFinite(v)) numericCount++;
  }
  if (nonNullCount === 0) return 'numeric';
  return numericCount === nonNullCount ? 'numeric' : 'text';
}

function _coerceCellValue(raw, hintedType) {
  const s = _trim(raw);
  if (s === '' || s === '*') return null; // Minitab's missing-value marker is "*"
  if (hintedType === 'text') return s;
  // Try numeric (supports both "." and "," decimal separators)
  const numeric = _toNumber(s);
  if (numeric != null) return numeric;
  return hintedType === 'numeric' ? null : s;
}

function _toNumber(s) {
  if (s == null) return null;
  const t = String(s).trim();
  if (t === '') return null;
  // Handle comma decimal separators if no period present.
  const cleaned = t.includes(',') && !t.includes('.') ? t.replace(',', '.') : t;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function _typeFromHint(hint) {
  if (!hint) return null;
  const h = hint.toLowerCase();
  if (/(numeric|number|double|float|int|real)/.test(h)) return 'numeric';
  if (/(text|string|alpha|cat)/.test(h)) return 'text';
  if (/(date|time)/.test(h)) return 'text'; // dates -> text for now
  return null;
}

// ─── Strategy 1: column-shaped elements ───────────────────────────

function _findColumnElements(doc) {
  const tags = ['Column', 'column', 'Col', 'col', 'DataColumn', 'WorksheetColumn'];
  const seen = new Set();
  const out = [];
  for (const tag of tags) {
    const nodes = doc.getElementsByTagName(tag);
    for (const n of nodes) {
      // Require at least one direct child element that holds a value.
      // Otherwise we'd grab metadata <Column ...> markers from Project.xml.
      if (!_hasValueChildren(n)) continue;
      if (seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

function _hasValueChildren(el) {
  for (const child of el.children) {
    const ln = _localName(child);
    if (/^(value|v|cell|item|datum|d)$/.test(ln)) return true;
  }
  return false;
}

function _buildSheetFromColumnElements(colNodes, doc, path) {
  const columns = [];
  for (let i = 0; i < colNodes.length; i++) {
    const node = colNodes[i];
    const nameAttr = _attr(node, 'Name', 'name', 'Title', 'title', 'Label', 'label');
    const typeAttr = _attr(node, 'Type', 'type', 'DataType', 'dataType');
    const shortAttr = _attr(node, 'ShortName', 'shortName', 'Id', 'id', 'Ref', 'ref');

    const rawValues = [];
    for (const child of node.children) {
      const ln = _localName(child);
      if (/^(value|v|cell|item|datum|d)$/.test(ln)) {
        rawValues.push(child.textContent ?? '');
      }
    }
    const hintedType = _typeFromHint(typeAttr);
    const values = rawValues.map(v => _coerceCellValue(v, hintedType));
    const type = hintedType || _classifyType(values);

    columns.push({
      name: nameAttr || shortAttr || `C${i + 1}`,
      shortName: shortAttr || `C${i + 1}`,
      type,
      values: type === 'text'
        ? values.map(v => v == null ? null : String(v))
        : values.map(v => typeof v === 'number' ? v : (v == null ? null : _toNumber(v))),
    });
  }
  const rowCount = columns.reduce((m, c) => Math.max(m, c.values.length), 0);
  for (const c of columns) while (c.values.length < rowCount) c.values.push(null);

  return { name: _sheetNameFromDoc(doc, path), columns, rowCount };
}

// ─── Strategy 2: row/cell tabular ────────────────────────────────

function _findRowElements(doc) {
  // OOXML style: sheetData > row > c > v
  // Minitab-ish style: Rows > Row > Cell
  const candidates = ['row', 'Row', 'Tr', 'tr'];
  for (const tag of candidates) {
    const nodes = doc.getElementsByTagName(tag);
    if (nodes.length > 0) return Array.from(nodes);
  }
  return [];
}

function _buildSheetFromRows(rowNodes, doc, path) {
  /** @type {Array<Array<string|null>>} */
  const grid = [];
  for (const row of rowNodes) {
    const rowVals = [];
    for (const cell of row.children) {
      const ln = _localName(cell);
      if (!/^(c|cell|td|column|d)$/.test(ln)) continue;
      // OOXML <c><v>1.5</v></c>; otherwise text content.
      const v = cell.querySelector(':scope > v, :scope > V, :scope > Value, :scope > value');
      const text = v ? v.textContent : cell.textContent;
      rowVals.push(_trim(text));
    }
    if (rowVals.length > 0) grid.push(rowVals);
  }
  if (grid.length === 0) return { name: '', columns: [], rowCount: 0 };

  const colCount = grid.reduce((m, r) => Math.max(m, r.length), 0);
  // Try to detect a header row: first row consists entirely of non-numeric strings
  // and no other row matches it as a header (heuristic).
  const headerCandidate = grid[0];
  const headerLooksLikeHeader = headerCandidate.every(c =>
    c !== '' && _toNumber(c) == null && c.length < 64
  ) && grid.length > 1;

  const dataRows = headerLooksLikeHeader ? grid.slice(1) : grid;
  const headers = headerLooksLikeHeader ? headerCandidate : null;

  const columns = [];
  for (let i = 0; i < colCount; i++) {
    const rawValues = dataRows.map(r => r[i] ?? '');
    const tentative = rawValues.map(v => _coerceCellValue(v, null));
    const type = _classifyType(tentative);
    const values = type === 'text'
      ? rawValues.map(v => v === '' ? null : v)
      : rawValues.map(v => _toNumber(v));
    columns.push({
      name: headers ? headers[i] || `C${i + 1}` : `C${i + 1}`,
      shortName: `C${i + 1}`,
      type,
      values,
    });
  }
  const rowCount = dataRows.length;
  return { name: _sheetNameFromDoc(doc, path), columns, rowCount };
}

// ─── Strategy 3: indexed cells ────────────────────────────────────

function _findIndexedCells(doc) {
  const cells = doc.getElementsByTagName('Cell');
  if (cells.length === 0) return [];
  // Need cells with row+column indices for this strategy.
  const valid = [];
  for (const c of cells) {
    const r = _attr(c, 'RowIndex', 'rowIndex', 'Row', 'row', 'r');
    const ci = _attr(c, 'ColumnIndex', 'columnIndex', 'Column', 'column', 'c');
    if (r == null || ci == null) continue;
    valid.push({ el: c, row: parseInt(r, 10), col: parseInt(ci, 10) });
  }
  return valid;
}

function _buildSheetFromIndexedCells(cells, doc, path) {
  let maxRow = 0, maxCol = 0;
  for (const { row, col } of cells) {
    if (row > maxRow) maxRow = row;
    if (col > maxCol) maxCol = col;
  }
  const cols = maxCol + 1;
  const rows = maxRow + 1;
  /** @type {string[][]} */
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(''));
  for (const { el, row, col } of cells) {
    grid[row][col] = _trim(el.textContent);
  }
  const columns = [];
  for (let i = 0; i < cols; i++) {
    const rawValues = grid.map(r => r[i] ?? '');
    const tentative = rawValues.map(v => _coerceCellValue(v, null));
    const type = _classifyType(tentative);
    const values = type === 'text'
      ? rawValues.map(v => v === '' ? null : v)
      : rawValues.map(v => _toNumber(v));
    columns.push({
      name: `C${i + 1}`,
      shortName: `C${i + 1}`,
      type,
      values,
    });
  }
  return { name: _sheetNameFromDoc(doc, path), columns, rowCount: rows };
}

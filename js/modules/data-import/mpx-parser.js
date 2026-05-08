/**
 * D.Mike — Minitab .mpx Parser (mpx-parser.js)
 *
 * .mpx is a ZIP archive (OPC packaging, like .xlsx) containing XML files
 * that describe a Minitab project's worksheets. Minitab does not publish
 * the schema, so this parser uses heuristics over the contained XML to
 * extract column names, types, and values.
 *
 * Strategies, in order:
 *   1. Element-based:  <Column Name="..." Type="..."> with <Value>… children.
 *   2. Tabular:        OOXML-style <row><c><v>…</v></c></row> grouped by column index.
 *   3. Cell-based:     repeated <Cell ColumnIndex="i" RowIndex="j">value</Cell>.
 *
 * The parser walks every XML entry in the archive that looks like worksheet
 * content (skipping `[Content_Types].xml`, `_rels/`, and `Project.xml`-style
 * metadata). Each worksheet XML produces one sheet in the output.
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
    const e = new Error('zip: ' + err.message);
    e.code = 'errZip';
    throw e;
  }

  const sheets = [];
  let sheetCounter = 0;

  // Walk all XML entries that could be worksheet payloads.
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
      let text;
      const v = cell.querySelector(':scope > v, :scope > V, :scope > Value, :scope > value');
      text = v ? v.textContent : cell.textContent;
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

/**
 * D.Mike — Q-DAS AQDEF Parser (aqdef-parser.js)
 *
 * AQDEF (Advanced Quality Data Exchange Format, Q-DAS) is the de-facto
 * standard for SPC and measurement data in DACH industry (Bosch, Daimler,
 * VW, ZF, Continental, …). Files use the extensions `.dfq` (combined
 * definition + data), `.dfd` (definition only), or `.dfx` (data only).
 *
 * The format is line-oriented plain text with "K-Schlüssel" (K-keys):
 *
 *   K<key>[/<charIdx>] <value>
 *
 * where `charIdx` (1-based) refers to one of the characteristics defined
 * in the file. Important keys this parser uses:
 *
 *   K0100        — number of characteristics
 *   K1001/n      — part order / charge (sheet name fallback)
 *   K1002/n      — part description (sheet name fallback)
 *   K2001/n      — characteristic number / code  (column-name fallback)
 *   K2002/n      — characteristic description    (column name, preferred)
 *   K2142/n      — unit (currently informational only)
 *   K0001/n VAL  — single measurement value for characteristic n
 *   K0002/n VAL  — attribute / count value for characteristic n
 *
 * After the metadata block, files often contain a compact data section
 * with one row per measurement and values separated by `;`, `\t`, space,
 * `|`, or `,`. We auto-detect the delimiter against the known number of
 * characteristics and distribute values left-to-right.
 *
 * Output schema matches the other parsers — see data-import.js.
 */

/** Decode buffer with fallback. */
function decode(buffer, encoding) {
  try {
    return new TextDecoder(encoding, { fatal: false }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function basename(filename) {
  if (!filename) return 'AQDEF';
  const noPath = filename.replace(/^.*[\\/]/, '');
  return noPath.replace(/\.[^.]+$/, '') || noPath;
}

const KEY_RE = /^K(\d{4})(?:\/(\d+))?\s+(.*)$/;

const DATA_DELIMITER_CANDIDATES = ['\t', ';', '|', ',', /\s+/];

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

/** German decimal comma is common in AQDEF — accept both. */
function parseNumber(s) {
  if (s == null) return null;
  const trimmed = String(s).trim();
  if (!trimmed) return null;
  const norm = trimmed.replace(',', '.');
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

function coerceNumeric(values) {
  return values.map((v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    return parseNumber(v);
  });
}

function toText(values) {
  return values.map((v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string') return v === '' ? null : v;
    return String(v);
  });
}

/** Find the row delimiter that splits the most lines into exactly `expected` tokens. */
function pickDelimiter(lines, expected) {
  if (expected <= 1) return null;
  let best = { delim: null, hits: 0 };
  for (const delim of DATA_DELIMITER_CANDIDATES) {
    let hits = 0;
    for (const line of lines) {
      const parts = typeof delim === 'string'
        ? line.split(delim)
        : line.trim().split(delim);
      if (parts.length === expected) hits++;
    }
    if (hits > best.hits) best = { delim, hits };
  }
  return best.hits > 0 ? best.delim : null;
}

function splitRow(line, delim) {
  return typeof delim === 'string' ? line.split(delim) : line.trim().split(delim);
}

/**
 * @param {ArrayBuffer} buffer
 * @param {{filename?:string, encoding?:string}} [opts]
 * @returns {Promise<{format:string, sheets:Array<object>}>}
 */
export async function parseAqdef(buffer, opts = {}) {
  // AQDEF is conventionally Windows-1252; allow override and handle UTF-8 BOM.
  const requested = opts.encoding || 'windows-1252';
  const head = new Uint8Array(buffer.slice(0, 3));
  const hasUtf8Bom = head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf;
  const encoding = hasUtf8Bom ? 'utf-8' : requested;
  const text = stripBom(decode(buffer, encoding));
  if (!text.trim()) {
    const e = new Error('Empty AQDEF file');
    e.code = 'errAqdefEmpty';
    throw e;
  }

  const lines = text.split(/\r?\n/);

  // Pass 1 — collect K-key metadata + verbose K0001/K0002 values.
  /** @type {Map<number, {name:string, code:string, values:Array}>} */
  const chars = new Map();
  const ensureChar = (idx) => {
    if (!chars.has(idx)) chars.set(idx, { name: '', code: '', values: [] });
    return chars.get(idx);
  };
  let declaredCount = 0;
  let partDescription = '';
  let partCharge = '';
  /** Lines that don't match a K-key — candidates for the compact data section. */
  const dataLines = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    if (!line.trim()) continue;
    if (!line.startsWith('K')) {
      dataLines.push(line);
      continue;
    }
    const m = KEY_RE.exec(line);
    if (!m) {
      dataLines.push(line);
      continue;
    }
    const key = m[1];
    const idx = m[2] ? parseInt(m[2], 10) : 0;
    const value = m[3].trim();

    switch (key) {
      case '0100':
        declaredCount = parseInt(value, 10) || 0;
        break;
      case '1001':
        if (idx === 1 || idx === 0) partCharge = value;
        break;
      case '1002':
        if (idx === 1 || idx === 0) partDescription = value;
        break;
      case '2001':
        if (idx > 0) ensureChar(idx).code = value;
        break;
      case '2002':
        if (idx > 0) ensureChar(idx).name = value;
        break;
      case '0001':  // single variable value
      case '0002':  // attribute / count value
        if (idx > 0) {
          const num = parseNumber(value);
          ensureChar(idx).values.push(num !== null ? num : value);
        }
        break;
      default:
        // K2101 nominal, K2110/2111 spec limits, K2142 unit etc. — informational
        // only for now; future enhancement could expose them as column metadata.
        if (key.startsWith('2') && idx > 0) {
          ensureChar(idx);  // touch so the characteristic exists
        }
        break;
    }
  }

  // Pass 2 — apply the compact data section (lines without K-keys).
  // Use the declared characteristic count (K0100) or the highest /n seen.
  const knownIndices = [...chars.keys()].sort((a, b) => a - b);
  const expected = declaredCount > 0
    ? declaredCount
    : (knownIndices.length || 0);

  if (expected > 0 && dataLines.length > 0) {
    const delim = pickDelimiter(dataLines, expected);
    if (delim !== null) {
      // Ensure all expected characteristics exist (data may use 1..expected).
      for (let i = 1; i <= expected; i++) ensureChar(i);
      for (const line of dataLines) {
        if (!line.trim()) continue;
        const parts = splitRow(line, delim);
        if (parts.length !== expected) continue;
        for (let i = 0; i < expected; i++) {
          const raw = parts[i].trim();
          const num = parseNumber(raw);
          ensureChar(i + 1).values.push(num !== null ? num : raw || null);
        }
      }
    }
  }

  if (chars.size === 0) {
    const e = new Error('No AQDEF characteristics found');
    e.code = 'errAqdefStructure';
    throw e;
  }

  // Build columns in characteristic-index order.
  const sortedIdx = [...chars.keys()].sort((a, b) => a - b);
  const maxLen = sortedIdx.reduce((m, i) => Math.max(m, chars.get(i).values.length), 0);

  const columns = sortedIdx.map((idx, colPos) => {
    const c = chars.get(idx);
    const name = c.name || c.code || `Merkmal ${idx}`;
    const padded = c.values.length === maxLen
      ? c.values
      : c.values.concat(new Array(maxLen - c.values.length).fill(null));
    const type = detectColumnType(padded);
    return {
      name,
      shortName: `C${colPos + 1}`,
      type,
      values: type === 'numeric' ? coerceNumeric(padded) : toText(padded),
    };
  });

  if (maxLen === 0) {
    const e = new Error('AQDEF has metadata but no values');
    e.code = 'errAqdefEmpty';
    throw e;
  }

  const sheetName = partDescription || partCharge || basename(opts.filename);
  return {
    format: 'aqdef',
    sheets: [{
      name: sheetName,
      rowCount: maxLen,
      columns,
    }],
  };
}

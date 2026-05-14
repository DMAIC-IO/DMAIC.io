/**
 * D.Mike — DataGrid Utilities (datagrid-utils.js)
 * Shared helper functions, column type definitions, cell formatting & parsing.
 */

// ─── ID & Math ─────────────────────────────────────────────

/** Generate a unique column id. */
export function uid() {
  return 'col_' + Math.random().toString(36).substring(2, 10);
}

/** Clamp a value between min and max. */
export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// ─── Number Parsing & Formatting ───────────────────────────

/**
 * Parse a value as a number, supporting comma-as-decimal (German).
 * @param {*} str
 * @returns {number|null}
 */
export function parseNumeric(str) {
  if (str == null || str === '') return null;
  if (typeof str === 'number') return isNaN(str) ? null : str;
  let s = String(str).trim();
  let n = Number(s);
  if (!isNaN(n) && s !== '') return n;
  // Handle comma as decimal separator (German)
  s = s.replace(/\./g, '').replace(',', '.');
  n = Number(s);
  if (!isNaN(n) && s !== '') return n;
  return null;
}

/**
 * Format a number for display.
 * @param {number} val
 * @param {number|null} decimals
 * @returns {string}
 */
export function formatNumber(val, decimals = null) {
  if (val == null) return '';
  if (decimals != null) return val.toFixed(decimals);
  let s = String(val);
  if (s.includes('e') || s.includes('E')) return val.toPrecision(6);
  return s;
}

// ─── Column Type Definitions ───────────────────────────────

/**
 * Supported column types with display metadata.
 * Labels are used as fallback; the worksheet module uses i18n keys.
 */
export const COLUMN_TYPES = {
  numeric:  { label: 'Numeric',  badge: '#',   isNumeric: true  },
  text:     { label: 'Text',     badge: 'Abc', isNumeric: false },
  date:     { label: 'Date',     badge: '\u{1F4C5}', isNumeric: false },
  time:     { label: 'Time',     badge: '\u{1F550}', isNumeric: false },
  currency: { label: 'Currency', badge: '\u20AC',  isNumeric: true  },
  percent:  { label: 'Percent',  badge: '%',   isNumeric: true  },
  binary:   { label: 'Binary',   badge: '01',  isNumeric: true  },
};

/** @param {string} type @returns {boolean} */
export function isNumericType(type) {
  return COLUMN_TYPES[type]?.isNumeric ?? false;
}

// ─── Cell Display Formatting ───────────────────────────────

/**
 * Supported date format patterns. Stored as `col.format.dateFormat`.
 * Keys are persisted; values are user-facing examples for the picker.
 */
export const DATE_FORMATS = Object.freeze({
  'dd.MM.yyyy':   '31.12.2025',
  'yyyy-MM-dd':   '2025-12-31',
  'dd/MM/yyyy':   '31/12/2025',
  'MM/dd/yyyy':   '12/31/2025',
  'd. MMMM yyyy': '31. Dezember 2025',
});

/** Supported time format patterns. Stored as `col.format.timeFormat`. */
export const TIME_FORMATS = Object.freeze({
  'HH:mm':    '14:30',
  'HH:mm:ss': '14:30:45',
});

const MONTH_NAMES_DE = ['Januar', 'Februar', 'M\u00E4rz', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function pad2(n) { return String(n).padStart(2, '0'); }

function formatDate(dt, pattern) {
  const y = dt.getFullYear();
  const m = dt.getMonth() + 1;
  const d = dt.getDate();
  switch (pattern) {
    case 'yyyy-MM-dd':   return `${y}-${pad2(m)}-${pad2(d)}`;
    case 'dd/MM/yyyy':   return `${pad2(d)}/${pad2(m)}/${y}`;
    case 'MM/dd/yyyy':   return `${pad2(m)}/${pad2(d)}/${y}`;
    case 'd. MMMM yyyy': return `${d}. ${MONTH_NAMES_DE[m - 1]} ${y}`;
    case 'dd.MM.yyyy':
    default:             return `${pad2(d)}.${pad2(m)}.${y}`;
  }
}

function formatTime(timeStr, pattern) {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(timeStr);
  if (!match) return timeStr;
  const hh = pad2(match[1]);
  const mm = match[2];
  const ss = match[3] ?? '00';
  return pattern === 'HH:mm:ss' ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}

/**
 * Format a cell value for display based on column type & format.
 * @param {{ type: string, format: object }} col
 * @param {*} val
 * @returns {string}
 */
export function formatCellValue(col, val) {
  if (val == null) return '';
  switch (col.type) {
    case 'numeric':
      return (typeof val === 'number') ? formatNumber(val, col.format.decimals) : String(val);
    case 'currency':
      if (typeof val === 'number') {
        const d = col.format.decimals ?? 2;
        const sym = col.format.currencySymbol || '\u20AC';
        return formatNumber(val, d) + ' ' + sym;
      }
      return String(val);
    case 'percent':
      if (typeof val === 'number') {
        const d = col.format.decimals ?? 1;
        return formatNumber(val, d) + ' %';
      }
      return String(val);
    case 'binary':
      if (val === 0 || val === 1) return String(val);
      if (typeof val === 'number') return val ? '1' : '0';
      return String(val);
    case 'date': {
      if (!val) return '';
      const pattern = col.format.dateFormat || 'dd.MM.yyyy';
      try {
        const dt = new Date(val);
        if (!isNaN(dt)) return formatDate(dt, pattern);
      } catch { /* ignore */ }
      return String(val);
    }
    case 'time': {
      if (!val) return '';
      const pattern = col.format.timeFormat || 'HH:mm';
      if (typeof val === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(val)) {
        return formatTime(val, pattern);
      }
      try {
        const dt = new Date(val);
        if (!isNaN(dt)) {
          const hh = pad2(dt.getHours());
          const mm = pad2(dt.getMinutes());
          const ss = pad2(dt.getSeconds());
          return pattern === 'HH:mm:ss' ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
        }
      } catch { /* ignore */ }
      return String(val);
    }
    case 'text':
    default:
      return String(val);
  }
}

// ─── Cell Input Parsing ────────────────────────────────────

/**
 * Parse raw user input into the appropriate value for the column type.
 * @param {{ type: string }} col
 * @param {string} raw
 * @returns {*}
 */
export function parseCellInput(col, raw) {
  if (raw === '' || raw == null) return null;
  switch (col.type) {
    case 'numeric':
    case 'currency':
    case 'percent': {
      let cleaned = String(raw).trim()
        .replace(/[€$£¥]/g, '')
        .replace(/%/g, '')
        .trim();
      return parseNumeric(cleaned);
    }
    case 'binary': {
      if (raw === 0 || raw === 1) return raw;
      const s = String(raw).trim();
      if (s === '0') return 0;
      if (s === '1') return 1;
      return null;
    }
    case 'date': {
      const s = String(raw).trim();
      const deMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
      if (deMatch) {
        const y = deMatch[3].length === 2 ? '20' + deMatch[3] : deMatch[3];
        return `${y}-${deMatch[2].padStart(2, '0')}-${deMatch[1].padStart(2, '0')}`;
      }
      const dt = new Date(s);
      if (!isNaN(dt)) return dt.toISOString().split('T')[0];
      return s;
    }
    case 'time': {
      const s = String(raw).trim();
      if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) return s;
      if (/^\d{1,2}$/.test(s)) {
        const h = parseInt(s);
        if (h >= 0 && h <= 23) return `${h}:00`;
      }
      if (/^\d{1,2}[.,]\d+$/.test(s)) {
        const n = parseFloat(s.replace(',', '.'));
        if (n >= 0 && n < 24) {
          const h = Math.floor(n);
          const m = Math.round((n - h) * 60);
          return `${h}:${String(m).padStart(2, '0')}`;
        }
      }
      const dt = new Date(s);
      if (!isNaN(dt)) return dt.toTimeString().substring(0, 5);
      return s;
    }
    case 'text':
    default:
      return String(raw);
  }
}

/**
 * Detect the most likely column type from raw user input.
 * Priority: currency > percent > date > time > numeric > null (= text)
 * @param {string} raw
 * @returns {{ type: string, value: * }|null}
 */
export function detectInputType(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();

  // Currency: "3 €", "€3", "$5.00"
  const currencyMatch = s.match(/^([€$£¥])\s*(.+)$|^(.+?)\s*([€$£¥])$/);
  if (currencyMatch) {
    const numPart = (currencyMatch[2] || currencyMatch[3] || '').trim();
    const n = parseNumeric(numPart);
    if (n !== null) return { type: 'currency', value: n };
  }

  // Percent: "10%", "10 %"
  const percentMatch = s.match(/^(.+?)\s*%$/);
  if (percentMatch) {
    const n = parseNumeric(percentMatch[1].trim());
    if (n !== null) return { type: 'percent', value: n };
  }

  // Date: DD.MM.YYYY (German)
  const deDate = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (deDate) {
    const day = parseInt(deDate[1]), month = parseInt(deDate[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const y = deDate[3].length === 2 ? '20' + deDate[3] : deDate[3];
      return { type: 'date', value: `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
    }
  }
  // Date: DD/MM/YYYY
  const slashDate = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashDate) {
    const day = parseInt(slashDate[1]), month = parseInt(slashDate[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const y = slashDate[3].length === 2 ? '20' + slashDate[3] : slashDate[3];
      return { type: 'date', value: `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
    }
  }
  // Date: YYYY-MM-DD (ISO)
  const isoDate = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDate) {
    const month = parseInt(isoDate[2]), day = parseInt(isoDate[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return { type: 'date', value: s };
    }
  }

  // Time: "14:30", "8:00", "14:30:00"
  const timeMatch = s.match(/^(\d{1,2}):(\d{2})(:\d{2})?$/);
  if (timeMatch) {
    const h = parseInt(timeMatch[1]);
    const m = parseInt(timeMatch[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return { type: 'time', value: s };
    }
  }

  // Plain numeric
  const n = parseNumeric(s);
  if (n !== null) return { type: 'numeric', value: n };

  return null;
}

// ─── Column Analysis ──────────────────────────────────────

/**
 * Normalize a text value for exact-match cluster comparison.
 *
 * Conservative folding only — case, whitespace, ß, and combining diacritics.
 * Aggressive typo detection (e.g. Mueller ↔ Muller) is handled separately by
 * the fuzzy phase via {@link damerauLevenshtein}.
 *
 * Stages:
 *   1. NFKC, trim, collapse internal whitespace, locale-aware lowercase.
 *   2. ß → ss (universal German transliteration).
 *   3. NFD + strip combining marks (\p{M}). Catches: Müller→muller (¨ stripped),
 *      café→cafe, naïve→naive, Straße→strasse (after step 2).
 *
 * Result: Müller/Muller exact-match. Mueller stays distinct (caught by fuzzy).
 * @param {string} s
 * @returns {string}
 */
export function normalizeTextForClustering(s) {
  let n = String(s).normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  n = n.replace(/ß/g, 'ss');
  n = n.normalize('NFD').replace(/\p{M}+/gu, '').normalize('NFC');
  return n;
}

/**
 * Damerau-Levenshtein edit distance with optional cap for early termination.
 * Counts insertions, deletions, substitutions, and adjacent transpositions
 * (so "teh" ↔ "the" = 1). Returns `maxDist + 1` when distance exceeds the cap,
 * which lets callers prune impossible matches cheaply.
 * @param {string} a
 * @param {string} b
 * @param {number} [maxDist=Infinity]
 * @returns {number}
 */
export function damerauLevenshtein(a, b, maxDist = Infinity) {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > maxDist) return maxDist + 1;
  if (la === 0) return lb;
  if (lb === 0) return la;

  // Two-row + transposition row, Damerau variant.
  let prevPrev = new Array(lb + 1);
  let prev = new Array(lb + 1);
  let curr = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    const ai = a.charCodeAt(i - 1);
    const aim1 = i > 1 ? a.charCodeAt(i - 2) : -1;
    for (let j = 1; j <= lb; j++) {
      const bj = b.charCodeAt(j - 1);
      const cost = ai === bj ? 0 : 1;
      let v = Math.min(
        curr[j - 1] + 1,    // insert
        prev[j] + 1,        // delete
        prev[j - 1] + cost, // substitute
      );
      if (i > 1 && j > 1 && ai === b.charCodeAt(j - 2) && aim1 === bj) {
        v = Math.min(v, prevPrev[j - 2] + 1); // transposition
      }
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > maxDist) return maxDist + 1;
    [prevPrev, prev, curr] = [prev, curr, prevPrev];
  }
  return prev[lb];
}

/** Adaptive edit-distance threshold by token length. */
function fuzzyThresholdFor(len) {
  if (len < 4) return 0;       // too short — too many false positives
  if (len <= 7) return 1;
  if (len <= 11) return 2;
  return 3;
}

/**
 * Analyze a column's values and classify each cell by detected data type.
 * Determines the dominant type from actual values (ignores declared column type)
 * and reports cells that deviate from the majority as outliers. For text-typed
 * values, also groups raw variants that collapse to the same normalized form
 * (case- and whitespace-folded) so the user can spot likely typos.
 * @param {{ type: string, values: Array<*> }} col
 * @param {number} rowCount
 * @returns {{ total: number, empty: number, dominantType: string|null, types: Object<string, { count: number, rows: number[] }>, outliers: { count: number, rows: number[], values: string[], types: string[] }, textClusters: Array<{ normalForm: string, total: number, variants: Array<{ value: string, count: number, firstRow: number }> }> }}
 */
export function analyzeColumn(col, rowCount) {
  const total = rowCount;
  let empty = 0;
  const types = {};
  const clusterMap = new Map(); // normForm → Map<rawValue, { count, firstRow }>

  for (let i = 0; i < rowCount; i++) {
    const val = col.values[i];

    if (val == null || val === '') {
      empty++;
      continue;
    }

    let detectedType;
    if (typeof val === 'number') {
      detectedType = 'numeric';
    } else {
      const detected = detectInputType(String(val));
      detectedType = detected ? detected.type : 'text';
    }

    if (!types[detectedType]) types[detectedType] = { count: 0, rows: [] };
    types[detectedType].count++;
    types[detectedType].rows.push(i);

    if (detectedType === 'text') {
      const raw = String(val);
      const norm = normalizeTextForClustering(raw);
      let variants = clusterMap.get(norm);
      if (!variants) { variants = new Map(); clusterMap.set(norm, variants); }
      let entry = variants.get(raw);
      if (!entry) { entry = { count: 0, firstRow: i }; variants.set(raw, entry); }
      entry.count++;
    }
  }

  let dominantType = null;
  let maxCount = 0;
  for (const [type, info] of Object.entries(types)) {
    if (info.count > maxCount) {
      maxCount = info.count;
      dominantType = type;
    }
  }

  const outliers = { count: 0, rows: [], values: [], types: [] };
  if (dominantType && Object.keys(types).length > 1) {
    for (const [type, info] of Object.entries(types)) {
      if (type === dominantType) continue;
      for (const row of info.rows) {
        outliers.count++;
        outliers.rows.push(row);
        outliers.values.push(String(col.values[row]));
        outliers.types.push(type);
      }
    }
    outliers.rows.sort((a, b) => a - b);
    const order = outliers.rows.map((_, i) => i);
    order.sort((a, b) => outliers.rows[a] - outliers.rows[b]);
    const sortedValues = order.map(i => outliers.values[i]);
    const sortedTypes = order.map(i => outliers.types[i]);
    outliers.values = sortedValues;
    outliers.types = sortedTypes;
  }

  // Phase 1: build groups keyed by exact normalized form. Each group is a
  // single-link union-find node; phase 2 may merge them via fuzzy match.
  const groupKeys = [...clusterMap.keys()];
  const groupVariants = groupKeys.map(k => {
    const variants = clusterMap.get(k);
    return Array.from(variants.entries())
      .map(([value, v]) => ({ value, count: v.count, firstRow: v.firstRow, viaFuzzy: false }));
  });
  const G = groupKeys.length;
  const parent = groupKeys.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

  // Phase 2: fuzzy merge. Skip for very large columns to keep diagnose
  // responsive — the user can still spot variants via the exact-match groups.
  const FUZZY_LIMIT = 2000;
  const fuzzyEdges = []; // [groupIdxA, groupIdxB] pairs that were fuzzy-merged
  if (G > 1 && G <= FUZZY_LIMIT) {
    // Bucket by normalized-form length for length-filter pruning.
    const byLen = new Map();
    for (let i = 0; i < G; i++) {
      const len = groupKeys[i].length;
      if (!byLen.has(len)) byLen.set(len, []);
      byLen.get(len).push(i);
    }
    const lengths = [...byLen.keys()].sort((a, b) => a - b);
    const maxThreshold = 3;
    for (let li = 0; li < lengths.length; li++) {
      const lenA = lengths[li];
      for (let lj = li; lj < lengths.length && lengths[lj] - lenA <= maxThreshold; lj++) {
        const lenB = lengths[lj];
        const arrA = byLen.get(lenA);
        const arrB = byLen.get(lenB);
        for (let i = 0; i < arrA.length; i++) {
          const idxA = arrA[i];
          const keyA = groupKeys[idxA];
          const startJ = (lenA === lenB) ? i + 1 : 0;
          for (let j = startJ; j < arrB.length; j++) {
            const idxB = arrB[j];
            const keyB = groupKeys[idxB];
            const threshold = fuzzyThresholdFor(Math.max(lenA, lenB));
            if (threshold === 0) continue;
            if (Math.abs(lenA - lenB) > threshold) continue;
            if (find(idxA) === find(idxB)) continue;
            const dist = damerauLevenshtein(keyA, keyB, threshold);
            if (dist <= threshold) {
              fuzzyEdges.push([idxA, idxB]);
              union(idxA, idxB);
            }
          }
        }
      }
    }
  }

  // Group the exact-match groups by their union-find root, then within each
  // cluster pick the largest group (by total count) as the anchor. Anchor
  // variants stay unmarked; variants from other groups get viaFuzzy=true so
  // the UI can flag them with ≈.
  const clustersByRoot = new Map();
  for (let i = 0; i < G; i++) {
    const r = find(i);
    if (!clustersByRoot.has(r)) clustersByRoot.set(r, []);
    clustersByRoot.get(r).push(i);
  }

  const textClusters = [];
  for (const groupIdxs of clustersByRoot.values()) {
    const groupTotals = groupIdxs.map(gi => groupVariants[gi].reduce((s, v) => s + v.count, 0));
    let anchorPos = 0;
    for (let i = 1; i < groupIdxs.length; i++) {
      if (groupTotals[i] > groupTotals[anchorPos]) anchorPos = i;
    }
    if (groupIdxs.length > 1) {
      for (let i = 0; i < groupIdxs.length; i++) {
        if (i === anchorPos) continue;
        for (const v of groupVariants[groupIdxs[i]]) v.viaFuzzy = true;
      }
    }
    const allVariants = [];
    for (const gi of groupIdxs) allVariants.push(...groupVariants[gi]);
    if (allVariants.length < 2) continue;
    allVariants.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    const clusterTotal = allVariants.reduce((s, v) => s + v.count, 0);
    const hasFuzzy = allVariants.some(v => v.viaFuzzy);
    textClusters.push({
      normalForm: groupKeys[groupIdxs[anchorPos]],
      total: clusterTotal,
      variants: allVariants,
      hasFuzzy,
    });
  }
  textClusters.sort((a, b) => b.total - a.total || b.variants.length - a.variants.length);

  return { total, empty, dominantType, types, outliers, textClusters };
}

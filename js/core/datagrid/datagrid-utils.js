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
};

/** @param {string} type @returns {boolean} */
export function isNumericType(type) {
  return COLUMN_TYPES[type]?.isNumeric ?? false;
}

// ─── Cell Display Formatting ───────────────────────────────

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
    case 'date':
      if (!val) return '';
      try {
        const dt = new Date(val);
        if (!isNaN(dt)) return dt.toLocaleDateString('de-DE');
      } catch { /* ignore */ }
      return String(val);
    case 'time':
      if (!val) return '';
      try {
        if (typeof val === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(val)) return val;
        const dt = new Date(val);
        if (!isNaN(dt)) return dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      } catch { /* ignore */ }
      return String(val);
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
 * Analyze a column's values and classify each cell by detected data type.
 * Determines the dominant type from actual values (ignores declared column type)
 * and reports cells that deviate from the majority as outliers.
 * @param {{ type: string, values: Array<*> }} col
 * @param {number} rowCount
 * @returns {{ total: number, empty: number, dominantType: string|null, types: Object<string, { count: number, rows: number[] }>, outliers: { count: number, rows: number[], values: string[], types: string[] } }}
 */
export function analyzeColumn(col, rowCount) {
  const total = rowCount;
  let empty = 0;
  const types = {};

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

  return { total, empty, dominantType, types, outliers };
}

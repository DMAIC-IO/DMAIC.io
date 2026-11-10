/**
 * D.Mike — Zahlen nach App-Sprache lesen und formatieren (number-format.js)
 *
 * Pure module, no DOM. The language is always passed in by the caller
 * (`i18n.getLanguage()` / `context.language`).
 *
 * Reading is tolerant and identical for every language; formatting has two
 * profiles: `input` (lossless, no grouping, for fields/tables/CSV) and
 * `output` (grouped, for display).
 */

/** German thousands grouping with a decimal comma, e.g. "1.234,5". */
const DE_GROUPED = /^[+-]?\d{1,3}(\.\d{3})+,\d*$/;
/** English thousands grouping with a decimal point, e.g. "1,234.5". */
const EN_GROUPED = /^[+-]?\d{1,3}(,\d{3})+\.\d*$/;

/**
 * Parse a user-typed number (decimal comma or point, grouped forms allowed
 * only together with the opposite decimal separator and real 3-digit groups).
 *
 * @param {string|number|null|undefined} raw
 * @returns {number|null} the number, `null` for empty input, `NaN` for invalid input
 */
export function parseNumber(raw) {
  if (typeof raw === 'number') return raw;
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (s === '') return null;
  const commas = s.split(',').length - 1;
  const points = s.split('.').length - 1;
  if (commas === 1 && points === 0) {
    s = s.replace(',', '.');
  } else if (commas === 1 && DE_GROUPED.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (commas >= 1 && points === 1 && EN_GROUPED.test(s)) {
    s = s.replace(/,/g, '');
  }
  return Number(s);
}

/**
 * Parse like {@link parseNumber}, but fall back when the result is not a
 * finite number (empty or invalid input). Unlike `parseFloat(x) || fb`, a
 * real 0 is kept.
 *
 * @template T
 * @param {string|number|null|undefined} raw
 * @param {T} fallback
 * @returns {number|T}
 */
export function decimalOr(raw, fallback) {
  const v = parseNumber(raw);
  return Number.isFinite(v) ? v : fallback;
}

/** @type {Map<string, Intl.NumberFormat>} */
const _fixedFormatters = new Map();
/** @type {Map<string, Intl.NumberFormat>} */
const _pctFormatters = new Map();
/** @type {Map<string, {decimal: string, group: string}>} */
const _symbols = new Map();

function symbols(lang) {
  let s = _symbols.get(lang);
  if (!s) {
    const parts = new Intl.NumberFormat(lang).formatToParts(1234.5);
    s = {
      decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
      group: parts.find((p) => p.type === 'group')?.value ?? ',',
    };
    _symbols.set(lang, s);
  }
  return s;
}

/**
 * Decimal separator of a language.
 * @param {string} lang
 * @returns {',' | '.'}
 */
export function decimalSeparator(lang) {
  return /** @type {',' | '.'} */ (symbols(lang).decimal);
}

/**
 * Format a number for a language.
 *
 * - `profile: 'output'` (default): grouped; without `decimals` the shortest
 *   round-trip digits, with `decimals` exactly that many places.
 * - `profile: 'input'`: never grouped, lossless (`String(value)`); `decimals`
 *   gives exactly n places, `precision` means `toPrecision(n)`.
 * - `null`/`undefined` → `''`; `NaN`/`±Infinity` → `String(value)`.
 *
 * @param {number|null|undefined} value
 * @param {string} lang
 * @param {{ profile?: 'input'|'output', decimals?: number, precision?: number }} [opts]
 * @returns {string}
 */
export function formatNumber(value, lang, opts = {}) {
  if (value === null || value === undefined) return '';
  if (!Number.isFinite(value)) return String(value);
  const { profile = 'output', decimals, precision } = opts;
  const { decimal, group } = symbols(lang);

  if (profile === 'output' && decimals !== undefined) {
    const key = `${lang}|${decimals}`;
    let fmt = _fixedFormatters.get(key);
    if (!fmt) {
      fmt = new Intl.NumberFormat(lang, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      _fixedFormatters.set(key, fmt);
    }
    // Erst nach toFixed-Regeln runden (Binärfälle wie 1.005 → "1.00"), dann gruppieren.
    return fmt.format(Math.abs(value) >= 1e21 ? value : Number(value.toFixed(decimals)));
  }

  let s;
  if (decimals !== undefined) s = value.toFixed(decimals);
  else if (precision !== undefined) s = value.toPrecision(precision);
  else s = String(value);

  if (/e/i.test(s)) return s.replace('.', decimal);
  let [int, frac] = s.split('.');
  if (profile === 'output') int = int.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return frac === undefined ? int : int + decimal + frac;
}

/**
 * Format a share (0…1) as a percentage, like `Intl` `style: 'percent'`.
 *
 * @param {number} share
 * @param {string} lang
 * @param {number} decimals
 * @returns {string}
 */
export function formatPercent(share, lang, decimals) {
  const key = `${lang}|${decimals}`;
  let fmt = _pctFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(lang, { style: 'percent', minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    _pctFormatters.set(key, fmt);
  }
  return fmt.format(share);
}

/**
 * Round to a number of decimals (for calculations, not display).
 *
 * @param {number} value
 * @param {number} decimals
 * @returns {number}
 */
export function roundTo(value, decimals) {
  return Number(value.toFixed(decimals));
}

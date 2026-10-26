/**
 * D.Mike — Dezimaleingaben lesen (parse-decimal.js)
 *
 * Pure helper for free-text number inputs. `parseFloat` stops at the first
 * comma, so the German "3,5" silently became 3. This helper accepts both the
 * German decimal comma and the English decimal point. No DOM, no i18n, no
 * dependency on the datagrid.
 */

/** German thousands grouping with a decimal comma, e.g. "1.234,5". */
const DE_GROUPED = /^[+-]?\d{1,3}(\.\d{3})+,\d*$/;

/**
 * Parse a user-typed decimal number.
 *
 * - `null`, `undefined` or whitespace only → `null` (no input)
 * - a number → itself
 * - exactly one comma and no point → the comma is the decimal separator ("3,5" → 3.5)
 * - German grouping with a decimal comma ("1.234,5") → 1234.5
 * - anything else goes through `Number` ("1234.5", "-0.5", "1e3", "1.234" → 1.234)
 * - invalid input ("3,5x", "-", "1,2,3") → `NaN`
 *
 * @param {string|number|null|undefined} raw
 * @returns {number|null} the number, `null` for empty input, `NaN` for invalid input
 */
export function parseDecimalInput(raw) {
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
  }
  return Number(s);
}

/**
 * Parse like {@link parseDecimalInput}, but fall back when the result is not
 * a finite number (empty or invalid input). Unlike `parseFloat(x) || fb`, a
 * real 0 is kept.
 *
 * @template T
 * @param {string|number|null|undefined} raw
 * @param {T} fallback
 * @returns {number|T}
 */
export function decimalOr(raw, fallback) {
  const v = parseDecimalInput(raw);
  return Number.isFinite(v) ? v : fallback;
}

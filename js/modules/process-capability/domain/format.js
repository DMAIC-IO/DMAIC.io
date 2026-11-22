/**
 * D.Mike — Process Capability number formatting (domain/format.js)
 *
 * Pure display helpers shared by the module view and the tile; kept apart so they can be
 * unit-tested without the template engine. The language comes from the caller.
 */
import { formatNumber, decimalSeparator } from '../../../core/number-format.js';

/**
 * Fixed-decimal number in the app language; "–" for missing or NaN.
 * @param {number|null|undefined} v @param {number|undefined} d decimals (default 4)
 * @param {string} lang app language
 * @returns {string}
 */
export function fmt(v, d, lang) {
  if (v == null || isNaN(v)) return '–';
  return formatNumber(v, lang, { decimals: d ?? 4 });
}

/**
 * Z value: "∞" for an out-of-spec fraction of 0, "−∞" for a fraction of 1.
 * @param {number} v @param {number|undefined} d decimals (default 4)
 * @param {string} lang app language
 * @returns {string}
 */
export function fmtZ(v, d, lang) {
  if (v === Infinity) return '∞';
  if (v === -Infinity) return '−∞';
  return fmt(v, d, lang);
}

/**
 * Probability for the Z.bench formula line: exponent notation below 1e-4,
 * so a capable process never reads as 0.000000.
 * @param {number} p @param {string} lang app language
 * @returns {string}
 */
export function fmtFraction(p, lang) {
  if (p > 0 && p < 1e-4) return p.toExponential(3).replace('.', decimalSeparator(lang));
  return p === 0 ? '0' : fmt(p, 6, lang);
}

/**
 * n̄ and degrees of freedom ν: an integer as is, otherwise two decimals.
 * @param {number} v @param {string} lang app language
 * @returns {string}
 */
export function fmtDec(v, lang) {
  return Number.isInteger(v) ? String(v) : formatNumber(v, lang, { decimals: 2 });
}

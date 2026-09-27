/**
 * D.Mike — Process Capability number formatting (process-capability-format.js)
 *
 * Pure display helpers shared by the module view; kept apart so they can be
 * unit-tested without the template engine.
 */

/**
 * Fixed-decimal number; "–" for missing or NaN.
 * @param {number} v @param {number} [d=4] @returns {string}
 */
export function fmt(v, d = 4) {
  if (v == null || isNaN(v)) return '–';
  return v.toFixed(d);
}

/**
 * Z value: "∞" for an out-of-spec fraction of 0, "−∞" for a fraction of 1.
 * @param {number} v @param {number} [d=4] @returns {string}
 */
export function fmtZ(v, d = 4) {
  if (v === Infinity) return '∞';
  if (v === -Infinity) return '−∞';
  return fmt(v, d);
}

/**
 * Probability for the Z.bench formula line: exponent notation below 1e-4,
 * so a capable process never reads as 0.000000.
 * @param {number} p @returns {string}
 */
export function fmtFraction(p) {
  if (p > 0 && p < 1e-4) return p.toExponential(3);
  return p === 0 ? '0' : fmt(p, 6);
}

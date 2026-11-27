/**
 * D.Mike — Korrelation: Filter der Matrix (domain/filter.js). Rein.
 */

/**
 * Besteht eine Matrixzelle die Filter? Ohne Filter immer; mit Filter fällt
 * eine nicht berechenbare Zelle (`r` ist `null`) immer heraus.
 * @param {number|null} r  Koeffizient der Zelle
 * @param {number|null} p  p-Wert der Zelle
 * @param {number|null} minR  Filter |r| ≥, `null` aus
 * @param {number|null} maxP  Filter p ≤, `null` aus
 * @returns {boolean}
 */
export function cellPassesFilter(r, p, minR, maxP) {
  if (minR == null && maxP == null) return true;
  if (r == null || Number.isNaN(r)) return false;
  if (minR != null && Math.abs(r) < minR) return false;
  if (maxP != null && (p == null || p > maxP)) return false;
  return true;
}

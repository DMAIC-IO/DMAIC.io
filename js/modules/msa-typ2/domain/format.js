/**
 * D.Mike — MSA Typ 2: Zahlenformatierung für Tabellen und Kennzahlen.
 */

/**
 * Zahl mit fester Stellenzahl; Strich für fehlende oder nicht endliche Werte.
 * @param {number|null|undefined} v
 * @param {number} [d] Nachkommastellen
 * @returns {string}
 */
export function fmt(v, d = 4) {
  return v != null && isFinite(v) ? v.toFixed(d) : '–';
}

/**
 * p-Wert: unter 0,001 als „< 0.001“, sonst drei Stellen.
 * @param {number|null|undefined} p
 * @returns {string}
 */
export function fmtP(p) {
  if (p == null || isNaN(p)) return '–';
  if (p < 0.001) return '< 0.001';
  return p.toFixed(3);
}

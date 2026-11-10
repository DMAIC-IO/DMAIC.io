/**
 * D.Mike — MSA Typ 2: Zahlenformatierung für Tabellen und Kennzahlen.
 */
import { formatNumber } from '../../../core/number-format.js';

/**
 * Zahl mit fester Stellenzahl; Strich für fehlende oder nicht endliche Werte.
 * @param {number|null|undefined} v
 * @param {number} d Nachkommastellen
 * @param {string} lang App-Sprache
 * @returns {string}
 */
export function fmt(v, d, lang) {
  return v != null && isFinite(v) ? formatNumber(v, lang, { decimals: d }) : '–';
}

/**
 * p-Wert: unter 0,001 als „< 0.001“, sonst drei Stellen.
 * @param {number|null|undefined} p
 * @param {string} lang App-Sprache
 * @returns {string}
 */
export function fmtP(p, lang) {
  if (p == null || isNaN(p)) return '–';
  if (p < 0.001) return '< ' + formatNumber(0.001, lang, { decimals: 3 });
  return formatNumber(p, lang, { decimals: 3 });
}

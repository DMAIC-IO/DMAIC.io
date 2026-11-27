/**
 * D.Mike — Korrelation: das Konfidenzniveau als Freitext (domain/confidence.js). Rein.
 */
import { parseDecimalInput } from '../../../core/parse-decimal.js';
import { roundTo } from '../../../core/number-format.js';

/** Bereich des Konfidenzniveaus als Anteil (gleich dem Literal im Schema). */
export const CONF_RANGE = Object.freeze({ min: 0.5, max: 0.9999 });

/**
 * Freitext als Anteil in (0; 1): „95“, „95 %“, „0.95“, „0,95“, „97,5 %“.
 * Zahlen über 1 gelten als Prozent. `null`, wenn der Text keine Zahl ist oder
 * außerhalb von (0; 1) liegt; den Bereich `CONF_RANGE` prüft der Aufrufer.
 * @param {unknown} raw
 * @returns {number|null}
 */
export function parseConfPercent(raw) {
  if (raw == null) return null;
  const n = parseDecimalInput(String(raw).replace('%', ''));
  if (n === null || !Number.isFinite(n)) return null;
  const dec = n > 1 ? n / 100 : n;
  if (dec <= 0 || dec >= 1) return null;
  return dec;
}

/**
 * Liegt der Anteil im Bereich des Felds?
 * @param {number|null} dec
 * @returns {boolean}
 */
export function confInRange(dec) {
  return dec !== null && dec >= CONF_RANGE.min && dec <= CONF_RANGE.max;
}

/**
 * Die Einstellung in Prozent als Anteil, auf den Bereich des Felds geklemmt.
 * @param {number} percent
 * @returns {number}
 */
export function confFromSetting(percent) {
  return Math.min(CONF_RANGE.max, Math.max(CONF_RANGE.min, roundTo(percent / 100, 4)));
}

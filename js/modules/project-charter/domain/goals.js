/**
 * D.Mike — Project charter: reine Helfer für Ziele.
 */
import { todayISO, looksLikeIsoDate } from '../../../core/local-date.js';

/**
 * Stufe der Zielerreichung: 100 `done`, ab 75 `high`, ab 25 `mid`, sonst `low`.
 * Werte außerhalb 0..100 werden geklemmt.
 * @param {number} pct
 * @returns {'done'|'high'|'mid'|'low'}
 */
export function zegLevel(pct) {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  if (v >= 100) return 'done';
  if (v >= 75) return 'high';
  if (v >= 25) return 'mid';
  return 'low';
}

/**
 * Liegt das Datum vor dem heutigen (lokalen) Tag? Leere oder ungültige
 * Angaben sind nie vergangen; heute selbst ist nicht vergangen.
 * @param {string} iso `YYYY-MM-DD`
 * @param {string} [today] lokales heute, Vorgabe `todayISO()`
 * @returns {boolean}
 */
export function isDateInPast(iso, today = todayISO()) {
  return looksLikeIsoDate(iso) && iso < today;
}

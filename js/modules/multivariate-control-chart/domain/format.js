/**
 * D.Mike — Multivariate Regelkarte: der Text zum Fehlergrund (rein, ohne DOM).
 *
 * Eine Quelle für den Fehlerkasten der Ansicht und die Ableitung `message`:
 * die Altform lieferte den übersetzten Text in `read()` (`errorMsg`).
 */
import { errorOf } from './analyze.js';

/**
 * Der übersetzte Text zum Grund; `errTooFewRows` setzt die Zahl der Variablen
 * ein.
 * @param {import('./analyze.js').Analysis|{ error: unknown }|null} analysis
 * @param {(key: string, params?: object) => string} t Übersetzer des Moduls
 * @returns {string|null} null ohne Grund (nie `''`)
 */
export function messageOf(analysis, t) {
  const reason = errorOf(analysis);
  if (!reason) return null;
  if (reason === 'errTooFewRows') return t(reason, { p: /** @type {any} */ (analysis).p });
  return t(reason);
}

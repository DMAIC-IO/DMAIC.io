/**
 * D.Mike — Paarweiser Vergleich: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js oder run.js (das Schema darf sich ändern, die
 * Migration nicht).
 */

/** Reiter im Formatstand 1.0. */
const PHASES_1_0 = ['input', 'compare', 'results'];

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * Eine Liste von Listen; Nicht-Listen werden `[]`, jede innere Nicht-Liste
 * `[]`, jeder Eintrag, den `keep` nicht annimmt, `0` (die Länge bleibt).
 * @param {unknown} v @param {(x: unknown) => boolean} keep @returns {number[][]}
 */
function rows(v, keep) {
  if (!Array.isArray(v)) return [];
  return v.map((row) => (Array.isArray(row) ? row.map((x) => (keep(x) ? /** @type {number} */ (x) : 0)) : []));
}

/** @param {unknown} x @returns {boolean} */
const isFiniteNumber = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * '0→1.0': jeder Stand ohne `_schema` (wie ihn das alte `State.toJSON`
 * schrieb, von Hand oder als Beispieldatei). Kriterien nur Texte; Matrix und
 * Paare Listen von Listen, Nichtzahlen darin werden 0 (in Paaren auch
 * Nicht-Ganzzahlen), Zahlen bleiben wörtlich; `currentPair` nur eine
 * Ganzzahl ab 0, sonst 0 (nach oben ohne Klemmung); `viewPhase` aus den drei Reitern, sonst
 * `input`. Unbekannte Schlüssel entfallen.
 * @param {unknown} old gespeicherter Zustand ohne `_schema`
 * @returns {{ criteria: string[], matrix: number[][], pairs: number[][], currentPair: number, viewPhase: string }}
 */
export function from0(old) {
  const o = isObject(old) ? old : {};
  return {
    criteria: Array.isArray(o.criteria) ? o.criteria.filter((c) => typeof c === 'string') : [],
    matrix: rows(o.matrix, isFiniteNumber),
    pairs: rows(o.pairs, Number.isInteger),
    currentPair: Number.isInteger(o.currentPair) && o.currentPair >= 0 ? o.currentPair : 0,
    viewPhase: PHASES_1_0.includes(o.viewPhase) ? o.viewPhase : 'input',
  };
}

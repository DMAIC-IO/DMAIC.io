/**
 * D.Mike — Paarweiser Vergleich: der Lauf als reine Funktionen.
 *
 * Paarfolge, Punkte, Rangfolge, Erreichbarkeit der Reiter und der Zyklus
 * einer Matrixzelle. Model und Ansicht lesen beide von hier. Ohne DOM, ohne
 * i18n, ohne Zustand.
 */

/** Höchstzahl der Kriterien. */
export const MAX_CRITERIA = 15;
/** Mindestzahl der Kriterien für einen Vergleich. */
export const MIN_CRITERIA = 3;
/** Die Reiter in Anzeigereihenfolge (gleich den Werten von `viewPhase`). */
export const PHASES = Object.freeze(['input', 'compare', 'results']);

/**
 * Alle Paare `[i, j]` mit `i < j` in gemischter Reihenfolge (Fisher–Yates).
 * @param {number} n Zahl der Kriterien
 * @param {() => number} [random] Zufallsquelle in [0, 1)
 * @returns {number[][]}
 */
export function makePairs(n, random = Math.random) {
  const pairs = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) pairs.push([i, j]);
  }
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  return pairs;
}

/**
 * Eine n×n-Matrix aus Nullen.
 * @param {number} n @returns {number[][]}
 */
export function zeroMatrix(n) {
  return Array.from({ length: n }, () => Array(n).fill(0));
}

/**
 * Zeilensummen der Matrix ohne die Diagonale. Eine Zeile, die kürzer als die
 * Matrix ist, ergibt `NaN` (wie die Altform).
 * @param {ReadonlyArray<ReadonlyArray<number>>} matrix @returns {number[]}
 */
export function scores(matrix) {
  const n = matrix.length;
  return Array.from({ length: n }, (_, i) => {
    let s = 0;
    for (let j = 0; j < n; j++) if (i !== j) s += matrix[i][j];
    return s;
  });
}

/**
 * Die Kriterien absteigend nach Punkten; Gleichstand in Eingabereihenfolge.
 * @param {ReadonlyArray<string>} criteria @param {ReadonlyArray<number>} sc Punkte je Kriterium
 * @returns {{ name: string, score: number, idx: number }[]}
 */
export function ranked(criteria, sc) {
  return criteria
    .map((name, idx) => ({ name, score: sc[idx], idx }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Ein Vergleich läuft: es gibt Paare, und nicht alle sind entschieden.
 * @param {{ pairs: ReadonlyArray<unknown>, currentPair: number }} m @returns {boolean}
 */
export function compareReachable(m) {
  return m.pairs.length > 0 && m.currentPair < m.pairs.length;
}

/**
 * Ein Vergleich ist abgeschlossen: es gibt Paare, und alle sind entschieden.
 * @param {{ pairs: ReadonlyArray<unknown>, currentPair: number }} m @returns {boolean}
 */
export function resultsReachable(m) {
  return m.pairs.length > 0 && m.currentPair >= m.pairs.length;
}

/**
 * Ob ein Reiter zum Lauf passt: `input` immer, `compare` nur im laufenden,
 * `results` nur im abgeschlossenen Vergleich.
 * @param {string} phase @param {{ pairs: ReadonlyArray<unknown>, currentPair: number }} m @returns {boolean}
 */
export function phaseReachable(phase, m) {
  if (phase === 'compare') return compareReachable(m);
  if (phase === 'results') return resultsReachable(m);
  return phase === 'input';
}

/**
 * Der nächste Wert einer Matrixzelle: 0 → 0.5 → 1 → 0, jeder andere Wert → 0.
 * @param {unknown} v @returns {number}
 */
export function nextCell(v) {
  if (v === 0) return 0.5;
  if (v === 0.5) return 1;
  return 0;
}

/**
 * Der Wert der Gegenzelle zu `v`: 0.5 bleibt 0.5, sonst `1 − v`.
 * @param {number} v @returns {number}
 */
export function mirrorCell(v) {
  return v === 0.5 ? 0.5 : 1 - v;
}

/**
 * D.Mike — Kano Engine (kano-engine.js)
 *
 * Reine Auswertung des Kano-Fragebogens. Kein DOM, kein State, kein i18n.
 *
 * Skalen (als Zahl gespeichert, Klartext kommt aus i18n):
 *   funktional / dysfunktional: 1 = würde mich sehr freuen … 5 = würde mich sehr stören
 *   Wichtigkeit (dritte Frage): 1 = völlig unwichtig … 9 = außerordentlich wichtig
 *
 * Kategorien: M (Basis), O (Leistung), A (Begeisterung), I (indifferent),
 *             R (reversed), Q (questionable)
 *
 * Spec: docs/superpowers/specs/2026-07-25-kano-modul-design.md
 */

/** Kategorien in absteigender Stärke — zugleich die Tie-Break-Reihenfolge. */
export const CATEGORIES = ['M', 'O', 'A', 'I', 'R', 'Q'];

/**
 * Kanonische Kano-Auswertungstabelle (Kano et al. 1984).
 * Zeile = funktionale Antwort 1..5, Spalte = dysfunktionale Antwort 1..5.
 */
const TABLE = [
  ['Q', 'A', 'A', 'A', 'O'],
  ['R', 'I', 'I', 'I', 'M'],
  ['R', 'I', 'I', 'I', 'M'],
  ['R', 'I', 'I', 'I', 'M'],
  ['R', 'R', 'R', 'R', 'Q'],
];

/** @returns {boolean} true, wenn v eine ganze Zahl im Bereich 1..5 ist */
function onScale5(v) {
  return Number.isInteger(v) && v >= 1 && v <= 5;
}

/** @returns {boolean} true, wenn v eine ganze Zahl im Bereich 1..9 ist */
function onScale9(v) {
  return Number.isInteger(v) && v >= 1 && v <= 9;
}

/**
 * Klassifiziert ein Antwortpaar nach der Kano-Tabelle.
 * @param {number|null} f funktionale Antwort (1..5)
 * @param {number|null} d dysfunktionale Antwort (1..5)
 * @returns {'M'|'O'|'A'|'I'|'R'|'Q'|null} null, wenn eine Antwort fehlt oder außerhalb der Skala liegt
 */
export function classify(f, d) {
  if (!onScale5(f) || !onScale5(d)) return null;
  return TABLE[f - 1][d - 1];
}

/**
 * Aggregiert die Antworten aller Befragten zu einem Item.
 *
 * Gesamtkategorie ist der Modalwert; bei Gleichstand gewinnt die stärkere
 * Kategorie in der Reihenfolge M > O > A > I > R > Q, und `tie` wird gesetzt.
 * CS = (A+O)/(A+O+M+I), DS = -(O+M)/(A+O+M+I) — R und Q stehen bewusst nicht
 * im Nenner, sie sind keine Präferenz. Nenner 0 ⇒ cs/ds sind null, nie NaN.
 *
 * @param {Array<{f: number|null, d: number|null, w: number|null}>} itemAnswers
 * @param {{ importance: boolean }} options
 * @returns {{counts: object, n: number, unanswered: number,
 *            category: string|null, tie: boolean,
 *            cs: number|null, ds: number|null,
 *            importanceMean: number|null, importanceN: number}}
 */
export function aggregate(itemAnswers, options) {
  const counts = { M: 0, O: 0, A: 0, I: 0, R: 0, Q: 0 };
  let n = 0;
  let unanswered = 0;
  let wSum = 0;
  let importanceN = 0;
  const useImportance = Boolean(options?.importance);

  for (const a of itemAnswers || []) {
    const cat = classify(a?.f ?? null, a?.d ?? null);
    if (cat) { counts[cat]++; n++; } else { unanswered++; }
    if (useImportance && onScale9(a?.w ?? null)) { wSum += a.w; importanceN++; }
  }

  let category = null;
  let tie = false;
  if (n > 0) {
    const max = Math.max(...CATEGORIES.map((c) => counts[c]));
    const leaders = CATEGORIES.filter((c) => counts[c] === max);
    category = leaders[0];          // CATEGORIES ist bereits nach Stärke sortiert
    tie = leaders.length > 1;
  }

  const denom = counts.A + counts.O + counts.M + counts.I;
  const cs = denom > 0 ? (counts.A + counts.O) / denom : null;
  const ds = denom > 0 ? -(counts.O + counts.M) / denom : null;

  return {
    counts, n, unanswered, category, tie, cs, ds,
    importanceMean: importanceN > 0 ? wSum / importanceN : null,
    importanceN,
  };
}

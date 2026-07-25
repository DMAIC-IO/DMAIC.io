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

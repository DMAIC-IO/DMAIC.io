/**
 * D.Mike — Stoff-Feld-Analyse (TRIZ): Feldarten, Verknüpfungen und die
 * Diagnose des Stoff-Feld-Modells.
 *
 * Rein und ohne Texte; die Namen der Feldarten, Verknüpfungen und Lagen
 * stehen in den Übersetzungen des Moduls (`field.<f>`, `link.<l>`,
 * `situation.<s>`).
 */

/**
 * Die sechs Feldarten: M mechanisch, A akustisch, T thermisch, C chemisch,
 * E elektrisch, Mg magnetisch.
 * @type {ReadonlyArray<'M'|'A'|'T'|'C'|'E'|'Mg'>}
 */
export const FIELD_TYPES = Object.freeze(['M', 'A', 'T', 'C', 'E', 'Mg']);

/**
 * Die fünf Arten der Verknüpfung zwischen den beiden Stoffen.
 * @type {ReadonlyArray<'useful'|'insufficient'|'excessive'|'harmful'|'missing'>}
 */
export const LINK_TYPES = Object.freeze(['useful', 'insufficient', 'excessive', 'harmful', 'missing']);

/**
 * Lage des Modells und die dazu empfohlenen Standardklassen.
 * @typedef {object} DiagnosisResult
 * @property {'partial'|'incomplete'|'complete-useful'|'complete-insufficient'|'complete-excessive'|'complete-harmful'} situation
 * @property {number[]} suggestedClasses
 */

/**
 * Die Diagnose aus den beiden Stoffen, der Feldart und der Verknüpfung.
 *
 * Ohne S1 oder S2 (nach Entfernen der Leerzeichen) ist das Modell `partial`;
 * ohne Feldart, mit der Verknüpfung `missing` oder ohne gewählte Verknüpfung
 * `incomplete`; sonst `complete-<verknüpfung>`. Empfohlen werden je Lage
 * feste Standardklassen.
 *
 * @param {string} s1 der Stoff S1
 * @param {string} s2 der Stoff S2
 * @param {string} field die Feldart oder `''`
 * @param {string} link die Verknüpfung oder `''`
 * @returns {DiagnosisResult} eine neue Liste der Klassen je Aufruf
 */
export function diagnose(s1, s2, field, link) {
  const hasS1 = Boolean(s1?.trim());
  const hasS2 = Boolean(s2?.trim());
  if (!hasS1 || !hasS2) return { situation: 'partial', suggestedClasses: [1] };
  if (!field || link === 'missing') return { situation: 'incomplete', suggestedClasses: [1] };
  switch (link) {
    case 'useful': return { situation: 'complete-useful', suggestedClasses: [2, 3] };
    case 'insufficient': return { situation: 'complete-insufficient', suggestedClasses: [2] };
    case 'excessive': return { situation: 'complete-excessive', suggestedClasses: [2, 5] };
    case 'harmful': return { situation: 'complete-harmful', suggestedClasses: [1, 5] };
    default: return { situation: 'incomplete', suggestedClasses: [1] };
  }
}

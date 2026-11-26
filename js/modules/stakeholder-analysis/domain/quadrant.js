/**
 * D.Mike — Stakeholder-Analyse: Quadranten der Einfluss-Interesse-Matrix.
 *
 * Reine Funktionen über Beteiligte (`{ power, interest, support }`). Model,
 * Ansicht und Kachel lesen daraus. Ohne DOM, ohne i18n.
 */

/** Haltungen, die das Formular und die Kommandos kennen. */
export const SUPPORT_VALUES = Object.freeze(['supporter', 'neutral', 'critic']);

/** Kategorien, die das Formular und die Kommandos kennen. */
export const CATEGORY_VALUES = Object.freeze(['intern', 'extern', 'kunde', 'lieferant', 'behoerde']);

/** Rangfolge der vier Quadranten, höchster Vorrang zuerst. */
export const QUAD_ORDER = Object.freeze(['manage-closely', 'keep-satisfied', 'keep-informed', 'monitor']);

/**
 * @typedef {object} Levels
 * @property {number} power  Einfluss, 1–5
 * @property {number} interest  Interesse, 1–5
 */

/**
 * Der Quadrant eines Beteiligten; Einfluss bzw. Interesse gelten ab 4 als hoch.
 * @param {Levels} s
 * @returns {'manage-closely'|'keep-satisfied'|'keep-informed'|'monitor'}
 */
export function quadrantOf(s) {
  const highP = s.power >= 4;
  const highI = s.interest >= 4;
  if (highP && highI) return 'manage-closely';
  if (highP) return 'keep-satisfied';
  if (highI) return 'keep-informed';
  return 'monitor';
}

/**
 * Zahl der Beteiligten je Quadrant.
 * @param {ReadonlyArray<Levels>} list
 * @returns {Record<string, number>} Schlüssel in der Reihenfolge von QUAD_ORDER
 */
export function quadrantCounts(list) {
  /** @type {Record<string, number>} */
  const counts = Object.fromEntries(QUAD_ORDER.map((q) => [q, 0]));
  for (const s of list) counts[quadrantOf(s)] += 1;
  return counts;
}

/**
 * Verteilung der Haltungen; Werte außerhalb von SUPPORT_VALUES zählen als `other`.
 * @param {ReadonlyArray<{ support: string }>} list
 * @returns {{ supporter: number, neutral: number, critic: number, other: number }}
 */
export function supportCounts(list) {
  const counts = { supporter: 0, neutral: 0, critic: 0, other: 0 };
  for (const s of list) {
    const key = /** @type {'supporter'|'neutral'|'critic'|'other'} */ (SUPPORT_VALUES.includes(s.support) ? s.support : 'other');
    counts[key] += 1;
  }
  return counts;
}

/**
 * Ist der Beteiligte ein Kritiker im Quadranten „eng managen“?
 * @param {Levels & { support: string }} s
 * @returns {boolean}
 */
export function isKeyCritic(s) {
  return quadrantOf(s) === 'manage-closely' && s.support === 'critic';
}

/**
 * Die Kritiker im Quadranten „eng managen“, in der Reihenfolge der Liste.
 * @template {Levels & { support: string }} T
 * @param {ReadonlyArray<T>} list
 * @returns {T[]}
 */
export function criticalCritics(list) {
  return list.filter(isKeyCritic);
}

/**
 * Die Beteiligten nach Quadrantenrang; innerhalb eines Quadranten bleibt die
 * Reihenfolge der Liste.
 * @template {Levels} T
 * @param {ReadonlyArray<T>} list
 * @returns {T[]}
 */
export function byQuadrant(list) {
  return [...list].sort((a, b) => QUAD_ORDER.indexOf(quadrantOf(a)) - QUAD_ORDER.indexOf(quadrantOf(b)));
}

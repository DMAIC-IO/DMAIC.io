/**
 * D.Mike — TRIZ-Evolutionstrends: die acht Trends und ihre Stufenzahl.
 *
 * Reihenfolge wie in der Oberfläche und im gespeicherten Zustand. Die
 * ungleichmäßige Entwicklung (`uneven`) ist qualitativ und hat keine Stufen.
 */

/** @type {ReadonlyArray<Readonly<{ id: string, stages: number }>>} */
export const TRENDS = Object.freeze([
  Object.freeze({ id: 'aggregation', stages: 4 }),
  Object.freeze({ id: 'dynamism', stages: 5 }),
  Object.freeze({ id: 'scale', stages: 4 }),
  Object.freeze({ id: 'automation', stages: 4 }),
  Object.freeze({ id: 'completeness', stages: 4 }),
  Object.freeze({ id: 'controllability', stages: 4 }),
  Object.freeze({ id: 'matching', stages: 4 }),
  Object.freeze({ id: 'uneven', stages: 0 }),
]);

/**
 * Zahl der Stufen eines Trends; 0 für einen unbekannten Trend.
 * @param {string} id @returns {number}
 */
export function stageCount(id) {
  return TRENDS.find((t) => t.id === id)?.stages ?? 0;
}

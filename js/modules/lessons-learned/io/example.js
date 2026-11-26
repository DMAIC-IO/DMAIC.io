/**
 * D.Mike — Lessons Learned: Beispielform. Rein.
 *
 * Die Beispiele tragen relative Zeitpunkte (`createdAt: "-30d"`,
 * `updatedAt: "-14d"`); sie werden zu Zeitstempeln ab heute. Alles andere
 * übernimmt die Migration.
 */
import { resolveEpochOffset } from '../../../core/date-offset.js';

/**
 * @param {Record<string, any>} data
 * @param {{ id?: string, title?: object }} _meta
 * @returns {Record<string, any>}
 */
export function fromExample(data, _meta) {
  if (!Array.isArray(data?.lessons)) return data;
  return {
    ...data,
    lessons: data.lessons.map((/** @type {any} */ l) => (l && typeof l === 'object' && !Array.isArray(l)
      ? { ...l, createdAt: resolveEpochOffset(l.createdAt), updatedAt: resolveEpochOffset(l.updatedAt) }
      : l)),
  };
}

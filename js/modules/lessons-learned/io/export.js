/**
 * D.Mike — Lessons Learned: JSON-Export. Reine Funktion; Datei und Download
 * baut der Kern.
 *
 * Die Form ist die des bisherigen Exports und bleibt es für den Import und
 * andere Leser: die Liste der Erfahrungen, je Erfahrung die Schlüssel `id`,
 * `title`, `category`, `phase`, `impact`, `owner`, `description`,
 * `rootCause`, `recommendation`, `actions` (je `{ text, done }`),
 * `createdAt`, `updatedAt` in dieser Reihenfolge.
 */

/**
 * @param {ReadonlyArray<any>} lessons
 * @returns {object[]}
 */
export function toExport(lessons) {
  return lessons.map((l) => ({
    id: l.id,
    title: l.title,
    category: l.category,
    phase: l.phase,
    impact: l.impact,
    owner: l.owner,
    description: l.description,
    rootCause: l.rootCause,
    recommendation: l.recommendation,
    actions: l.actions.map((/** @type {any} */ a) => ({ text: a.text, done: a.done })),
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  }));
}

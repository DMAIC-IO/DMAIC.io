/**
 * D.Mike — 5-Why: JSON-Export. Reine Funktion; Datei und Download baut der Kern.
 *
 * Die Form ist die des bisherigen Exports und bleibt es für bestehende Leser:
 * `{ tool: '5-Why', timestamp, problem, nodes }`, je Knoten `{ id, level,
 * parentId, question, answer, children, collapsed }` in dieser Reihenfolge;
 * `question` ist immer leer, Ebene 5 hat `children: []`.
 */

/**
 * @typedef {object} ExportNode
 * @property {number} id
 * @property {number} level
 * @property {number|null} parentId
 * @property {string} question
 * @property {string} answer
 * @property {ExportNode[]} children
 * @property {boolean} collapsed
 */

/**
 * @param {{ problem: string, nodes: ReadonlyArray<any> }} model
 * @param {ReadonlyArray<number>} collapsed die ids der eingeklappten Knoten
 * @param {Date} now Zeitpunkt des Exports
 * @returns {{ tool: string, timestamp: string, problem: string, nodes: ExportNode[] }}
 */
export function toExport(model, collapsed, now) {
  const closed = new Set(collapsed);
  /** @param {ReadonlyArray<any>} list @returns {ExportNode[]} */
  const map = (list) => list.map((n) => ({
    id: n.id,
    level: n.level,
    parentId: n.parentId,
    question: '',
    answer: n.answer,
    children: map(n.children ?? []),
    collapsed: closed.has(n.id),
  }));
  return { tool: '5-Why', timestamp: now.toISOString(), problem: model.problem, nodes: map(model.nodes) };
}

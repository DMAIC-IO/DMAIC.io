/**
 * D.Mike — 5-Why: Hilfen für den Fragebaum.
 *
 * Reine Funktionen über die Knotenliste: Ebene 1 bis 5, ein Knoten führt
 * seine Unterfragen in `children`; auf Ebene 5 (Grundursache) fehlt die
 * Liste. Ohne DOM, ohne i18n.
 */

/** Höchste Ebene; auf ihr liegt die Grundursache, sie hat keine Unterfragen. */
export const MAX_LEVEL = 5;

/**
 * @typedef {object} TreeNode
 * @property {number} id
 * @property {number} level
 * @property {number|null} parentId
 * @property {string} answer
 * @property {TreeNode[]} [children]  fehlt auf Ebene 5
 */

/**
 * Jeden Knoten in Anzeigereihenfolge (Tiefe zuerst) besuchen.
 * @param {ReadonlyArray<TreeNode>} nodes
 * @param {(node: TreeNode, depth: number, parent: TreeNode|null) => void} fn
 * @param {number} [depth] Ebene der Liste @param {TreeNode|null} [parent]
 * @returns {void}
 */
export function walk(nodes, fn, depth = 1, parent = null) {
  for (const n of nodes) {
    fn(n, depth, parent);
    if (Array.isArray(n.children)) walk(n.children, fn, depth + 1, n);
  }
}

/**
 * Der Knoten mit dieser id, sonst `null`.
 * @param {ReadonlyArray<TreeNode>} nodes @param {number} id
 * @returns {TreeNode|null}
 */
export function findNode(nodes, id) {
  let hit = null;
  walk(nodes, (n) => { if (hit === null && n.id === id) hit = n; });
  return hit;
}

/**
 * Alle ids in Anzeigereihenfolge.
 * @param {ReadonlyArray<TreeNode>} nodes @returns {number[]}
 */
export function allIds(nodes) {
  const ids = [];
  walk(nodes, (n) => ids.push(n.id));
  return ids;
}

/**
 * Die ids aller Knoten mit mindestens einer Unterfrage, in Anzeigereihenfolge.
 * @param {ReadonlyArray<TreeNode>} nodes @returns {number[]}
 */
export function parentIds(nodes) {
  const ids = [];
  walk(nodes, (n) => { if ((n.children?.length ?? 0) > 0) ids.push(n.id); });
  return ids;
}

/**
 * Die nächste freie id: größte id + 1, im leeren Baum 1.
 * @param {ReadonlyArray<TreeNode>} nodes @returns {number}
 */
export function nextId(nodes) {
  return allIds(nodes).reduce((m, id) => Math.max(m, id), 0) + 1;
}

/**
 * Den Knoten samt Teilbaum entfernen.
 * @param {TreeNode[]} nodes eigene Kopie, wird verändert
 * @param {number} id
 * @returns {number[]} die ids des entfernten Teilbaums (leer, wenn es die id nicht gibt)
 */
export function removeSubtree(nodes, id) {
  const at = nodes.findIndex((n) => n.id === id);
  if (at >= 0) {
    const [gone] = nodes.splice(at, 1);
    return allIds([gone]);
  }
  for (const n of nodes) {
    if (!Array.isArray(n.children)) continue;
    const removed = removeSubtree(n.children, id);
    if (removed.length > 0) return removed;
  }
  return [];
}

/**
 * Kennzahlen des Baums: Zahl der Fragen, größte Tiefe, Verzweigungen (je
 * Knoten mit mehr als einer Unterfrage deren Zahl weniger eins) und Fragen
 * mit Antwort (Text nach dem Trimmen nicht leer).
 * @param {ReadonlyArray<TreeNode>} nodes
 * @returns {{ totalNodes: number, maxDepth: number, branches: number, answered: number }}
 */
export function treeStats(nodes) {
  let totalNodes = 0;
  let maxDepth = 0;
  let branches = 0;
  let answered = 0;
  walk(nodes, (n, depth) => {
    totalNodes++;
    if (depth > maxDepth) maxDepth = depth;
    const kids = n.children?.length ?? 0;
    if (kids > 1) branches += kids - 1;
    if (String(n.answer || '').trim()) answered++;
  });
  return { totalNodes, maxDepth, branches, answered };
}

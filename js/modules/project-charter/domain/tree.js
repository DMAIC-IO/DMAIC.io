/**
 * D.Mike — Project charter: reine Baumhelfer über der flachen Knotenliste
 * (`{ id, pid }`, Geschwisterfolge = Listenfolge).
 */

/**
 * Kinder eines Knotens in Listenreihenfolge.
 * @param {Array<{id: string, pid: string|null}>} nodes
 * @param {string|null} pid `null` liefert die Wurzeln
 * @returns {Array<{id: string, pid: string|null}>}
 */
export function childrenOf(nodes, pid) {
  return nodes.filter((n) => (n.pid ?? null) === pid);
}

/**
 * Der Knoten und alle seine Nachfahren.
 * @param {Array<{id: string, pid: string|null}>} nodes @param {string} id
 * @returns {string[]} ids, Knoten zuerst
 */
export function subtreeIds(nodes, id) {
  const out = [id];
  const seen = new Set(out);
  for (let i = 0; i < out.length; i++) {
    for (const c of childrenOf(nodes, out[i])) {
      if (!seen.has(c.id)) { seen.add(c.id); out.push(c.id); }
    }
  }
  return out;
}

/**
 * Ist `id` ein echter Nachfahre von `ofId`?
 * @param {Array<{id: string, pid: string|null}>} nodes @param {string} id @param {string} ofId
 * @returns {boolean} `false` für den Knoten selbst
 */
export function isDescendant(nodes, id, ofId) {
  return id !== ofId && subtreeIds(nodes, ofId).includes(id);
}

/**
 * Geschwister einschließlich des Knotens selbst.
 * @param {Array<{id: string, pid: string|null}>} nodes @param {string} id
 * @returns {Array<{id: string, pid: string|null}>} `[]` bei unbekannter id
 */
export function siblingsOf(nodes, id) {
  const node = nodes.find((n) => n.id === id);
  return node ? childrenOf(nodes, node.pid ?? null) : [];
}

/**
 * Die Liste nach dem Umhängen eines Knotens: `id` wird Kind von `parentId`
 * an der Stelle `index` unter dessen Kindern (ohne den Knoten selbst),
 * `null` = ans Ende. Prüft weder Zyklus noch Bereich.
 * @template {{id: string, pid: string|null}} T
 * @param {T[]} nodes @param {string} id @param {string|null} parentId @param {number|null} index
 * @returns {T[]} neue Liste; der verschobene Knoten ist eine Kopie mit neuem `pid`
 */
export function moveNode(nodes, id, parentId, index) {
  const node = nodes.find((n) => n.id === id);
  if (!node) return nodes.slice();
  const rest = nodes.filter((n) => n.id !== id);
  const siblings = rest.filter((n) => (n.pid ?? null) === parentId);
  let at;
  if (index !== null && index < siblings.length) at = rest.indexOf(siblings[Math.max(0, index)]);
  else if (siblings.length) at = rest.indexOf(siblings[siblings.length - 1]) + 1;
  else at = rest.length;
  rest.splice(at, 0, { ...node, pid: parentId });
  return rest;
}

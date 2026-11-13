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

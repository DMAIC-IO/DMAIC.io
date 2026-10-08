/**
 * D.Mike — Org chart layout helpers (project-charter-org-layout.js)
 *
 * Pure tree layout for the dashboard org-chart tile: node size, gaps and the
 * position of every node. No DOM access.
 */

/** Node width. */
export const ORG_NW = 220;
/** Node height. */
export const ORG_NH = 64;
/** Horizontal gap between sibling subtrees. */
export const ORG_HG = 44;
/** Vertical gap between parent and child rows. */
export const ORG_VG = 28;

/**
 * Width of the subtree rooted at `id`.
 * @param {Array<{id: string, pid: string|null}>} nodes
 * @param {string} id
 * @returns {number}
 */
function subtreeWidth(nodes, id) {
  const children = nodes.filter(n => n.pid === id);
  if (!children.length) return ORG_NW;
  let w = 0;
  children.forEach((c, i) => {
    w += subtreeWidth(nodes, c.id);
    if (i < children.length - 1) w += ORG_HG;
  });
  return Math.max(ORG_NW, w);
}

/**
 * Place the node `id` at (x, y) and recursively its children below it.
 * @param {Array<{id: string, pid: string|null}>} nodes
 * @param {string} id
 * @param {number} x
 * @param {number} y
 * @param {Record<string, {x: number, y: number}>} out  filled in place
 */
function layoutSubtree(nodes, id, x, y, out) {
  out[id] = { x, y };
  const children = nodes.filter(n => n.pid === id);
  if (!children.length) return;
  const cy = y + ORG_NH + ORG_VG;
  const ws = children.map(c => subtreeWidth(nodes, c.id));
  let total = 0;
  ws.forEach((w, i) => { total += w; if (i < ws.length - 1) total += ORG_HG; });
  let cx = x + ORG_NW / 2 - total / 2;
  children.forEach((c, i) => {
    layoutSubtree(nodes, c.id, cx + ws[i] / 2 - ORG_NW / 2, cy, out);
    cx += ws[i] + ORG_HG;
  });
}

/**
 * Top-left position of every node; roots are laid out side by side.
 * @param {Array<{id: string, pid: string|null}>} nodes
 * @returns {Record<string, {x: number, y: number}>}
 */
export function orgPositions(nodes) {
  const positions = {};
  let ox = 0;
  nodes.filter(n => n.pid == null).forEach(r => {
    const w = subtreeWidth(nodes, r.id);
    layoutSubtree(nodes, r.id, ox + w / 2 - ORG_NW / 2, 0, positions);
    ox += w + ORG_HG * 2;
  });
  return positions;
}

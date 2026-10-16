/**
 * D.Mike — Project charter: org chart as a node-diagram config
 *
 * Pure function, no DOM: node heights are measured by the caller. Used for the
 * image export (nodes + links) and the on-screen connector overlay (links
 * only — every link carries explicit endpoints for that reason).
 */

/** Map line style names to SVG stroke-dasharray values */
export const DASH_MAP = { solid: 'none', dashed: '8 4', dotted: '2 4' };

const FALLBACK_HEIGHT = 70;

/** @param {string} style @returns {string|undefined} */
function dashFor(style) {
  const d = DASH_MAP[style];
  return d && d !== 'none' ? d : undefined;
}

/**
 * @param {Array} orgNodes - flat org nodes ({ id, pid, title, desc, _x, _y, _h, bg, borderColor, borderWidth, borderStyle })
 * @param {Object} orgStyle - global node/line style (ORG_STYLE_DEFAULTS shape)
 * @param {Map<string, number>} heights - rendered node heights in px
 * @param {{ selectedId: string|null, width: number }} opts - width = node width
 * @returns {{ nodes: Array, links: Array }}
 */
export function buildOrgDiagram(orgNodes, orgStyle, heights, { selectedId = null, width }) {
  const style = orgStyle || {};
  const visible = orgNodes.filter((n) => !n._h);
  const byId = new Map(visible.map((n) => [n.id, n]));
  const heightOf = (id) => heights.get(id) ?? FALLBACK_HEIGHT;

  const nodes = visible.map((n) => ({
    id: n.id,
    x: n._x, y: n._y, w: width, h: heightOf(n.id),
    lines: [
      { text: n.title, size: 13, weight: 600 },
      ...(n.desc ? [{ text: n.desc, size: 11, muted: true }] : []),
    ],
    fill: n.bg || style.nodeBg || undefined,
    stroke: n.borderColor || style.nodeBorderColor || undefined,
    strokeWidth: n.borderWidth || style.nodeBorderWidth || 1,
    dash: dashFor(n.borderStyle || style.nodeBorderStyle),
    padX: 12, padY: 8, lineHeight: 18,
  }));

  const links = [];
  for (const n of visible) {
    if (n.pid == null) continue;
    const parent = byId.get(n.pid);
    if (!parent) continue;
    links.push({
      from: parent.id, to: n.id, shape: 'curve',
      x1: parent._x + width / 2, y1: parent._y + heightOf(parent.id),
      x2: n._x + width / 2, y2: n._y,
      color: style.lineColor || undefined,
      width: style.lineWidth || 2,
      dash: dashFor(style.lineStyle),
      highlight: selectedId != null && (n.id === selectedId || parent.id === selectedId),
    });
  }
  return { nodes, links };
}

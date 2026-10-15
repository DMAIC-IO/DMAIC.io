/**
 * node-diagram.js — Boxes connected by lines, at positions the caller computed.
 *
 * Used for the VoC → CTx tree export, the org-chart export and the org chart's
 * on-screen connector overlay (links only). Layout is the module's job; this
 * type only draws. No axes, no zoom/pan/tooltip. See docs/CHARTING.md.
 */

import ChartBase from '../chart-base.js';
import { svgEl, svgText, resolveColor } from '../chart-core.js';

/** Font family embedded in the SVG for export fidelity (as in other types). */
const FONT_MAIN = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

/** Theme tokens for every colour the caller leaves unset. */
const TOKENS = {
  text: '--color-text-primary',
  muted: '--color-text-secondary',
  nodeStroke: '--color-border-secondary',
  nodeFill: '--color-bg-secondary',
  link: '--color-border-primary',
  badgeText: '--color-text-inverse',
};

const NODE_DEFAULTS = { radius: 6, padX: 10, padY: 6, lineHeight: 16, strokeWidth: 1 };
const BADGE = { h: 14, gap: 4, charW: 6.5, extraW: 8, fontSize: 9, radius: 3 };
const LINK_DEFAULT_WIDTH = 1.5;

/**
 * Endpoints of a link: explicit x1…y2 win, else derived from the nodes.
 * @param {Object} link
 * @param {Map<string, Object>} byId - nodes by id
 * @param {number} elbowInset - horizontal offset of an elbow's vertical leg left of the child
 * @returns {{x1:number,y1:number,x2:number,y2:number}|null} null when neither is available
 */
export function linkEndpoints(link, byId, elbowInset) {
  if ([link.x1, link.y1, link.x2, link.y2].every(Number.isFinite)) {
    return { x1: link.x1, y1: link.y1, x2: link.x2, y2: link.y2 };
  }
  const from = byId.get(link.from);
  const to = byId.get(link.to);
  if (!from || !to) return null;
  if (link.shape === 'elbow') {
    return { x1: to.x - elbowInset, y1: from.y + from.h, x2: to.x, y2: to.y + to.h / 2 };
  }
  return { x1: from.x + from.w / 2, y1: from.y + from.h, x2: to.x + to.w / 2, y2: to.y };
}

/**
 * SVG path data for a link.
 * @param {'elbow'|'curve'} shape
 * @param {{x1:number,y1:number,x2:number,y2:number}} p
 * @returns {string}
 */
export function linkPath(shape, p) {
  if (shape === 'elbow') return `M ${p.x1} ${p.y1} L ${p.x1} ${p.y2} L ${p.x2} ${p.y2}`;
  const mid = (p.y1 + p.y2) / 2;
  return `M ${p.x1} ${p.y1} C ${p.x1} ${mid}, ${p.x2} ${mid}, ${p.x2} ${p.y2}`;
}

/** @param {Object} config @returns {{byId: Map, ends: Array}} */
function resolveLinks(config) {
  const nodes = config.nodes || [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const inset = config.elbowInset ?? 18;
  const ends = [];
  for (const link of config.links || []) {
    const p = linkEndpoints(link, byId, inset);
    if (p) ends.push({ link, p });
  }
  return { byId, ends };
}

/**
 * Drawn area in content coordinates.
 * fit:  bounding box of nodes and link endpoints, grown by padding.
 * zero: from (0, 0) to the far edge plus padding (1:1 with an HTML layer).
 * Empty diagrams yield a 0×0 box.
 * @param {Object} config
 * @returns {{x:number,y:number,w:number,h:number}}
 */
export function contentBox(config) {
  const pad = config.padding ?? 20;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const n of config.nodes || []) {
    x1 = Math.min(x1, n.x); y1 = Math.min(y1, n.y);
    x2 = Math.max(x2, n.x + n.w); y2 = Math.max(y2, n.y + n.h);
  }
  for (const { p } of resolveLinks(config).ends) {
    x1 = Math.min(x1, p.x1, p.x2); y1 = Math.min(y1, p.y1, p.y2);
    x2 = Math.max(x2, p.x1, p.x2); y2 = Math.max(y2, p.y1, p.y2);
  }
  if (x1 === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
  if (config.origin === 'zero') return { x: 0, y: 0, w: x2 + pad, h: y2 + pad };
  return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + 2 * pad, h: y2 - y1 + 2 * pad };
}

export default class NodeDiagram extends ChartBase {
  /**
   * Content size known before rendering (used to size offscreen hosts).
   * @param {Object} config
   * @returns {{w:number,h:number}}
   */
  static contentSize(config) {
    const b = contentBox(config);
    return { w: Math.round(b.w), h: Math.round(b.h) };
  }

  constructor(container, config, context) {
    super(container, Object.assign({
      nodes: [], links: [], padding: 20, origin: 'fit', elbowInset: 18, highlightClass: '',
    }, config), context);
  }

  /** No zoom, pan, crosshair or tooltip. @private */
  _setupInteractions() {
    this._editorOpen = false;
  }

  /** The diagram has its own size, independent of the host. @private */
  _getSize() {
    return NodeDiagram.contentSize(this.config);
  }

  _getDataExtent() {
    const b = contentBox(this.config);
    return { xMin: b.x, xMax: b.x + b.w, yMin: b.y, yMax: b.y + b.h };
  }

  _renderData() {}

  render() {
    const svg = this._svg;
    if (!svg) return; // destroyed (late rAF from the constructor)
    const cfg = this.config;
    const box = contentBox(cfg);

    svg.setAttribute('viewBox', `0 0 ${box.w} ${box.h}`);
    svg.setAttribute('width', box.w);
    svg.setAttribute('height', box.h);
    // chart.css stretches chart SVGs to 100% of the wrap; the diagram keeps its own size.
    svg.style.width = `${box.w}px`;
    svg.style.height = `${box.h}px`;
    svg.replaceChildren();

    const styleEl = svgEl('style', {}, svg);
    styleEl.textContent = `text { font-family: ${FONT_MAIN}; }`;

    const col = {};
    for (const [k, token] of Object.entries(TOKENS)) col[k] = resolveColor(`var(${token})`);

    const g = svgEl('g', { 'data-part': 'content', transform: `translate(${-box.x} ${-box.y})` }, svg);
    const { ends } = resolveLinks(cfg);
    for (const { link, p } of ends) this._drawLink(g, link, p, col);
    for (const node of cfg.nodes || []) this._drawNode(g, node, col);
    this._hasRendered = true;
  }

  /** @private */
  _drawLink(parent, link, p, col) {
    const attrs = {
      'data-part': 'link',
      d: linkPath(link.shape, p),
      fill: 'none',
      stroke: link.color ? resolveColor(link.color) : col.link,
      'stroke-width': link.width ?? LINK_DEFAULT_WIDTH,
    };
    if (link.dash && link.dash !== 'none') attrs['stroke-dasharray'] = link.dash;
    const path = svgEl('path', attrs, parent);
    if (link.highlight && this.config.highlightClass) path.classList.add(this.config.highlightClass);
  }

  /** @private */
  _drawNode(parent, node, col) {
    const m = { ...NODE_DEFAULTS, ...node };
    const rect = {
      'data-part': 'node',
      x: node.x, y: node.y, width: node.w, height: node.h, rx: m.radius,
      fill: node.fill ? resolveColor(node.fill) : col.nodeFill,
      stroke: node.stroke ? resolveColor(node.stroke) : col.nodeStroke,
      'stroke-width': m.strokeWidth,
    };
    if (node.dash && node.dash !== 'none') rect['stroke-dasharray'] = node.dash;
    svgEl('rect', rect, parent);

    let ty = node.y + m.padY;
    if (node.badge) {
      const bw = node.badge.text.length * BADGE.charW + BADGE.extraW;
      svgEl('rect', {
        'data-part': 'badge',
        x: node.x + m.padX, y: ty, width: bw, height: BADGE.h, rx: BADGE.radius,
        fill: resolveColor(node.badge.color),
      }, parent);
      svgText(node.badge.text, {
        'data-part': 'badge-text',
        x: node.x + m.padX + bw / 2, y: ty + BADGE.h - 3, 'text-anchor': 'middle',
        'font-size': BADGE.fontSize, 'font-weight': '600', 'letter-spacing': '0.5', fill: col.badgeText,
      }, parent);
      ty += BADGE.h + BADGE.gap;
    }

    for (const line of node.lines || []) {
      const attrs = {
        'data-part': 'line',
        x: node.x + m.padX, y: ty + m.lineHeight - 4,
        'font-size': line.size ?? (line.muted ? this.config.tickSize : this.config.labelSize),
        fill: line.muted ? col.muted : col.text,
      };
      if (line.weight != null) attrs['font-weight'] = line.weight;
      svgText(line.text, attrs, parent);
      ty += m.lineHeight;
    }
  }
}

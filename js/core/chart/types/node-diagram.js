/**
 * node-diagram.js — Boxes connected by lines, at positions the caller computed.
 *
 * Used for the VoC → CTx tree export, the org chart (export + overlay) and the
 * TRIZ function model (export + arrow overlay). Layout is the module's job; this
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
  labelBg: '--color-bg-primary',
};

const NODE_DEFAULTS = { radius: 6, padX: 10, padY: 6, lineHeight: 16, strokeWidth: 1 };
const BADGE = { h: 14, gap: 4, charW: 6.5, extraW: 8, fontSize: 9, radius: 3 };
const LINK_DEFAULT_WIDTH = 1.5;

/** Round to two decimals so path data stays short and deterministic. */
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * Point where a ray from (px, py) in direction (dx, dy) leaves the rectangle.
 * The start is expected inside the rectangle; t is clamped to ≥ 0.
 * @returns {{x:number,y:number}}
 */
function rayExit(px, py, dx, dy, rect) {
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (rect.x + rect.w - px) / dx);
  if (dx < 0) t = Math.min(t, (rect.x - px) / dx);
  if (dy > 0) t = Math.min(t, (rect.y + rect.h - py) / dy);
  if (dy < 0) t = Math.min(t, (rect.y - py) / dy);
  if (!Number.isFinite(t)) t = 0;
  t = Math.max(0, t);
  return { x: px + dx * t, y: py + dy * t };
}

/**
 * Corners of a hexagon node: flat top and bottom, points left and right.
 * @param {{x:number,y:number,w:number,h:number}} n
 * @returns {Array<[number, number]>} clockwise in screen coordinates
 */
export function hexagonPoints(n) {
  const i = Math.min(n.h / 2, n.w / 4);
  const cy = n.y + n.h / 2;
  return [[n.x + i, n.y], [n.x + n.w - i, n.y], [n.x + n.w, cy], [n.x + n.w - i, n.y + n.h], [n.x + i, n.y + n.h], [n.x, cy]];
}

/** Ray exit from an ellipse inscribed in the box; null when the ray misses. */
function ellipseExit(px, py, dx, dy, box) {
  const a = box.w / 2, b = box.h / 2;
  const X = px - (box.x + a), Y = py - (box.y + b);
  const A = (dx * dx) / (a * a) + (dy * dy) / (b * b);
  const B = 2 * ((X * dx) / (a * a) + (Y * dy) / (b * b));
  const C = (X * X) / (a * a) + (Y * Y) / (b * b) - 1;
  const disc = B * B - 4 * A * C;
  if (A === 0 || disc < 0) return null;
  const t = Math.max(0, (-B + Math.sqrt(disc)) / (2 * A));
  return { x: px + dx * t, y: py + dy * t };
}

/** Ray exit from a convex polygon (nearest edge hit ahead); null when the ray misses. */
function polygonExit(px, py, dx, dy, pts) {
  let best = Infinity;
  for (let k = 0; k < pts.length; k++) {
    const [qx, qy] = pts[k];
    const [rx, ry] = pts[(k + 1) % pts.length];
    const ex = rx - qx, ey = ry - qy;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-9) continue;
    const t = ((qx - px) * ey - (qy - py) * ex) / denom;
    const s = ((qx - px) * dy - (qy - py) * dx) / denom;
    if (t >= 0 && s >= -1e-9 && s <= 1 + 1e-9) best = Math.min(best, t);
  }
  return Number.isFinite(best) ? { x: px + dx * best, y: py + dy * best } : null;
}

/** Ray exit from a node's outline (rect, ellipse or hexagon). */
function shapeExit(px, py, dx, dy, node) {
  let p = null;
  if (node.shape === 'ellipse') p = ellipseExit(px, py, dx, dy, node);
  else if (node.shape === 'hexagon') p = polygonExit(px, py, dx, dy, hexagonPoints(node));
  return p ?? rayExit(px, py, dx, dy, node);
}

/**
 * Straight link between two nodes: centre to centre, shifted perpendicular by
 * `offset` (positive = left of the direction of travel in screen coordinates),
 * clipped to both node outlines (box, or `shape` ellipse / hexagon).
 * @param {{x:number,y:number,w:number,h:number}} from
 * @param {{x:number,y:number,w:number,h:number}} to
 * @param {number} [offset=0]
 * @returns {{x1:number,y1:number,x2:number,y2:number}}
 */
export function straightEndpoints(from, to, offset = 0) {
  const cx1 = from.x + from.w / 2, cy1 = from.y + from.h / 2;
  const cx2 = to.x + to.w / 2, cy2 = to.y + to.h / 2;
  const len = Math.hypot(cx2 - cx1, cy2 - cy1);
  if (len === 0) return { x1: r2(cx1), y1: r2(cy1), x2: r2(cx2), y2: r2(cy2) };
  const ux = (cx2 - cx1) / len, uy = (cy2 - cy1) / len;
  const nx = -uy * offset, ny = ux * offset;
  const a = shapeExit(cx1 + nx, cy1 + ny, ux, uy, from);
  const b = shapeExit(cx2 + nx, cy2 + ny, -ux, -uy, to);
  return { x1: r2(a.x), y1: r2(a.y), x2: r2(b.x), y2: r2(b.y) };
}

const BOLD_WIDTH = 3;
const DASHED = '6 4';
const LABEL = { h: 16, charW: 6.2, padX: 4, radius: 3 };

/** Per-instance marker id prefix counter (marker ids must be unique per document). */
let markerSeq = 0;

/**
 * Sine path along a segment, ending in a straight tail so an end marker
 * (orient="auto") points along the link. The wavelength is stretched so a
 * whole number of half waves fits before the tail; the path starts and ends
 * exactly on the endpoints.
 * @param {{x1:number,y1:number,x2:number,y2:number}} p
 * @param {number} [amp=3] @param {number} [wavelength=10] @param {number} [step=2]
 * @param {number} [tail=10] - length of the straight end piece
 * @returns {string}
 */
export function wavePath(p, amp = 3, wavelength = 10, step = 2, tail = 10) {
  const dx = p.x2 - p.x1, dy = p.y2 - p.y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return `M ${p.x1} ${p.y1}`;
  const end = `${r2(p.x2)} ${r2(p.y2)}`;
  const waveLen = len - tail;
  if (waveLen < wavelength) return `M ${r2(p.x1)} ${r2(p.y1)} L ${end}`;
  const ux = dx / len, uy = dy / len;
  const halves = Math.max(1, Math.round((2 * waveLen) / wavelength));
  const n = Math.max(2, Math.ceil(waveLen / step));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const s = (waveLen * i) / n;
    const o = amp * Math.sin((Math.PI * halves * s) / waveLen);
    pts.push(`${r2(p.x1 + ux * s - uy * o)} ${r2(p.y1 + uy * s + ux * o)}`);
  }
  return `M ${pts[0]} L ${pts.slice(1).join(' L ')} L ${end}`;
}

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
  if (link.shape === 'straight') return straightEndpoints(from, to, link.offset ?? 0);
  if (link.shape === 'elbow') {
    return { x1: to.x - elbowInset, y1: from.y + from.h, x2: to.x, y2: to.y + to.h / 2 };
  }
  return { x1: from.x + from.w / 2, y1: from.y + from.h, x2: to.x + to.w / 2, y2: to.y };
}

/**
 * SVG path data for a link.
 * @param {'elbow'|'curve'|'straight'} shape
 * @param {{x1:number,y1:number,x2:number,y2:number}} p
 * @returns {string}
 */
export function linkPath(shape, p) {
  if (shape === 'straight') return `M ${p.x1} ${p.y1} L ${p.x2} ${p.y2}`;
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

    const defs = (cfg.links || []).some((l) => l.arrow === 'end') ? svgEl('defs', {}, svg) : null;
    const g = svgEl('g', { 'data-part': 'content', transform: `translate(${-box.x} ${-box.y})` }, svg);
    const { ends } = resolveLinks(cfg);
    ends.forEach(({ link, p }, i) => this._drawLink(g, link, p, col, defs, i));
    for (const { link, p } of ends) if (link.label) this._drawLabel(g, link, p, col);
    for (const node of cfg.nodes || []) this._drawNode(g, node, col);
    this._hasRendered = true;
  }

  /** @private */
  _drawLink(parent, link, p, col, defs, index) {
    const stroke = link.color ? resolveColor(link.color) : col.link;
    const attrs = {
      'data-part': 'link',
      d: link.style === 'wave' ? wavePath(p) : linkPath(link.shape, p),
      fill: 'none',
      stroke,
      'stroke-width': link.width ?? (link.style === 'bold' ? BOLD_WIDTH : LINK_DEFAULT_WIDTH),
    };
    const dash = link.dash ?? (link.style === 'dashed' ? DASHED : null);
    if (dash && dash !== 'none') attrs['stroke-dasharray'] = dash;
    if (link.id != null) attrs['data-id'] = link.id;
    if (link.arrow === 'end' && defs) attrs['marker-end'] = `url(#${this._marker(defs, index, stroke)})`;
    const path = svgEl('path', attrs, parent);
    if (link.highlight && this.config.highlightClass) path.classList.add(this.config.highlightClass);
  }

  /**
   * One arrowhead marker per link, filled in the link colour.
   * @private
   * @returns {string} marker id
   */
  _marker(defs, index, color) {
    this._markerPrefix ??= `nd-${++markerSeq}`;
    const id = `${this._markerPrefix}-a${index}`;
    const marker = svgEl('marker', {
      id, viewBox: '0 0 10 10', refX: 9, refY: 5,
      markerWidth: 10, markerHeight: 10, markerUnits: 'userSpaceOnUse', orient: 'auto',
    }, defs);
    svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: color }, marker);
    return id;
  }

  /** Verb label at the midpoint of the link's endpoints. @private */
  _drawLabel(parent, link, p, col) {
    const text = String(link.label);
    const mx = r2((p.x1 + p.x2) / 2), my = r2((p.y1 + p.y2) / 2);
    const w = text.length * LABEL.charW + LABEL.padX * 2;
    svgEl('rect', {
      'data-part': 'link-label-bg',
      x: r2(mx - w / 2), y: my - LABEL.h / 2, width: r2(w), height: LABEL.h, rx: LABEL.radius,
      fill: col.labelBg,
    }, parent);
    svgText(text, {
      'data-part': 'link-label',
      x: mx, y: my + 4, 'text-anchor': 'middle', 'font-size': this.config.tickSize, fill: col.muted,
    }, parent);
  }

  /** @private */
  _drawNode(parent, node, col) {
    const m = { ...NODE_DEFAULTS, ...node };
    const attrs = {
      'data-part': 'node',
      fill: node.fill ? resolveColor(node.fill) : col.nodeFill,
      stroke: node.stroke ? resolveColor(node.stroke) : col.nodeStroke,
      'stroke-width': m.strokeWidth,
    };
    if (node.dash && node.dash !== 'none') attrs['stroke-dasharray'] = node.dash;
    let outline;
    if (node.shape === 'ellipse') {
      outline = svgEl('ellipse', {
        ...attrs, cx: node.x + node.w / 2, cy: node.y + node.h / 2, rx: node.w / 2, ry: node.h / 2,
      }, parent);
    } else if (node.shape === 'hexagon') {
      const points = hexagonPoints(node).map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ');
      outline = svgEl('polygon', { ...attrs, points }, parent);
    } else {
      outline = svgEl('rect', { ...attrs, x: node.x, y: node.y, width: node.w, height: node.h, rx: m.radius }, parent);
    }
    if (node.id != null) outline.setAttribute('data-id', node.id);
    if (node.highlight && this.config.highlightClass) outline.classList.add(this.config.highlightClass);
    const centered = node.align === 'center';

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
        x: centered ? node.x + node.w / 2 : node.x + m.padX, y: ty + m.lineHeight - 4,
        'font-size': line.size ?? (line.muted ? this.config.tickSize : this.config.labelSize),
        fill: line.muted ? col.muted : col.text,
      };
      if (centered) attrs['text-anchor'] = 'middle';
      if (line.weight != null) attrs['font-weight'] = line.weight;
      svgText(line.text, attrs, parent);
      ty += m.lineHeight;
    }
  }
}

/**
 * D.Mike — Project charter: Anordnung des Organigramms.
 *
 * Eine reine Funktion für Modul und Kachel; sie liefert Positionen und
 * Verbindungen im Format des Widgets `node-links`. Kein DOM-Zugriff.
 */
import { childrenOf } from './tree.js';

/** Modul: gemessene Höhen, Wurzel bei y = 60, Abstand Eltern/Kinder 36. */
export const MODULE_LAYOUT = Object.freeze({ nodeW: 220, hGap: 44, vGap: 36, rootY: 60, fallbackH: 70 });
/** Kachel: feste Höhe, Wurzel bei y = 0, Abstand Eltern/Kinder 28. */
export const TILE_LAYOUT = Object.freeze({ nodeW: 220, hGap: 44, vGap: 28, rootY: 0, fallbackH: 64 });

/** Linienart → `stroke-dasharray`; durchgezogen hat keinen Eintrag. */
export const DASH = Object.freeze({ dashed: '8 4', dotted: '2 4' });

/**
 * @typedef {object} OrgLink Verbindung für `node-links` (Mitte unten → Mitte oben)
 * @property {string} from @property {string} to @property {'curve'} shape
 * @property {number} x1 @property {number} y1 @property {number} x2 @property {number} y2
 */

/**
 * @param {Array<{id: string, pid: string|null}>} nodes flache Liste, Geschwisterfolge = Listenfolge
 * @param {object} [opts]
 * @param {Iterable<string>} [opts.collapsed] ids eingeklappter Knoten
 * @param {Record<string, number>|Map<string, number>} [opts.heights] Knotenhöhen; fehlend → `fallbackH`
 * @param {number} [opts.nodeW] @param {number} [opts.vGap] @param {number} [opts.hGap]
 * @param {number} [opts.rootY] @param {number} [opts.fallbackH] Vorgabe: `MODULE_LAYOUT`
 * @returns {{ positions: Record<string, {x: number, y: number, w: number, h: number}>, links: OrgLink[], width: number, height: number }}
 *   nur sichtbare Knoten (Kinder eingeklappter Knoten fehlen)
 */
export function layoutOrg(nodes, opts = {}) {
  const { collapsed = [], heights = {}, nodeW, vGap, hGap, rootY, fallbackH } = { ...MODULE_LAYOUT, ...opts };
  const folded = new Set(collapsed);
  const ids = new Set(nodes.map((n) => n.id));
  const heightOf = (id) => (heights instanceof Map ? heights.get(id) : heights[id]) ?? fallbackH;
  const kids = (id) => (folded.has(id) ? [] : childrenOf(nodes, id));

  const widths = new Map();
  const widthOf = (id) => {
    if (widths.has(id)) return widths.get(id);
    const c = kids(id);
    const w = c.length ? Math.max(nodeW, c.reduce((s, k) => s + widthOf(k.id), 0) + hGap * (c.length - 1)) : nodeW;
    widths.set(id, w);
    return w;
  };

  /** @type {Record<string, { x: number, y: number, w: number, h: number }>} */
  const positions = {};
  const links = [];
  const place = (id, x, y) => {
    positions[id] = { x, y, w: nodeW, h: heightOf(id) };
    const c = kids(id);
    if (!c.length) return;
    const cy = y + heightOf(id) + vGap;
    const ws = c.map((k) => widthOf(k.id));
    let cx = x + nodeW / 2 - (ws.reduce((s, w) => s + w, 0) + hGap * (c.length - 1)) / 2;
    c.forEach((k, i) => {
      place(k.id, cx + ws[i] / 2 - nodeW / 2, cy);
      links.push({ from: id, to: k.id, shape: 'curve' });
      cx += ws[i] + hGap;
    });
  };

  let ox = 0;
  for (const r of nodes.filter((n) => n.pid == null || !ids.has(n.pid))) {
    const w = widthOf(r.id);
    place(r.id, ox + w / 2 - nodeW / 2, rootY);
    ox += w + hGap * 2;
  }
  for (const l of links) {
    const p = positions[l.from];
    const c = positions[l.to];
    Object.assign(l, { x1: p.x + nodeW / 2, y1: p.y + p.h, x2: c.x + nodeW / 2, y2: c.y });
  }

  const all = Object.values(positions);
  return {
    positions,
    links,
    width: all.reduce((m, p) => Math.max(m, p.x + p.w), 0),
    height: all.reduce((m, p) => Math.max(m, p.y + p.h), 0),
  };
}

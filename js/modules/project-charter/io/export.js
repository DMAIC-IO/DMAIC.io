/**
 * D.Mike — Project charter: Organigramm als Konfiguration für `node-diagram`.
 *
 * Reine Funktion ohne DOM: die gemessenen Knotenhöhen und die aufgelösten
 * Themenfarben kommen vom Aufrufer. Positionen und Verbindungen stammen aus
 * `layoutOrg`. Schlüssel ohne Wert fehlen im Ergebnis (kein `undefined`).
 */
import { layoutOrg, DASH } from '../domain/layout.js';

/** Themenvariablen, die der Export für ungesetzte Farben auflöst. */
export const EXPORT_CSS_VARS = Object.freeze({
  nodeFill: '--color-bg-secondary',
  nodeStroke: '--color-border-secondary',
  link: '--color-border-primary',
});

/**
 * Setzt `key` nur, wenn `value` einen Inhalt hat.
 * @param {object} target @param {string} key @param {unknown} value @returns {void}
 */
function setIf(target, key, value) {
  if (value !== undefined && value !== null && value !== '') target[key] = value;
}

/**
 * @param {{ orgChart: Array<object>, orgStyle: object }} model Modell oder gelesener Stand
 * @param {object} opts
 * @param {Record<string, number>|Map<string, number>} opts.heights gemessene Knotenhöhen; fehlend → Vorgabehöhe
 * @param {Iterable<string>} [opts.collapsed] eingeklappte Knoten; ihre Nachfahren fehlen im Bild
 * @param {(map: Record<string, string>) => Record<string, string>} opts.cssVars löst Themenvariablen auf
 * @returns {{ nodes: object[], links: object[], padding: number }}
 */
export function orgExportConfig(model, { heights, cssVars, collapsed = [] }) {
  const style = model.orgStyle ?? {};
  const theme = cssVars(EXPORT_CSS_VARS);
  const { positions, links } = layoutOrg(model.orgChart, { heights, collapsed });
  const dashFor = (s) => DASH[s];

  const nodes = [];
  for (const n of model.orgChart) {
    const p = positions[n.id];
    if (!p) continue;
    const node = {
      id: n.id, x: p.x, y: p.y, w: p.w, h: p.h,
      lines: [
        { text: n.title, size: 13, weight: 600 },
        ...(n.desc ? [{ text: n.desc, size: 11, muted: true }] : []),
      ],
      strokeWidth: n.borderWidth || style.nodeBorderWidth || 1,
      padX: 12, padY: 8, lineHeight: 18,
    };
    setIf(node, 'fill', n.bg || style.nodeBg || theme.nodeFill);
    setIf(node, 'stroke', n.borderColor || style.nodeBorderColor || theme.nodeStroke);
    setIf(node, 'dash', dashFor(n.borderStyle || style.nodeBorderStyle));
    nodes.push(node);
  }

  const out = links.map((l) => {
    const link = { ...l, width: style.lineWidth || 2 };
    setIf(link, 'color', style.lineColor || theme.link);
    setIf(link, 'dash', dashFor(style.lineStyle));
    return link;
  });
  return { nodes, links: out, padding: 30 };
}


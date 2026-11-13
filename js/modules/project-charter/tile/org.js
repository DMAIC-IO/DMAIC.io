/**
 * D.Mike — Project charter: Kachel Organigramm.
 */
/*
 * Knoten als HTML fester Höhe (`TILE_LAYOUT`) in `x-fit`, Linien über
 * `node-links` mit dem globalen `orgStyle` (gleiche Strichmuster wie das Modul).
 */
import { createTile } from '../../../core/template-tile.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { layoutOrg, TILE_LAYOUT, DASH } from '../domain/layout.js';
import { enumerateFirst, tileTitleKey } from './enumerate.js';

/** Beschreibung im Knoten: höchstens 38 Zeichen. */
const DESC_MAX = 38;

const titleKey = tileTitleKey('org');

/** Eigener Wert vor globalem; leer bleibt leer. @param {string|undefined} own @param {string} global @returns {string} */
const pick = (own, global) => (own || global || '');

export default createTile({
  descriptor,
  Model: State,
  kind: 'org-chart',
  titleKey,
  template: 'tile.org.html',
  size: { defaultW: 6, defaultH: 10, minW: 3, minH: 6 },
  enumerate: enumerateFirst('org-chart', titleKey),

  /** @type {import('../../../core/template-tile.js').TileViewFn<Readonly<import('../domain/model.types.js').StateModel>, {}>} */
  view(_ctx) {
    return {
      /** Kein Organigramm. */
      get empty() { return this.model.orgChart.length === 0; },
      /** Anordnung mit fester Knotenhöhe. */
      get arranged() {
        return layoutOrg(this.model.orgChart.map((n) => ({ ...n })), TILE_LAYOUT);
      },
      /** Größe der Fläche, die `x-fit` in die Kachel einpasst. @returns {Record<string, string>} */
      get canvasStyle() {
        return { width: `${this.arranged.width}px`, height: `${this.arranged.height}px` };
      },
      /** Knoten mit Position und Stil; eigener Wert vor globalem `orgStyle`. */
      get nodes() {
        const g = this.model.orgStyle;
        const { positions } = this.arranged;
        return this.model.orgChart.filter((n) => positions[n.id]).map((n) => {
          const p = positions[n.id];
          /** @type {Record<string, string>} */
          const style = { left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, height: `${p.h}px` };
          const bg = pick(n.bg, g.nodeBg);
          const color = pick(n.borderColor, g.nodeBorderColor);
          if (bg) style['--pc-org-node-bg'] = bg;
          if (color) style['--pc-org-node-border-color'] = color;
          style['--pc-org-node-border-style'] = pick(n.borderStyle, g.nodeBorderStyle) || 'solid';
          style['--pc-org-node-border-width'] = `${n.borderWidth || g.nodeBorderWidth}px`;
          const desc = n.desc || '';
          return {
            id: n.id, title: n.title, style,
            desc: desc.length > DESC_MAX ? `${desc.slice(0, DESC_MAX - 2)}…` : desc,
          };
        });
      },
      /** Konfiguration des Widgets `node-links`: Linienstil aus dem globalen `orgStyle`. */
      get orgLinks() {
        const g = this.model.orgStyle;
        const dash = DASH[g.lineStyle];
        const links = this.arranged.links.map((l) => ({
          ...l, width: g.lineWidth,
          ...(g.lineColor ? { color: g.lineColor } : {}),
          ...(dash ? { dash } : {}),
        }));
        return { links, padding: 0, origin: 'zero' };
      },
    };
  },
});

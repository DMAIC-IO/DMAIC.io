/**
 * D.Mike — Project charter: Kacheln (Problembeschreibung, Ziele, Organigramm).
 */
/*
 * Drei Einzelkacheln mit festen Ids (`project-charter`, `project-goals`,
 * `org-chart`), jede an die erste Charter-Instanz gebunden. Form: createTile
 * (core/template-tile.js); Markup in resources/tile.html, tile.goals.html und
 * tile.org.html, Ziele in goals.js, Organigramm in org.js. Das Problem läuft
 * über `x-rich-text`.
 */
import { createTile } from '../../../core/template-tile.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { enumerateFirst, tileTitleKey } from './enumerate.js';
import goalsTile from './goals.js';
import orgTile from './org.js';

const titleKey = tileTitleKey('charter');

const charterTile = createTile({
  descriptor,
  Model: State,
  kind: 'project-charter',
  titleKey,
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  enumerate: enumerateFirst('project-charter', titleKey),

  /** @type {import('../../../core/template-tile.js').TileViewFn<Readonly<import('../domain/model.types.js').StateModel>, {}>} */
  view(_ctx) {
    return {
      /** Problembeschreibung (Markdown-Untermenge). */
      get problem() { return this.model.problemStatement; },
      /** Keine Problembeschreibung hinterlegt. */
      get empty() { return !this.model.problemStatement; },
    };
  },
});

export default [charterTile, goalsTile, orgTile];

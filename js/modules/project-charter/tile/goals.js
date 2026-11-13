/**
 * D.Mike — Project charter: Kachel Projektziele (Zielerreichung je Ziel).
 */
import { createTile } from '../../../core/template-tile.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { zegLevel } from '../domain/goals.js';
import { enumerateFirst, tileTitleKey } from './enumerate.js';

const titleKey = tileTitleKey('goals');

export default createTile({
  descriptor,
  Model: State,
  kind: 'project-goals',
  titleKey,
  template: 'tile.goals.html',
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  enumerate: enumerateFirst('project-goals', titleKey),

  /** @type {import('../../../core/template-tile.js').TileViewFn<Readonly<import('../domain/model.types.js').StateModel>, {}>} */
  view(_ctx) {
    return {
      /** Keine Ziele. */
      get empty() { return this.model.goals.length === 0; },
      /** Ziele mit auf 0..100 geklemmter Zielerreichung und Farbklasse des Moduls. */
      get goals() {
        return this.model.goals.map((g, i) => {
          const zeg = Math.max(0, Math.min(100, g.achievementLevel ?? 0));
          return {
            desc: g.description || this.t('tiles.goals.unnamed', { n: i + 1 }),
            zeg: `${zeg}%`,
            zegClass: `pc__zeg-level--${zegLevel(zeg)}`,
            fillStyle: `width:${zeg}%`,
          };
        });
      },
    };
  },
});

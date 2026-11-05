/**
 * D.Mike — SIPOC dashboard tile
 *
 * "How is the process framed?" — compact five-column board with the count
 * and the first entries per column; empty columns are marked as gaps. One
 * tile per instance; source/copies via the host.
 * Importiert nur domain/; das Markup liegt in resources/tile.html.
 * Tile contract: the lifecycle in js/pages/dashboard/tile-render.js.
 */

import { State } from '../domain/model.js';
import { columnSummary } from '../domain/summary.js';

/**
 * Gespeicherten Zustand für die Kachel laden, ohne zu werfen: streng, sonst
 * repariert, sonst (neuere oder unlesbare Version) leer.
 * @param {object|undefined} state
 * @returns {InstanceType<typeof State>}
 */
function readState(state) {
  try { return State.fromJSON(state); } catch { /* reparieren */ }
  try { return State.fromJSON(state, { repair: true }); } catch { return new State(); }
}

export default {
  size: { defaultW: 6, defaultH: 10, minW: 4, minH: 6 },
  titlePrefix: 'SIPOC',
  settings: {
    topN: { type: 'number', min: 1, max: 10, step: 1, default: 3, label: 'dashboard.tileSettings.topN' },
  },
  template: 'js/modules/sipoc/resources/tile.html',

  /**
   * Board data, or the empty state when no column has an entry.
   * @param {{state: object, settings: {topN: number}, i18n: object}} args
   * @returns {{empty: string|null, filled: string|null, columns: Array<object>}}
   */
  viewModel({ state, settings, i18n }) {
    const model = readState(state);
    if (!model.hasContent()) return { empty: i18n.t('dashboard.sipocEmpty'), filled: null, columns: [] };
    const cols = columnSummary(model, settings.topN);
    const filled = cols.filter(c => c.count > 0).length;
    return {
      empty: null,
      filled: filled < cols.length ? i18n.t('dashboard.sipocFilled', { filled, total: cols.length }) : null,
      columns: cols.map(c => ({
        key: c.key,
        letter: c.letter,
        name: i18n.t(`modules.sipoc.col.${c.key}`),
        count: String(c.count),
        gap: c.count === 0,
        modifier: c.count === 0 ? 'dashboard-sipoc__col--gap' : '',
        items: [...c.top],
        more: c.more ? i18n.t('dashboard.sipocMore', { n: c.more }) : null,
      })),
    };
  },
};

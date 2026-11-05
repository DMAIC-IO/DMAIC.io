/**
 * D.Mike — SIPOC-Kachel
 *
 * „Wie ist der Prozess gerahmt?“ — kompaktes Fünf-Spalten-Brett mit der
 * Anzahl und den ersten Einträgen je Spalte; leere Spalten sind als Lücke
 * markiert. Eine Kachel je Instanz; Quelle und Kopien über den Host.
 * Importiert aus dem Modul nur domain/; das Markup liegt in resources/tile.html.
 * Kachel-Vertrag: der Lebenszyklus in js/pages/dashboard/tile-render.js.
 */

import { readModel } from '../../../core/model.js';
import { topN } from '../../../ui/tile-kit.js';
import { State } from '../domain/model.js';
import { columnSummary } from '../domain/summary.js';

export default {
  size: { defaultW: 6, defaultH: 10, minW: 4, minH: 6 },
  titlePrefix: 'SIPOC',
  settings: {
    topN: topN({ default: 3 }),
  },
  template: 'js/modules/sipoc/resources/tile.html',

  /**
   * Brett-Daten oder der Leerzustand, wenn keine Spalte einen Eintrag hat.
   * @param {{state: object, settings: {topN: number}, i18n: object}} args
   * @returns {{empty: string|null, filled: string|null, columns: Array<object>}}
   */
  viewModel({ state, settings, i18n }) {
    const model = readModel(State, state);
    if (!model.hasContent()) return { empty: i18n.t('modules.sipoc.tileEmpty'), filled: null, columns: [] };
    const cols = columnSummary(model, settings.topN);
    const filled = cols.filter(c => c.count > 0).length;
    return {
      empty: null,
      filled: filled < cols.length ? i18n.t('modules.sipoc.tileFilled', { filled, total: cols.length }) : null,
      columns: cols.map(c => {
        const gap = c.count === 0;
        return {
          key: c.key,
          letter: c.letter,
          name: i18n.t(`modules.sipoc.col.${c.key}`),
          count: String(c.count),
          gap,
          modifier: gap ? 'dashboard-sipoc__col--gap' : '',
          items: [...c.top],
          more: c.more ? i18n.t('modules.sipoc.tileMore', { n: c.more }) : null,
        };
      }),
    };
  },
};

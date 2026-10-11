/**
 * D.Mike — SIPOC dashboard tile (sipoc.tile.js)
 *
 * "How is the process framed?" — compact five-column board with the count
 * and the first entries per column; empty columns are marked as gaps. One
 * tile per instance; source/copies via the host. Imports only the model.
 * Contract: docs/DASHBOARD.md.
 */

import { h } from '../../core/dom.js';
import { State, columnSummary } from './sipoc-model.js';

/**
 * One board column: head (letter, name, count) and its entries, or a gap.
 * @param {{key: string, letter: string, count: number, top: string[], more: number}} col
 * @param {object} i18n
 * @returns {HTMLElement}
 */
function column(col, i18n) {
  const gap = col.count === 0;
  return h('section', { class: `dashboard-sipoc__col${gap ? ' dashboard-sipoc__col--gap' : ''}`, 'data-col': col.key },
    h('header', { class: 'dashboard-sipoc__head' },
      h('span', { class: 'dashboard-sipoc__letter' }, col.letter),
      h('span', { class: 'dashboard-sipoc__name' }, i18n.t(`modules.sipoc.col.${col.key}`)),
      h('span', { class: 'dashboard-sipoc__count' }, String(col.count)),
    ),
    gap
      ? h('p', { class: 'dashboard-sipoc__gap' }, '—')
      : h('ul', { class: 'dashboard-sipoc__items' },
        ...col.top.map(text => h('li', { class: 'dashboard-sipoc__item', title: text }, text))),
    col.more ? h('p', { class: 'dashboard-sipoc__more' }, i18n.t('dashboard.sipocMore', { n: col.more })) : null,
  );
}

export default {
  size: { defaultW: 6, defaultH: 10, minW: 4, minH: 6 },
  titlePrefix: 'SIPOC',
  settings: {
    topN: { type: 'number', min: 1, max: 10, step: 1, default: 3, label: 'dashboard.tileSettings.topN' },
  },

  /**
   * Render the board, or the empty state when no column has an entry.
   * @param {HTMLElement} host
   * @param {{state: object, settings: {topN: number}, i18n: object}} args
   */
  render(host, { state, settings, i18n }) {
    const model = State.fromJSON(state);
    if (!model.hasContent()) {
      host.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.sipocEmpty')));
      return;
    }
    const cols = columnSummary(model, settings.topN);
    const filled = cols.filter(c => c.count > 0).length;
    const children = [];
    if (filled < cols.length) {
      children.push(h('p', { class: 'dashboard-sipoc__filled' },
        i18n.t('dashboard.sipocFilled', { filled, total: cols.length })));
    }
    children.push(h('div', { class: 'dashboard-sipoc__board' }, ...cols.map(c => column(c, i18n))));
    host.replaceChildren(...children);
  },
};

/**
 * D.Mike — Lessons learned dashboard tile (lessons-learned.tile.js)
 *
 * Category counts, open actions and the high-impact lessons that still have
 * open actions. Imports only the pure model. Contract: docs/DASHBOARD.md.
 */

import { h } from '../../core/dom.js';
import { State, openHighImpact } from './lessons-learned-model.js';

export default {
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  settings: {
    topN: { type: 'number', min: 1, max: 10, step: 1, default: 5, label: 'dashboard.tileSettings.topN' },
  },

  /**
   * @param {HTMLElement} host
   * @param {{state: object, settings: {topN: number}, i18n: object}} args
   */
  render(host, { state, settings, i18n }) {
    const model = State.fromJSON(state);
    if (model.lessons.length === 0) {
      host.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.lessonsEmpty')));
      return;
    }
    const stats = model.computeStats();
    const stat = (key, label, extraClass = '') => h('span', { 'data-stat': key, class: extraClass || null },
      `${label}: `, h('strong', {}, String(stats[key])));
    const summary = h('div', { class: 'dashboard-fmea__summary' },
      stat('success', i18n.t('modules.lessons-learned.cat_success')),
      stat('problem', i18n.t('modules.lessons-learned.cat_problem')),
      stat('improve', i18n.t('modules.lessons-learned.cat_improve')),
      stat('openActions', i18n.t('dashboard.lessonsOpenActions'), stats.openActions > 0 ? 'dashboard-lessons__open--alert' : ''));
    const children = [summary];
    const top = openHighImpact(model.lessons, settings.topN);
    if (top.length) {
      children.push(h('div', { class: 'dashboard-fmea__top-label' }, i18n.t('dashboard.lessonsHighOpen')));
      children.push(h('ol', { class: 'dashboard-fmea__top-list' },
        ...top.map(l => h('li', { class: 'dashboard-fmea__top-item' },
          h('span', { class: 'dashboard-fmea__top-desc' }, l.title || '—'),
          h('span', { class: 'dashboard-fmea__top-rpn' }, String(l.actions.filter(a => !a.done).length))))));
    }
    host.replaceChildren(...children);
  },
};

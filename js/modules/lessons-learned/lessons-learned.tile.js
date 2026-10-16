/**
 * D.Mike — Lessons learned dashboard tile (lessons-learned.tile.js)
 *
 * Category counts, open actions and the high-impact lessons that still have
 * open actions. Imports only the pure model; the markup lives in
 * lessons-learned.tile.html. Contract: docs/DASHBOARD.md.
 */

import { State, openHighImpact } from './lessons-learned-model.js';

export default {
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  settings: {
    topN: { type: 'number', min: 1, max: 10, step: 1, default: 5, label: 'dashboard.tileSettings.topN' },
  },

  template: 'js/modules/lessons-learned/lessons-learned.tile.html',

  /**
   * Category counts, open actions and the high-impact lessons with open actions.
   * @param {{state: object, settings: {topN: number}, i18n: object}} args
   * @returns {object} view model for lessons-learned.tile.html
   */
  viewModel({ state, settings, i18n }) {
    const model = State.fromJSON(state);
    if (model.lessons.length === 0) {
      return { empty: i18n.t('dashboard.lessonsEmpty'), stats: [], topLabel: null, top: [] };
    }
    const stats = model.computeStats();
    const stat = (key, label, modifier = '') => ({ key, label: `${label}: `, value: String(stats[key]), modifier });
    const top = openHighImpact(model.lessons, settings.topN);
    return {
      empty: null,
      stats: [
        stat('success', i18n.t('modules.lessons-learned.cat_success')),
        stat('problem', i18n.t('modules.lessons-learned.cat_problem')),
        stat('improve', i18n.t('modules.lessons-learned.cat_improve')),
        stat('openActions', i18n.t('dashboard.lessonsOpenActions'),
          stats.openActions > 0 ? 'dashboard-lessons__open--alert' : ''),
      ],
      topLabel: top.length ? i18n.t('dashboard.lessonsHighOpen') : null,
      top: top.map(l => ({ title: l.title || '—', open: String(l.actions.filter(a => !a.done).length) })),
    };
  },
};

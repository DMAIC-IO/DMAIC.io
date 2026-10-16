/**
 * D.Mike — Stakeholder analysis dashboard tile (stakeholder-analysis.tile.js)
 *
 * Power/interest quadrant counts, support distribution and the critics who
 * must be managed closely. Imports only the pure model; the markup lives in
 * stakeholder-analysis.tile.html. Contract: docs/DASHBOARD.md.
 */

import { State, QUAD_ORDER, quadrantCounts, supportCounts, criticalCritics } from './stakeholder-analysis-model.js';

const QUAD_KEY = { 'manage-closely': 'quadManageClosely', 'keep-satisfied': 'quadKeepSatisfied',
  'keep-informed': 'quadKeepInformed', monitor: 'quadMonitor' };
const SUPPORT_KEY = { supporter: 'modules.stakeholder-analysis.supportSupporter',
  neutral: 'modules.stakeholder-analysis.supportNeutral', critic: 'modules.stakeholder-analysis.supportCritic',
  other: 'dashboard.stakeholderOther' };

export default {
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  settings: {
    showCritics: { type: 'boolean', default: true, label: 'dashboard.tileSettings.showCritics' },
  },

  template: 'js/modules/stakeholder-analysis/stakeholder-analysis.tile.html',

  /**
   * Quadrant counts, support distribution and the critics to manage closely.
   * @param {{state: object, settings: {showCritics: boolean}, i18n: object}} args
   * @returns {object} view model for stakeholder-analysis.tile.html
   */
  viewModel({ state, settings, i18n }) {
    const list = State.fromJSON(state).stakeholders;
    if (list.length === 0) {
      return { empty: i18n.t('dashboard.stakeholderEmpty'), quadrants: [], support: [], criticsLabel: null, critics: [] };
    }
    const quads = quadrantCounts(list);
    const support = supportCounts(list);
    const critics = criticalCritics(list);
    const showCritics = settings.showCritics && critics.length > 0;
    return {
      empty: null,
      quadrants: QUAD_ORDER.map(q => ({
        quadrant: q,
        modifier: `dashboard-stakeholder__cell--${q}`,
        count: String(quads[q]),
        label: i18n.t(`modules.stakeholder-analysis.${QUAD_KEY[q]}`),
      })),
      support: Object.keys(support).filter(k => k !== 'other' || support.other > 0)
        .map(k => ({ key: k, label: `${i18n.t(SUPPORT_KEY[k])}: `, count: String(support[k]) })),
      criticsLabel: showCritics ? i18n.t('dashboard.stakeholderCritics') : null,
      critics: showCritics ? critics.map(s => ({ name: s.name || '—', role: s.role || null })) : [],
    };
  },
};

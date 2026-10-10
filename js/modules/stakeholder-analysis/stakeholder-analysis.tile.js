/**
 * D.Mike — Stakeholder analysis dashboard tile (stakeholder-analysis.tile.js)
 *
 * Power/interest quadrant counts, support distribution and the critics who
 * must be managed closely. Imports only the pure model. Contract: docs/DASHBOARD.md.
 */

import { h } from '../../core/dom.js';
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

  /**
   * @param {HTMLElement} host
   * @param {{state: object, settings: {showCritics: boolean}, i18n: object}} args
   */
  render(host, { state, settings, i18n }) {
    const list = State.fromJSON(state).stakeholders;
    if (list.length === 0) {
      host.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.stakeholderEmpty')));
      return;
    }
    const quads = quadrantCounts(list);
    const support = supportCounts(list);
    const matrix = h('div', { class: 'dashboard-stakeholder__matrix' },
      ...QUAD_ORDER.map(q => h('div', { class: `dashboard-stakeholder__cell dashboard-stakeholder__cell--${q}`, 'data-quadrant': q },
        h('strong', {}, String(quads[q])),
        h('span', {}, i18n.t(`modules.stakeholder-analysis.${QUAD_KEY[q]}`)))));
    const supportRow = h('div', { class: 'dashboard-fmea__summary' },
      ...Object.keys(support).filter(k => k !== 'other' || support.other > 0)
        .map(k => h('span', { 'data-support': k }, `${i18n.t(SUPPORT_KEY[k])}: `, h('strong', {}, String(support[k])))));
    const children = [matrix, supportRow];
    const critics = criticalCritics(list);
    if (settings.showCritics && critics.length) {
      children.push(h('div', { class: 'dashboard-fmea__top-label' }, i18n.t('dashboard.stakeholderCritics')));
      children.push(h('ul', { class: 'dashboard-fmea__top-list dashboard-stakeholder__critics' },
        ...critics.map(s => h('li', { class: 'dashboard-fmea__top-item' },
          h('span', { class: 'dashboard-fmea__top-desc' }, s.name || '—'),
          s.role ? h('span', { class: 'dashboard-todo__owner' }, s.role) : null))));
    }
    host.replaceChildren(...children);
  },
};

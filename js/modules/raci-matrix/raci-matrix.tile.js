/**
 * D.Mike — RACI dashboard tile (raci-matrix.tile.js)
 *
 * One tile per RACI instance (`raci:<instanceId>`). Loaded via the manifest's
 * `loadTile`. Contract: docs/DASHBOARD.md.
 */

import { h } from '../../core/dom.js';

export default {
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  titlePrefix: 'RACI',
  settings: {
    topN: { type: 'number', min: 1, max: 20, step: 1, default: 5, label: 'dashboard.tileSettings.topWarnings' },
    showLegend: { type: 'boolean', default: true, label: 'dashboard.tileSettings.showLegend' },
  },

  /**
   * One tile per RACI instance.
   * @param {{i18n: object, findInstances: function}} ctx
   * @returns {Array<{tileId: string, instanceId: string, title: string}>}
   */
  enumerate(ctx) {
    return ctx.findInstances('raci-matrix').map(inst => ({
      tileId: `raci:${inst.instanceId}`,
      instanceId: inst.instanceId,
      title: `RACI — ${inst.customName || ctx.i18n.t('modules.raci-matrix.name')}`,
    }));
  },

  /**
   * @param {HTMLElement} host
   * @param {{state: object, settings: {topN: number, showLegend: boolean}, i18n: object}} args
   */
  render(host, { state, settings, i18n }) {
    const activities = (state && Array.isArray(state.activities)) ? state.activities : [];
    const stakeholders = (state && Array.isArray(state.stakeholders)) ? state.stakeholders : [];
    const assignments = (state && state.assignments) || {};

    if (activities.length === 0 && stakeholders.length === 0) {
      host.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.raciEmpty')));
      return;
    }

    const counts = { R: 0, A: 0, C: 0, I: 0 };
    const totalCells = activities.length * stakeholders.length;
    let filled = 0;
    for (const val of Object.values(assignments)) {
      if (val && Object.hasOwn(counts, val)) { counts[val]++; filled++; }
    }
    const coverage = totalCells > 0 ? Math.round(filled / totalCells * 100) : 0;

    const roleColors = {
      R: 'var(--color-error)',
      A: 'var(--color-warning)',
      C: 'var(--color-accent)',
      I: 'var(--color-success)',
    };

    const children = [];
    children.push(
      h('div', { class: 'dashboard-raci__summary' },
        h('span', null, `${i18n.t('dashboard.raciActivities')  }: `, h('strong', null, String(activities.length))),
        h('span', null, `${i18n.t('dashboard.raciStakeholders')  }: `, h('strong', null, String(stakeholders.length))),
        h('span', null, `${i18n.t('dashboard.raciCoverage')  }: `, h('strong', null, `${coverage}%`)),
      ),
    );

    if (filled > 0) {
      const bar = h('div', { class: 'dashboard-raci__bar' });
      ['R', 'A', 'C', 'I'].forEach(role => {
        const pct = counts[role] / filled * 100;
        if (pct === 0) return;
        bar.append(h('div', { class: 'dashboard-raci__bar-seg', style: `width:${pct}%;background:${roleColors[role]}`, title: `${role}: ${counts[role]}` }));
      });
      children.push(bar);
    }

    const legend = h('div', { class: 'dashboard-raci__legend' });
    ['R', 'A', 'C', 'I'].filter(r => counts[r] > 0).forEach(role => {
      legend.append(h('span', { class: 'dashboard-raci__legend-item' },
        h('span', { class: 'dashboard-fmea__legend-dot', style: `background:${roleColors[role]}` }),
        `${role}: ${counts[role]}`,
      ));
    });
    if (settings.showLegend) children.push(legend);

    const warnings = [];
    activities.forEach((act, aIdx) => {
      let hasR = false, hasA = false;
      stakeholders.forEach((_, sIdx) => {
        const v = assignments[`${aIdx}:${sIdx}`];
        if (v === 'R') hasR = true;
        if (v === 'A') hasA = true;
      });
      if (!hasR) warnings.push({ act, missing: 'R' });
      if (!hasA) warnings.push({ act, missing: 'A' });
    });

    if (warnings.length > 0) {
      children.push(h('div', { class: 'dashboard-raci__warn-label' }, i18n.t('dashboard.raciWarnings')));
      const ul = h('ul', { class: 'dashboard-raci__warn-list' });
      warnings.slice(0, settings.topN).forEach(w => {
        ul.append(h('li', { class: 'dashboard-raci__warn-item' },
          h('span', { class: 'dashboard-raci__warn-role', style: `color:${roleColors[w.missing]}` }, w.missing),
          ` ${  i18n.t('dashboard.raciMissing')  }: ${  w.act}`,
        ));
      });
      if (warnings.length > settings.topN) {
        ul.append(h('li', { class: 'dashboard-area__muted' }, `… +${warnings.length - settings.topN}`));
      }
      children.push(ul);
    }

    host.replaceChildren(...children);
  },
};

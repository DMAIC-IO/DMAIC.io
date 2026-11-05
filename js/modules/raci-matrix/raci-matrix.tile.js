/**
 * D.Mike — RACI dashboard tile (raci-matrix.tile.js)
 *
 * One tile per RACI instance (`raci:<instanceId>`). Loaded via the manifest's
 * `loadTile`. The markup lives in raci-matrix.tile.html.
 * Tile contract: the lifecycle in js/pages/dashboard/tile-render.js.
 */

import { topN, showLegend, distribution } from '../../ui/tile-kit.js';

const ROLES = ['R', 'A', 'C', 'I'];
const ROLE_COLORS = {
  R: 'var(--color-error)',
  A: 'var(--color-warning)',
  C: 'var(--color-accent)',
  I: 'var(--color-success)',
};

export default {
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  titlePrefix: 'RACI',
  settings: {
    topN: topN({ max: 20, label: 'dashboard.tileSettings.topWarnings' }),
    showLegend: showLegend(),
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

  template: 'js/modules/raci-matrix/raci-matrix.tile.html',

  /**
   * Counts and coverage, role distribution, and activities missing R or A.
   * @param {{state: object, settings: {topN: number, showLegend: boolean}, i18n: object}} args
   * @returns {object} view model for raci-matrix.tile.html
   */
  viewModel({ state, settings, i18n }) {
    const activities = (state && Array.isArray(state.activities)) ? state.activities : [];
    const stakeholders = (state && Array.isArray(state.stakeholders)) ? state.stakeholders : [];
    const assignments = (state && state.assignments) || {};

    if (activities.length === 0 && stakeholders.length === 0) {
      return { empty: i18n.t('dashboard.raciEmpty'), summary: [], segments: [], legend: null,
        warnLabel: null, warnings: [], more: null };
    }

    const counts = { R: 0, A: 0, C: 0, I: 0 };
    const totalCells = activities.length * stakeholders.length;
    let filled = 0;
    for (const val of Object.values(assignments)) {
      if (val && Object.hasOwn(counts, val)) { counts[val]++; filled++; }
    }
    const coverage = totalCells > 0 ? Math.round(filled / totalCells * 100) : 0;

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

    const roles = distribution(ROLES.map(role => ({ key: role, label: role, count: counts[role], color: ROLE_COLORS[role] })));
    return {
      empty: null,
      summary: [
        { label: `${i18n.t('dashboard.raciActivities')}: `, value: String(activities.length) },
        { label: `${i18n.t('dashboard.raciStakeholders')}: `, value: String(stakeholders.length) },
        { label: `${i18n.t('dashboard.raciCoverage')}: `, value: `${coverage}%` },
      ],
      segments: roles.segments,
      legend: settings.showLegend ? roles.legend : null,
      warnLabel: warnings.length ? i18n.t('dashboard.raciWarnings') : null,
      warnings: warnings.slice(0, settings.topN).map(w => ({
        role: w.missing,
        style: `color:${ROLE_COLORS[w.missing]}`,
        text: ` ${i18n.t('dashboard.raciMissing')}: ${w.act}`,
      })),
      more: warnings.length > settings.topN ? `… +${warnings.length - settings.topN}` : null,
    };
  },
};

/**
 * D.Mike — Stakeholder-Kachel
 *
 * Zahl der Beteiligten je Quadrant, Verteilung der Haltungen und die
 * Kritiker, die eng zu managen sind. Form: createTile
 * (core/template-tile.js); Einstellungen in settings.js, Markup in
 * resources/tile.html.
 */

import { createTile } from '../../../core/template-tile.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { QUAD_ORDER, quadrantCounts, supportCounts, criticalCritics } from '../domain/quadrant.js';
import { Settings } from './settings.js';

/** Text je Quadrant (unter `modules.stakeholder-analysis`). */
const QUAD_KEY = {
  'manage-closely': 'quadManageClosely',
  'keep-satisfied': 'quadKeepSatisfied',
  'keep-informed': 'quadKeepInformed',
  monitor: 'quadMonitor',
};

/** Text je Haltung (unter `modules.stakeholder-analysis`). */
const SUPPORT_KEY = { supporter: 'supportSupporter', neutral: 'supportNeutral', critic: 'supportCritic' };

export default createTile({
  descriptor,
  Model: State,
  Settings,
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },

  /** @type {import('./settings.types.js').StakeholderAnalysisTileViewFn} */
  view(ctx) {
    /** @param {string} key @returns {string} */
    const g = (key) => ctx.i18n.t(`dashboard.${key}`);
    return {
      /** Leertext ohne Beteiligte, sonst null. */
      get empty() {
        return this.model.stakeholders.length === 0 ? g('stakeholderEmpty') : null;
      },
      /** Die vier Zellen der Matrix in Rangfolge, je mit Zahl und Namen. */
      get quadCells() {
        const counts = quadrantCounts(this.model.stakeholders);
        return QUAD_ORDER.map((q) => ({
          quadrant: q,
          modifier: `dashboard-stakeholder__cell--${q}`,
          count: String(counts[q]),
          label: this.t(QUAD_KEY[q]),
        }));
      },
      /** Zahl je Haltung; „Sonstige“ nur, wenn es solche gibt. */
      get support() {
        const counts = supportCounts(this.model.stakeholders);
        return Object.keys(counts)
          .filter((k) => k !== 'other' || counts.other > 0)
          .map((k) => ({
            key: k,
            label: `${k === 'other' ? g('stakeholderOther') : this.t(SUPPORT_KEY[k])}: `,
            count: String(counts[/** @type {keyof typeof counts} */ (k)]),
          }));
      },
      /** Die Kritiker in „eng managen“, wenn die Kachel sie zeigt. */
      get critics() {
        if (!this.settings.showCritics) return [];
        return criticalCritics(this.model.stakeholders).map((s) => ({ name: s.name || '—', role: s.role || null }));
      },
      /** Überschrift der Kritikerliste oder null. */
      get criticsLabel() {
        return this.critics.length > 0 ? g('stakeholderCritics') : null;
      },
    };
  },
});

/**
 * D.Mike — RACI-Kachel
 *
 * Zahl der Aktivitäten und Beteiligten, Abdeckung der Matrix, Verteilung der
 * Rollen und die Aktivitäten ohne R bzw. ohne A. Eine Kachel je Instanz
 * (`raci:<instanceId>`). Form: createTile (core/template-tile.js);
 * Einstellungen in settings.js, Markup in resources/tile.html.
 */

import { createTile } from '../../../core/template-tile.js';
import { formatNumber } from '../../../core/number-format.js';
import { distribution } from '../../../ui/tile-kit.js';
import descriptor from '../module.js';
import { State, ROLES } from '../domain/model.js';
import { Settings } from './settings.js';

/** Farbe je Rolle; die Kachel zeigt sie als Punkt, Balken und Schrift. */
const ROLE_COLORS = {
  R: 'var(--color-error)',
  A: 'var(--color-warning)',
  C: 'var(--color-accent)',
  I: 'var(--color-success)',
};

/** Fehlende Rolle je Befund; `multiA` zeigt die Kachel nicht. */
const MISSING = [['noR', 'R'], ['noA', 'A']];

export default createTile({
  descriptor,
  Model: State,
  Settings,
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  titlePrefix: 'RACI',

  /**
   * Eine Kachel je Instanz; die Id `raci:<instanceId>` tragen gespeicherte
   * Layouts, Kachel-Einstellungen und Titel.
   * @param {{ i18n: any, findInstances: (id: string) => Array<{ instanceId: string, customName?: string }> }} ctx
   * @returns {Array<{ tileId: string, instanceId: string, title: string }>}
   */
  enumerate(ctx) {
    return ctx.findInstances('raci-matrix').map((inst) => ({
      tileId: `raci:${inst.instanceId}`,
      instanceId: inst.instanceId,
      title: `RACI — ${inst.customName || ctx.i18n.t('modules.raci-matrix.name')}`,
    }));
  },

  /** @type {import('./settings.types.js').RaciMatrixTileViewFn} */
  view(ctx) {
    /** @param {string} key @returns {string} */
    const g = (key) => ctx.i18n.t(`dashboard.${key}`);
    return {
      /** Leertext ohne Aktivitäten und ohne Beteiligte, sonst null. */
      get empty() {
        return this.model.activities.length === 0 && this.model.stakeholders.length === 0 ? g('raciEmpty') : null;
      },
      /** Zahl der Aktivitäten, der Beteiligten und die Abdeckung in Prozent. */
      get summary() {
        if (this.empty) return [];
        const { activities, stakeholders, assignments } = this.model;
        const cells = activities.length * stakeholders.length;
        const filled = Object.keys(assignments).length;
        const coverage = cells > 0 ? filled / cells * 100 : 0;
        return [
          { label: `${g('raciActivities')}: `, value: String(activities.length) },
          { label: `${g('raciStakeholders')}: `, value: String(stakeholders.length) },
          { label: `${g('raciCoverage')}: `, value: `${formatNumber(coverage, ctx.i18n.getLanguage(), { decimals: 0 })}%` },
        ];
      },
      /** Verteilung der Rollen für Balken und Legende. */
      get roles() {
        const counts = Object.fromEntries(ROLES.map((r) => [r, 0]));
        for (const role of Object.values(this.model.assignments)) counts[role] += 1;
        return distribution(ROLES.map((role) => ({ key: role, label: role, count: counts[role], color: ROLE_COLORS[role] })));
      },
      /** Balkensegmente je Rolle. */
      get segments() { return this.roles.segments; },
      /** Legende der Rollen oder null. */
      get legend() { return this.settings.showLegend ? this.roles.legend : null; },
      /** Je Aktivität ohne R bzw. ohne A ein Eintrag, in Zeilenreihenfolge, R vor A. */
      get missing() {
        const list = Array.isArray(this.warnings) ? this.warnings : [];
        const names = new Map(this.model.activities.map((a) => [a.id, a.name]));
        const out = [];
        for (const w of list) {
          for (const [issue, role] of MISSING) {
            if (w.issues.includes(issue)) out.push({ name: names.get(w.activityId) ?? '', role });
          }
        }
        return out;
      },
      /** Überschrift der Warnliste oder null. */
      get warnLabel() { return this.missing.length ? g('raciWarnings') : null; },
      /** Die ersten topN Warnungen als Anzeigezeilen. */
      get warnItems() {
        return this.missing.slice(0, this.settings.topN).map((m) => ({
          role: m.role,
          style: `color:${ROLE_COLORS[m.role]}`,
          text: ` ${g('raciMissing')}: ${m.name}`,
        }));
      },
      /** „… +n“ für die übrigen Warnungen oder null. */
      get more() {
        const rest = this.missing.length - this.settings.topN;
        return rest > 0 ? `… +${rest}` : null;
      },
    };
  },
});

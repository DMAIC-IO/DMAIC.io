/**
 * D.Mike — Regelkarte für Variablen: view-Teil Eingabe.
 *
 * Kartentyp (über das Model-Kommando `setChartType`, das die Untergruppe
 * klemmt), Sichtbarkeit der Untergruppengröße, Stufenwarnung,
 * Phase-II-Abzeichen und -Knopf, Regelliste mit Klappzustand. Die Felder
 * selbst binden `x-field`/`x-model` im Template.
 */
import { CHART_TYPES, NELSON_RULES } from '../../../engines/control-chart-engine.js';

/** @typedef {import('../domain/analyze.js').Analysis} Analysis */
/** @typedef {{ id: number }} Rule */

/** @type {import('./state.types.js').ControlChartViewFn} */
export function inputView(ctx) {
  /** Globale Texte (Regeln). */
  const gt = (/** @type {string} */ key, /** @type {object} */ params) => ctx.i18n.t(key, params);
  return {
    /** Optionen der Kartentyp-Auswahl, in der Reihenfolge der Engine. */
    get chartTypes() {
      return CHART_TYPES.map((c) => ({ value: c.id, label: this.t(`type_${c.id}`), selected: c.id === this.model.chartTypeId }));
    },
    /**
     * Wechselt den Kartentyp über das Kommando des Models (klemmt die Untergruppe).
     * @param {Event} event
     */
    chartTypeChanged(event) {
      this.model.setChartType({ chartTypeId: /** @type {any} */ (event.target).value });
    },
    /** Die Untergruppengröße wirkt (X̄-R, X̄-S). */
    get showSubgroup() {
      return /** @type {string[]} */ (this.activeParams).includes('subgroupSize');
    },
    /** Warnung bei Stufengrenzen mitten in einer Untergruppe; sonst leer. */
    get stagesWarning() {
      /** @type {Analysis|null} */
      const a = this.analysis;
      if (a?.status !== 'ok' || a.misaligned.length === 0) return '';
      return this.t('stagesSplitSubgroup', { stages: a.misaligned.join(', '), n: a.n });
    },
    /** Abzeichen Phase I/II; folgt den gespeicherten Grenzen. */
    get phase2Badge() {
      return this.model.frozenLimits
        ? { text: this.t('phase2_frozen'), cls: 'control-chart__phase2-badge--frozen', icon: 'action.lock' }
        : { text: this.t('phase2_live'), cls: '', icon: 'action.unlock' };
    },
    /** Text und Klasse des Phase-II-Knopfs. */
    get phase2Button() {
      return this.model.frozenLimits
        ? { text: this.t('phase2_unfreeze'), cls: 'btn--secondary' }
        : { text: this.t('phase2_freeze'), cls: 'btn--primary' };
    },
    /** Argument des Phase-II-Knopfs: freigeben mit gespeicherten Grenzen, sonst einfrieren. */
    get phase2Target() {
      return this.model.frozenLimits ? 'false' : 'true';
    },
    /** Die Nelson-Regeln der Engine. */
    get nelsonRules() { return NELSON_RULES; },
    /** @param {Rule} rule @returns {string} Kurztext einer Regel */
    ruleShort(rule) { return gt(`common.nelson.${rule.id}.short`); },
    /** @param {Rule} rule @returns {string} Beschreibung einer Regel */
    ruleDesc(rule) { return gt(`common.nelson.${rule.id}.desc`); },
    /** @param {Rule} rule @returns {boolean} die Regel ist angehakt */
    ruleOn(rule) { return /** @type {number[]} */ (this.model.enabledRules).includes(rule.id); },
    /**
     * Kästchen einer Regel; schreibt über das Kommando `toggleRule`.
     * @param {Rule} rule @param {Event} event
     */
    ruleChanged(rule, event) {
      this.model.toggleRule({ ruleId: /** @type {any} */ (rule.id), on: /** @type {HTMLInputElement} */ (event.target).checked });
    },
    /** Klappt die Regelliste; kein Zustand der Rechnung. */
    toggleNelson() { this.state.nelsonCollapsed = !this.state.nelsonCollapsed; },
    get nelsonToggleClass() { return this.state.nelsonCollapsed ? 'control-chart__collapsible--collapsed' : ''; },
    get nelsonPanelClass() { return this.state.nelsonCollapsed ? 'field-checks--collapsed' : ''; },
    get nelsonChevron() { return this.state.nelsonCollapsed ? 'nav.expand-right' : 'nav.expand-down'; },
  };
}

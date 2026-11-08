/**
 * D.Mike — Attributive Regelkarte: Viewmodel.
 *
 * `computed analysis` rechnet aus Model und Arbeitsblatt (`ctx.data`);
 * daraus entstehen die Lesefelder (Zahlen) und über Getter Kennzahlen,
 * Marke, Verletzungsliste und die Regelkarte (Widget `control-chart`).
 */
import { createModule } from '../../../core/template-module.js';
import { getAttributeChartType, ATTRIBUTE_CHART_TYPES, ATTRIBUTE_NELSON_RULES } from '../../../engines/attribute-control-chart-engine.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { analyzeState, resultOf, pointsOf } from '../domain/analyze.js';
import { UiState } from './state.js';
import { kpisOf, badgeOf, violationRowsOf, controlChartOf } from './present.js';

/** Filter eines Spaltenfeldes aus dem Schema (eine Quelle für Picker und Lesefläche). */
const filterOf = (spec) => ({ types: [...spec.types], minCount: spec.minCount });

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  readBulk: ['points'],
  /** @type {import('./state.types.js').AttributeControlChartViewFn} */
  view(ctx) {
    /** Globale Texte (Regeln, Punkt- und Regelbeschriftung). */
    const gt = (key, params) => ctx.i18n.t(key, params);
    return {
      computed: {
        /** Grenzen und Verletzungen; null ohne die nötigen Spalten oder mit weniger als 2 Punkten. */
        analysis() { return analyzeState(this.model, (ref) => ctx.data.values(ref) ?? []); },
        /** Das Ergebnis als Zahlen (Lesefläche). */
        result() { return resultOf(this.analysis, this.model.chartTypeId); },
        /** Je Punkt eine Zeile (Massenfeld der Lesefläche). */
        points() { return pointsOf(this.analysis); },
        /** Die Spaltenfelder des Kartentyps. */
        activeColumnSlots() { return getAttributeChartType(this.model.chartTypeId)?.requiresSampleSize ? ['defectsRef', 'sizeRef'] : ['defectsRef']; },
        /** Die Einstellungen des Kartentyps. */
        activeParams() {
          const np = Boolean(getAttributeChartType(this.model.chartTypeId)?.requiresConstantN);
          return ['chartTypeId', ...(np ? ['constantN'] : []), 'baselineCount', 'enabledRules'];
        },
        /** Je Spaltenfeld die wählbaren Spalten `{ key, name }`. */
        pickableColumns() {
          const f = State.schema.fields;
          return { defectsRef: ctx.data.columns(filterOf(f.defectsRef)), sizeRef: ctx.data.columns(filterOf(f.sizeRef)) };
        },
      },
      /** @noagent Optionen der Kartentyp-Auswahl, eine Quelle mit der Engine. */
      get chartTypes() {
        return ATTRIBUTE_CHART_TYPES.map((c) => ({ value: c.id, label: this.t(`type_${c.id}`), selected: c.id === this.model.chartTypeId }));
      },
      get requiresSampleSize() { return Boolean(getAttributeChartType(this.model.chartTypeId)?.requiresSampleSize); },
      get requiresConstantN() { return Boolean(getAttributeChartType(this.model.chartTypeId)?.requiresConstantN); },
      get typeHint() { return this.t(`typeHint_${this.model.chartTypeId}`); },
      get centerFor() { return this.t(`statCenterFor_${this.model.chartTypeId}`); },
      get kpis() { return kpisOf(this.analysis); },
      get validText() { return this.t('statOf', { total: this.kpis?.valid ?? 0 }); },
      get violationKpiClass() { return this.kpis?.violationCount === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad'; },
      get badge() { return badgeOf(this.analysis, this.t); },
      get chartTitle() { return this.t(`subchart_${this.model.chartTypeId}`, { col: ctx.data.name(this.model.defectsRef) ?? '' }); },
      /** Alter Schlüssel, unter dem die Regelkarte früher gespeichert wurde. */
      legacyEditKeys: { control: 'control-chart' },
      get controlChart() { return controlChartOf(this.analysis, this.model, this.t); },
      get violationRows() { return violationRowsOf(this.analysis, gt); },
      get violationsHeader() { return `⚑ ${this.t('violationsTitle', { count: this.violationRows.length })}`; },
      get showViolations() { return Boolean(this.kpis) && this.violationRows.length > 0; },
      get showNoViolations() { return Boolean(this.kpis) && this.violationRows.length === 0; },
      get nelsonRules() { return ATTRIBUTE_NELSON_RULES; },
      get nelsonToggleClass() { return this.state.nelsonCollapsed ? 'attr-cc__collapsible--collapsed' : ''; },
      get nelsonPanelClass() { return this.state.nelsonCollapsed ? 'field-checks--collapsed' : ''; },
      get nelsonChevron() { return this.state.nelsonCollapsed ? 'nav.expand-right' : 'nav.expand-down'; },
      /** @noagent Kurztext einer Regel. */
      ruleShort(rule) { return gt(`common.nelsonAttr.${rule.id}.short`); },
      /** @noagent Beschreibung einer Regel. */
      ruleDesc(rule) { return gt(`common.nelsonAttr.${rule.id}.desc`); },
      /** @noagent Ist die Regel angehakt? */
      ruleOn(rule) { return this.model.enabledRules.includes(rule.id); },
      /** @noagent Klappt die Regelliste; kein Zustand der Rechnung. */
      toggleNelson() { this.state.nelsonCollapsed = !this.state.nelsonCollapsed; },
      /** @noagent Kästchen einer Regel; der Agent nutzt das Kommando toggleRule. */
      ruleChanged(rule, event) { this.model.toggleRule({ ruleId: rule.id, on: event.target.checked }); },
    };
  },
});

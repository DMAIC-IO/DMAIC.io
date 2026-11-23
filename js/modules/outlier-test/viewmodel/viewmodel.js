/**
 * D.Mike — Ausreißertest: Viewmodel.
 *
 * `computed values`/`analysis` rechnen aus Model und Arbeitsblatt
 * (`ctx.source`) die Verfahren; der Presenter (`present.js`) macht daraus
 * Übersicht, Diagrammwahl, Karten und Tabelle. Der Getter `ivp` ist die
 * Konfiguration des Diagramm-Widgets. Die Ableitung `result` (Model) liefert
 * dem Agenten dieselben Zahlen.
 */
import { createModule } from '../../../core/template-module.js';
import { sourceColumns, columnName } from '../../../core/source-columns.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import {
  ALL_METHODS, VALID_SIDES, inputValues, analyze, chartMethodOptions, effectiveChartMethod,
} from '../domain/analyze.js';
import {
  SIDE_LABEL_KEYS, methodLabel, summaryKpis, chartSegs, methodCards, flaggedTable, chartConfig,
} from './present.js';

/** @typedef {import('../domain/model.types.js').ToggleMethodCommand['method']} MethodId */

export default createModule({
  descriptor,
  Model: State,
  history: true,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    /** Anzeige je Rechnung und Sprache, einmal gebaut. */
    const shown = new WeakMap();
    /**
     * @param {any} vm Viewmodel
     * @returns {{ cards: any[], flagged: ReturnType<typeof flaggedTable> }|null}
     */
    const display = (vm) => {
      if (!vm.hasResult) return null;
      const a = vm.analysis;
      const lang = ctx.i18n.getLanguage();
      const hit = shown.get(a);
      if (hit && hit.lang === lang) return hit.value;
      const value = { cards: methodCards(a, vm.t, lang), flagged: flaggedTable(vm.values, a, vm.t, lang) };
      shown.set(a, { lang, value });
      return value;
    };
    return {
      computed: {
        /** Die Zahlen der gewählten Spalte. */
        values() {
          return inputValues(this.model, sourceColumns(ctx.source));
        },
        /** Rohergebnis der aktiven Verfahren; `null` unter drei Zahlen. */
        analysis() {
          return analyze(this.values, this.model);
        },
      },
      /** Es gibt eine Rechnung (Spalte mit mindestens drei Zahlen). */
      get hasResult() {
        const a = this.analysis;
        return !!a && typeof a === 'object' && !('error' in a);
      },
      /** Anzeigename der gewählten Spalte. */
      get colName() { return columnName(ctx.source, this.model.colRef) ?? ''; },
      /** Das Ziel, das das Diagramm wirklich hervorhebt (gespeichertes oder `'all'`). */
      get chartMethodShown() {
        return effectiveChartMethod(this.model, this.hasResult ? this.analysis : null);
      },
      /** Alle Verfahren in fester Reihenfolge, für die Kästchen. */
      get allMethods() { return ALL_METHODS; },
      /** Optionen der Seitenauswahl. */
      get sideOptions() {
        return VALID_SIDES.map((value) => ({ value, label: this.t(/** @type {Record<string, string>} */ (SIDE_LABEL_KEYS)[value]) }));
      },
      get summaryKpis() { return this.hasResult ? summaryKpis(this.values, this.analysis, this.colName, this.t) : []; },
      get chartSegs() {
        if (!this.hasResult) return [];
        return chartSegs(chartMethodOptions(this.model, this.analysis), this.chartMethodShown, this.t);
      },
      get methodCards() { return display(this)?.cards ?? []; },
      get flaggedShow() { return display(this)?.flagged.show ?? false; },
      get flaggedHeaders() { return display(this)?.flagged.headers ?? []; },
      get flaggedRows() { return display(this)?.flagged.rows ?? []; },
      /** Konfiguration des Diagramms; `null` ohne Rechnung. */
      get ivp() {
        if (!this.hasResult) return null;
        return chartConfig(this.values, this.analysis, this.chartMethodShown, this.colName, this.t);
      },
      /** Schlüssel der Editor-Einstellungen in den alten `chartEdits`. */
      get legacyEditKey() { return 'individual-value-plot'; },
      /** Ob ein Verfahren aktiv ist. @param {string} mid */
      isMethodEnabled(mid) { return this.model.enabled.includes(/** @type {MethodId} */ (mid)); },
      /** Name eines Verfahrens. @param {string} mid */
      methodLabel(mid) { return methodLabel(mid, this.t); },
      /**
       * Kästchen eines Verfahrens umgeschaltet. Lehnt das Model ab (letztes
       * Verfahren abgewählt), springt das Kästchen zurück, und ein Hinweis
       * erscheint.
       * @param {MethodId} mid @param {Event} event
       */
      methodChanged(mid, event) {
        const box = /** @type {HTMLInputElement} */ (event.target);
        try {
          this.model.toggleMethod({ method: mid, on: box.checked });
        } catch (err) {
          console.warn('outlier-test: toggleMethod abgelehnt', err);
          box.checked = this.model.enabled.includes(mid);
          ctx.notify(this.t('invariants.enabledNotEmpty'), 'warning');
        }
      },
    };
  },
});

/**
 * D.Mike — Regelkarte seltener Ereignisse (g-Karte, t-Karte): Viewmodel.
 *
 * `computed analysis` rechnet aus Model und Arbeitsblatt (`ctx.source`) die
 * Karte des gewählten Typs; `analyze` merkt sich die letzte Eingabe, so rufen
 * Ansicht und Ableitungen (`result`, `points`) die Engine zusammen einmal je
 * Änderung. Der Presenter (`present.js`) macht daraus KPI-Leiste, Abzeichen,
 * Kopfzeile und die Konfiguration des Regelkarten-Widgets (`plot`).
 */
import { createModule } from '../../../core/template-module.js';
import { sourceColumns, columnName } from '../../../core/source-columns.js';
import descriptor from '../module.js';
import { State, CHART_TYPE_IDS } from '../domain/model.js';
import { inputValues, inputsOf, analyze, errorOf } from '../domain/analyze.js';
import { kpiOf, badgeOf, chartTitleOf, chartConfig } from './present.js';

/** @typedef {import('../domain/analyze.js').Analysis} Analysis */

export default createModule({
  descriptor,
  Model: State,
  history: true,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    /** KPI-Leiste und Abzeichen je Rechnung und Sprache, einmal gebaut. */
    const shown = new WeakMap();
    /** Zuletzt gemeldeter Fehler des `computed` (nur einmal warnen). */
    let warned = null;
    /**
     * @param {any} vm Viewmodel
     * @returns {{ kpi: ReturnType<typeof kpiOf>, badge: ReturnType<typeof badgeOf> }|null}
     */
    const display = (vm) => {
      if (!vm.hasResult) return null;
      /** @type {Extract<Analysis, { status: 'ok' }>} */
      const a = vm.analysis;
      const lang = ctx.i18n.getLanguage();
      const hit = shown.get(a);
      if (hit && hit.lang === lang) return hit.value;
      const kpi = kpiOf(a, vm.t, lang);
      const value = { kpi, badge: badgeOf(kpi.signals, vm.t) };
      shown.set(a, { lang, value });
      return value;
    };
    return {
      computed: {
        /**
         * Rohergebnis oder Fehlergrund; `null` ohne Ausgabe (kein Bezug,
         * Spalte nicht lesbar, unter zwei verwertbaren Werten). Die
         * Werteliste entsteht hier und geht roh an die Engine: als eigenes
         * `computed` käme sie über den reaktiven Proxy zurück.
         */
        analysis() {
          return analyze(inputsOf(inputValues(this.model, sourceColumns(ctx.source)), this.model));
        },
      },
      /** Es gibt ein Ergebnis. */
      get hasResult() {
        const a = /** @type {any} */ (this.analysis);
        if (a && typeof a === 'object' && 'error' in a && warned !== a) {
          warned = a;
          console.warn('rare-event-chart: Rechnung fehlgeschlagen', a.error);
        }
        return a?.status === 'ok';
      },
      /** Grund, warum nicht gerechnet wurde, als Text; sonst leer. */
      get errorText() {
        const reason = errorOf(/** @type {any} */ (this.analysis));
        return reason ? this.t(reason) : '';
      },
      /** Die Kartentypen für die Auswahl. */
      get chartTypeOptions() {
        return CHART_TYPE_IDS.map((value) => ({ value, label: this.t(`type_${value}`), selected: value === this.model.chartTypeId }));
      },
      /** Hinweis unter der Kartentyp-Auswahl. */
      get typeHint() { return this.t(`typeHint_${this.model.chartTypeId}`); },
      /** Hinweis unter der Spaltenwahl. */
      get dataHint() { return this.t(`dataHint_${this.model.chartTypeId}`); },
      /** Die drei Kacheln der KPI-Leiste; `null` ohne Ergebnis. */
      get kpi() { return display(this)?.kpi ?? null; },
      /** Das Abzeichen der Kopfzeile; `null` ohne Ergebnis. */
      get badge() { return display(this)?.badge ?? null; },
      /** Kopfzeile des Diagrammabschnitts mit dem Spaltennamen. */
      get chartTitle() {
        return chartTitleOf(this.model.chartTypeId, columnName(ctx.source, this.model.columnRef) ?? '?', this.t);
      },
      /** Konfiguration der Regelkarte; `null` ohne Ergebnis. */
      get plot() {
        if (!this.hasResult) return null;
        return chartConfig(this.analysis, this.t);
      },
      /** Schlüssel der Editor-Einstellungen in den alten `chartEdits`. */
      get legacyEditKey() { return 'control-chart'; },
    };
  },
});

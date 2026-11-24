/**
 * D.Mike — Verlaufsdiagramm: Viewmodel.
 *
 * `computed values`/`analysis` rechnen aus Model und Arbeitsblatt
 * (`ctx.source`) Median, Läufe und die vier Lauftests — die Engine läuft dabei
 * je Datenänderung genau einmal (`analyze` merkt sich die letzte Eingabe), ein
 * Wechsel von α rechnet sie nicht neu. Der Presenter (`present.js`) macht
 * daraus KPI-Leiste und Testtafel; der Getter `plot` ist die Konfiguration
 * des Diagramm-Widgets. Die Ableitungen `result` und `points` (Model) liefern
 * dem Agenten dieselben Zahlen.
 */
import { createModule } from '../../../core/template-module.js';
import { sourceColumns, columnName } from '../../../core/source-columns.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { inputValues, analyze } from '../domain/analyze.js';
import { kpiOf, testRowsOf, chartConfig } from './present.js';

/** @typedef {import('../domain/analyze.js').Analysis} Analysis */

export default createModule({
  descriptor,
  Model: State,
  history: true,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    /** Anzeige je Rechnung, α und Sprache, einmal gebaut. */
    const shown = new WeakMap();
    /** Zuletzt gemeldeter Fehler der Rechnung (nur einmal warnen). */
    let warned = null;
    /**
     * @param {any} vm Viewmodel
     * @returns {{ kpi: ReturnType<typeof kpiOf>, rows: ReturnType<typeof testRowsOf> }|null}
     */
    const display = (vm) => {
      if (!vm.hasResult) return null;
      /** @type {Analysis} */
      const a = vm.analysis;
      const alpha = vm.model.alpha;
      const lang = ctx.i18n.getLanguage();
      const hit = shown.get(a);
      if (hit && hit.lang === lang && hit.alpha === alpha) return hit.value;
      const value = { kpi: kpiOf(a, alpha, vm.t, lang), rows: testRowsOf(a, alpha, vm.t, lang) };
      shown.set(a, { lang, alpha, value });
      return value;
    };
    return {
      computed: {
        /** Die Zahlen der gewählten Spalte. */
        values() {
          return inputValues(this.model, sourceColumns(ctx.source));
        },
        /** Rohergebnis ohne Bewertung gegen α; `null` ohne Spalte oder unter drei Zahlen. */
        analysis() {
          return this.model.columnRef ? analyze(this.values) : null;
        },
      },
      /** Es gibt ein Ergebnis; ein Fehler der Rechnung lässt die Ausgabe leer. */
      get hasResult() {
        const a = /** @type {any} */ (this.analysis);
        if (!a || typeof a !== 'object') return false;
        if ('error' in a) {
          if (warned !== a) { warned = a; console.warn('run-chart: Rechnung fehlgeschlagen', a.error); }
          return false;
        }
        return true;
      },
      /** Die drei Kacheln der KPI-Leiste; `null` ohne Ergebnis. */
      get kpi() { return display(this)?.kpi ?? null; },
      /** Die Zeilen der Testtafel; leer ohne Ergebnis. */
      get testRows() { return display(this)?.rows ?? []; },
      /** Kopfzeile des Diagrammabschnitts mit dem Spaltennamen. */
      get chartTitle() {
        return this.t('chartTitle', { col: columnName(ctx.source, this.model.columnRef) ?? '?' });
      },
      /** Konfiguration des Verlaufsdiagramms; `null` ohne Ergebnis. */
      get plot() {
        if (!this.hasResult) return null;
        return chartConfig(this.analysis, columnName(ctx.source, this.model.columnRef) ?? '?', this.t);
      },
      /** Schlüssel der Editor-Einstellungen in den alten `chartEdits`. */
      get legacyEditKey() { return 'run-chart'; },
    };
  },
});

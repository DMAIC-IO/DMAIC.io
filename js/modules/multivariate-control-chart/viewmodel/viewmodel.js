/**
 * D.Mike — Multivariate Regelkarte (Hotelling T²): Viewmodel.
 *
 * `computed analysis` rechnet aus Model und Arbeitsblatt
 * (`ctx.source`) die T²-Karte; `analyze` merkt sich die letzte Eingabe, so
 * rufen Ansicht und Ableitungen (`result`, `points`, `error`, `message`) die
 * Engine zusammen einmal je Änderung. Der Presenter (`present.js`) macht
 * daraus KPI-Leiste, Abzeichen und die Konfiguration des
 * Regelkarten-Widgets (`plot`).
 */
import { createModule } from '../../../core/template-module.js';
import { sourceColumns, columnName } from '../../../core/source-columns.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { inputRows, optionsOf, analyze } from '../domain/analyze.js';
import { messageOf } from '../domain/format.js';
import { kpiOf, badgeOf, chartTitleOf, chartConfig } from './present.js';

/** @typedef {import('../domain/analyze.js').Analysis} Analysis */

export default createModule({
  descriptor,
  Model: State,
  history: true,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    /** Anzeige je Rechnung, α und Sprache, einmal gebaut. */
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
      const alpha = vm.model.alpha;
      const lang = ctx.i18n.getLanguage();
      const hit = shown.get(a);
      if (hit && hit.lang === lang && hit.alpha === alpha) return hit.value;
      const value = { kpi: kpiOf(a.fit, a.n, alpha, vm.t, lang), badge: badgeOf(a.fit, vm.t) };
      shown.set(a, { lang, alpha, value });
      return value;
    };
    return {
      computed: {
        /**
         * Rohergebnis oder Fehlergrund; `null` ohne Ausgabe (unter zwei
         * Bezügen, Spalte nicht lesbar). Die Datenmatrix entsteht hier und
         * geht roh an die Engine: als eigenes `computed` käme sie über den
         * reaktiven Proxy zurück, und die Engine läse jede Zelle durch ihn.
         */
        analysis() {
          return analyze(inputRows(this.model, sourceColumns(ctx.source)), optionsOf(this.model));
        },
      },
      /** Es gibt ein Ergebnis. */
      get hasResult() {
        const a = /** @type {any} */ (this.analysis);
        if (a && typeof a === 'object' && 'error' in a && warned !== a) {
          warned = a;
          console.warn('multivariate-control-chart: Rechnung fehlgeschlagen', a.error);
        }
        return a?.status === 'ok';
      },
      /** Grund, warum nichts gerechnet wurde, als Text; sonst leer. */
      get errorText() { return messageOf(this.analysis, this.t) ?? ''; },
      /** Die drei Kacheln der KPI-Leiste; `null` ohne Ergebnis. */
      get kpi() { return display(this)?.kpi ?? null; },
      /** Das Abzeichen der Kopfzeile; `null` ohne Ergebnis. */
      get badge() { return display(this)?.badge ?? null; },
      /** Kopfzeile des Diagrammabschnitts mit den Spaltennamen. */
      get chartTitle() {
        return chartTitleOf(this.model.columnRefs.map((ref) => columnName(ctx.source, ref) ?? '?'), this.t);
      },
      /** Konfiguration der T²-Karte; `null` ohne Ergebnis. */
      get plot() {
        if (!this.hasResult) return null;
        return chartConfig(this.analysis.fit, this.t);
      },
      /** Schlüssel der Editor-Einstellungen in den alten `chartEdits`. */
      get legacyEditKey() { return 'control-chart'; },
    };
  },
});

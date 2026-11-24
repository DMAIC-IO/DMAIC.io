/**
 * D.Mike — Kurzserien-Regelkarte (Z-MR): Viewmodel.
 *
 * `computed analysis` paart Messwert- und Teilespalte aus dem Arbeitsblatt
 * (`ctx.source`) und rechnet die Z-MR-Karte; `analyze` merkt sich die letzte
 * Eingabe, so rufen Ansicht und Ableitungen (`result`, `points`,
 * `warningMsg`) die Engine zusammen einmal je Änderung. Der Presenter
 * (`present.js`) macht daraus KPI-Leiste, Teiletabelle und die Konfiguration
 * des Regelkarten-Widgets je Teilkarte (`chartViews`).
 */
import { createModule } from '../../../core/template-module.js';
import { sourceColumns, columnName } from '../../../core/source-columns.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { inputPairs, inputsOf, analyze, errorOf, skippedOf } from '../domain/analyze.js';
import { kpiOf, groupRowsOf, chartViewsOf } from './present.js';

/** @typedef {import('../domain/analyze.js').Analysis} Analysis */

export default createModule({
  descriptor,
  Model: State,
  history: true,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    /** KPI-Leiste und Teiletabelle je Rechnung und Sprache, einmal gebaut. */
    const shown = new WeakMap();
    /** Teilkarten je Rechnung, Spaltenname und Sprache, einmal gebaut. */
    const views = new WeakMap();
    /** Zuletzt gemeldeter Fehler des `computed` (nur einmal warnen). */
    let warned = null;
    /**
     * @param {any} vm Viewmodel
     * @returns {{ kpi: ReturnType<typeof kpiOf>, groupRows: ReturnType<typeof groupRowsOf> }|null}
     */
    const display = (vm) => {
      if (!vm.hasResult) return null;
      /** @type {Extract<Analysis, { status: 'ok' }>} */
      const a = vm.analysis;
      const lang = ctx.i18n.getLanguage();
      const hit = shown.get(a);
      if (hit && hit.lang === lang) return hit.value;
      const value = { kpi: kpiOf(a, vm.t, lang), groupRows: groupRowsOf(a, lang) };
      shown.set(a, { lang, value });
      return value;
    };
    return {
      computed: {
        /**
         * Rohergebnis oder Fehlergrund; `null` ohne Ausgabe (ein Bezug fehlt,
         * Spalte nicht lesbar, unter vier verwertbaren Paaren). Die Paare
         * entstehen hier und gehen roh an die Engine: als eigenes `computed`
         * kämen sie über den reaktiven Proxy zurück.
         */
        analysis() {
          return analyze(inputsOf(inputPairs(this.model, sourceColumns(ctx.source))));
        },
      },
      /** Es gibt ein Ergebnis. */
      get hasResult() {
        const a = /** @type {any} */ (this.analysis);
        if (a && typeof a === 'object' && 'error' in a && warned !== a) {
          warned = a;
          console.warn('short-run-chart: Rechnung fehlgeschlagen', a.error);
        }
        return a?.status === 'ok';
      },
      /** Grund, warum nicht gerechnet wurde, als Text; sonst leer. */
      get errorText() {
        const reason = errorOf(/** @type {any} */ (this.analysis));
        return reason ? this.t(reason) : '';
      },
      /** Hinweis auf Werte aus Teilen ohne Streuung (als z = 0 gezählt); sonst leer. */
      get warningText() {
        const count = skippedOf(/** @type {any} */ (this.analysis));
        return count > 0 ? this.t('warningSkipped', { count }) : '';
      },
      /** Die drei Kacheln der KPI-Leiste; `null` ohne Ergebnis. */
      get kpi() { return display(this)?.kpi ?? null; },
      /** Die Zeilen der Teiletabelle; leer ohne Ergebnis. */
      get groupRows() { return display(this)?.groupRows ?? []; },
      /**
       * Je Teilkarte Kopfzeile, Abzeichen, Konfiguration und Altschlüssel, als
       * Objekt in Zeichenreihenfolge `{ z, mr }`; leer ohne Ergebnis.
       */
      get chartViews() {
        if (!this.hasResult) return {};
        /** @type {Extract<Analysis, { status: 'ok' }>} */
        const a = this.analysis;
        const col = columnName(ctx.source, this.model.valuesRef) ?? '?';
        const lang = ctx.i18n.getLanguage();
        const hit = views.get(a);
        if (hit && hit.lang === lang && hit.col === col) return hit.value;
        const value = chartViewsOf(a, col, this.t);
        views.set(a, { lang, col, value });
        return value;
      },
    };
  },
});

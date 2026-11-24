/**
 * D.Mike — Zeitgewichtete Regelkarten (EWMA, CUSUM): Viewmodel.
 *
 * `computed analysis` rechnet aus Model und Arbeitsblatt (`ctx.source`) die
 * Karte des gewählten Typs; `analyze` merkt sich die letzte Eingabe, so rufen
 * Ansicht und Ableitungen (`result`, `points`) die Engine zusammen einmal je
 * Änderung. Der Presenter (`present.js`) macht daraus KPI-Leiste, Kopfzeilen
 * und die Konfiguration des Regelkarten-Widgets je Teilkarte (`chartViews`).
 */
import { createModule } from '../../../core/template-module.js';
import { sourceColumns, columnName } from '../../../core/source-columns.js';
import descriptor from '../module.js';
import { State, CHART_TYPE_IDS, SIGMA_METHODS } from '../domain/model.js';
import { inputValues, inputsOf, analyze, errorOf } from '../domain/analyze.js';
import { kpiOf, chartViewsOf } from './present.js';

/** @typedef {import('../domain/analyze.js').Analysis} Analysis */

export default createModule({
  descriptor,
  Model: State,
  history: true,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    /** KPI-Leiste je Rechnung, λ und Sprache, einmal gebaut. */
    const kpis = new WeakMap();
    /** Teilkarten je Rechnung, Spaltenname und Sprache, einmal gebaut. */
    const views = new WeakMap();
    /** Zuletzt gemeldeter Fehler des `computed` (nur einmal warnen). */
    let warned = null;
    return {
      computed: {
        /**
         * Rohergebnis oder Fehlergrund; `null` ohne Ausgabe (kein Bezug,
         * Spalte nicht lesbar, unter drei Zahlen, σ nicht größer 0). Die
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
          console.warn('time-weighted-chart: Rechnung fehlgeschlagen', a.error);
        }
        return a?.status === 'ok';
      },
      /** Grund, warum nicht gerechnet wurde, als Text; sonst leer. */
      get errorText() {
        const reason = errorOf(/** @type {any} */ (this.analysis));
        return reason ? this.t(reason) : '';
      },
      /**
       * Gilt das Feld im gewählten Kartentyp?
       * @param {string} path z. B. `params.ewma.lambda` @returns {boolean}
       */
      shows(path) { return this.activeParams.includes(path); },
      /** Die Kartentypen für die Auswahl. */
      get chartTypeOptions() {
        return CHART_TYPE_IDS.map((value) => ({ value, label: this.t(`type_${value}`), selected: value === this.model.chartTypeId }));
      },
      /** Die σ-Schätzmethoden für die Auswahl. */
      get sigmaMethodOptions() {
        return SIGMA_METHODS.map((value) => ({ value, label: this.t(`sigma_${value}`), selected: value === this.model.sigmaMethod }));
      },
      /** Hinweis unter der Kartentyp-Auswahl. */
      get typeHint() { return this.t(`typeHint_${this.model.chartTypeId}`); },
      /** Titel des Abschnitts mit den Parametern des gewählten Typs. */
      get sectionParamsLabel() { return this.t(`sectionParams_${this.model.chartTypeId}`); },
      /** Die drei Kacheln der KPI-Leiste; `null` ohne Ergebnis. */
      get kpi() {
        if (!this.hasResult) return null;
        /** @type {Extract<Analysis, { status: 'ok' }>} */
        const a = this.analysis;
        const lambda = this.model.params.ewma.lambda;
        const lang = ctx.i18n.getLanguage();
        const hit = kpis.get(a);
        if (hit && hit.lang === lang && hit.lambda === lambda) return hit.value;
        const value = kpiOf(a, lambda, this.t, lang);
        kpis.set(a, { lang, lambda, value });
        return value;
      },
      /**
       * Zeigt die KPI-Leiste den Satz dieses Kartentyps?
       * @param {'ewma'|'cusum'} type @returns {boolean}
       */
      kpiIs(type) { return this.kpi?.type === type; },
      /**
       * Je Teilkarte Kopfzeile, Abzeichen, Konfiguration und Altschlüssel, als
       * Objekt in Zeichenreihenfolge; leer ohne Ergebnis.
       */
      get chartViews() {
        if (!this.hasResult) return {};
        /** @type {Extract<Analysis, { status: 'ok' }>} */
        const a = this.analysis;
        const col = columnName(ctx.source, this.model.columnRef) ?? '?';
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

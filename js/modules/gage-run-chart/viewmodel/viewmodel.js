/**
 * D.Mike — Messverlaufsdiagramm: Viewmodel.
 *
 * `computed columns`/`analysis` lesen die Teile-, Prüfer- und Messwertspalte
 * über `ctx.source` und gruppieren die Messwerte je Teil und Prüfer — die
 * Engine läuft dabei je Datenänderung genau einmal (`analyze` merkt sich die
 * letzte Eingabe); Bezugswert, Teile je Streifen, Schalter und Kopfzeile
 * rechnen sie nicht neu. `computed runStrips` ist je Streifen die
 * Konfiguration des Widgets `gage-run-chart`; Tippen in der Kopfzeile baut
 * die Streifen nicht neu. Der Presenter (`present.js`) liefert KPI-Leiste und
 * Hinweise. Die Ableitungen `result` und `points` (Model) liefern dem Agenten
 * dieselben Zahlen.
 */
import { createModule } from '../../../core/template-module.js';
import { sourceColumns, columnName } from '../../../core/source-columns.js';
import descriptor from '../module.js';
import { State, GAGE_INFO_KEYS } from '../domain/model.js';
import { inputColumns, analyze, noDataOf } from '../domain/analyze.js';
import { kpiOf, warningTextsOf, runStripsOf } from './present.js';

/** @typedef {import('../domain/analyze.js').Analysis} Analysis */
/** @typedef {typeof GAGE_INFO_KEYS[number]} GageInfoKey */

export default createModule({
  descriptor,
  Model: State,
  history: true,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    /** Zuletzt gemeldeter Fehler der Rechnung (nur einmal warnen). */
    let warned = null;
    return {
      computed: {
        /** Die Rohwerte der drei Spalten; `null` ohne Teile- oder Messwertspalte oder bei einer gelöschten Spalte. */
        columns() {
          return inputColumns(this.model, sourceColumns(ctx.source));
        },
        /** Gruppierung je Teil und Prüfer; `null` ohne Eingabe. */
        analysis() {
          return analyze(this.columns);
        },
        /** Je Streifen Schlüssel, Altschlüssel der Editor-Einstellungen und Widget-Konfiguration; leer ohne Ergebnis. */
        runStrips() {
          if (!this.hasResult) return [];
          const names = {
            part: columnName(ctx.source, this.model.part) ?? '?',
            measurement: columnName(ctx.source, this.model.measurement) ?? '?',
          };
          return runStripsOf(this.analysis, this.model, names, this.t);
        },
      },
      /** Es gibt ein Ergebnis mit Messwerten; ein Fehler der Rechnung lässt die Ausgabe leer. */
      get hasResult() {
        const a = /** @type {any} */ (this.analysis);
        if (!a || typeof a !== 'object') return false;
        if ('error' in a) {
          if (warned !== a) { warned = a; console.warn('gage-run-chart: Rechnung fehlgeschlagen', a.error); }
          return false;
        }
        return a.n > 0;
      },
      /** Text des Fehlerkastens: gerechnet, aber kein verwertbarer Messwert; sonst leer. */
      get errorText() {
        const a = /** @type {any} */ (this.analysis);
        if (!a || 'error' in a) return '';
        return noDataOf(a) ? this.t('errNoData') : '';
      },
      /** Die drei Kacheln der KPI-Leiste; `null` ohne Ergebnis. */
      get kpi() {
        if (!this.hasResult) return null;
        return kpiOf(this.analysis, this.model, this.runStrips.length, this.t, ctx.i18n.getLanguage());
      },
      /** Die Hinweise als Text; leer ohne Ergebnis. */
      get warningTexts() {
        return this.hasResult ? warningTextsOf(this.analysis, this.t) : [];
      },
      /** Es gibt Hinweise. */
      get hasWarnings() { return this.warningTexts.length > 0; },
      /** Mindestens eine Zeile der Kopfzeile ist gefüllt. */
      get hasGageInfo() {
        return GAGE_INFO_KEYS.some((k) => String(this.model.gageInfo[k] || '').trim() !== '');
      },
      /**
       * Bezeichnung einer Zeile der Kopfzeile.
       * @param {GageInfoKey} key @returns {string}
       */
      gageInfoLabel(key) { return this.t(`gageInfo_${key}`); },
      /**
       * Wert einer Zeile der Kopfzeile; leer blendet die Zeile aus.
       * @param {GageInfoKey} key @returns {string}
       */
      gageInfoValue(key) { return this.model.gageInfo[key] || ''; },
      /** Kopfzeile des Diagrammabschnitts mit dem Namen der Messwertspalte. */
      get chartTitle() {
        return this.t('chartTitle', { col: columnName(ctx.source, this.model.measurement) ?? '?' });
      },
    };
  },
});

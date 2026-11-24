/**
 * D.Mike — Transformierte I-MR-Karte: Viewmodel.
 *
 * Der auto-Task `analysis` rechnet aus Model und Arbeitsblatt (`ctx.source`)
 * die Box-Cox-transformierte Einzelwertkarte, entprellt und abbrechbar; die
 * Schätzung von λ ist zu teuer für eine Ableitung. `analyze` merkt sich die
 * letzte Eingabe, ein Neustart ohne geänderte Eingabe rechnet nicht neu. Der
 * Presenter (`present.js`) macht aus dem Task-Wert KPI-Leiste, Abzeichen,
 * Grenzentabelle und die Konfiguration des Regelkarten-Widgets (`plot`).
 */
import { createModule } from '../../../core/template-module.js';
import { asyncTask } from '../../../core/async-task.js';
import { sourceColumns, columnName } from '../../../core/source-columns.js';
import { formatNumber } from '../../../core/number-format.js';
import descriptor from '../module.js';
import { State, LAMBDA_MODES } from '../domain/model.js';
import { inputValues, lambdaOf, shownLambda } from '../domain/analyze.js';
import { analysisRun, kpiOf, badgeOf, limitRowsOf, chartTitleOf, chartConfig } from './present.js';

/** @typedef {import('../domain/analyze.js').Result} Result */
/** @typedef {import('../domain/analyze.js').AnalysisValue} AnalysisValue */

/** Die i18n-Schlüssel der λ-Arten in der Auswahl. */
const LAMBDA_MODE_LABELS = { auto: 'lambdaAuto', manual: 'lambdaManual' };

export default createModule({
  descriptor,
  Model: State,
  history: true,
  asyncTasks: {
    analysis: asyncTask({ auto: true, run: analysisRun() }),
  },
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    /** Anzeige je Ergebnis und Sprache, einmal gebaut. */
    const shown = new WeakMap();
    /**
     * @param {any} vm Viewmodel
     * @returns {{ kpi: ReturnType<typeof kpiOf>, badge: ReturnType<typeof badgeOf>, rows: ReturnType<typeof limitRowsOf> }|null}
     */
    const display = (vm) => {
      /** @type {Result|null} */
      const r = vm.result;
      if (!r) return null;
      const lang = ctx.i18n.getLanguage();
      const hit = shown.get(r);
      if (hit && hit.lang === lang) return hit.value;
      const value = { kpi: kpiOf(r, vm.t, lang), badge: badgeOf(r, vm.t), rows: limitRowsOf(r, vm.t, lang) };
      shown.set(r, { lang, value });
      return value;
    };
    return {
      /**
       * Stand des Laufs: die Zahlen der gewählten Spalte und das λ, das an die
       * Engine geht (im Modus `auto` keines).
       * @returns {{ values: number[], lambda: number|undefined }}
       */
      inputs() {
        return { values: inputValues(this.model, sourceColumns(ctx.source)), lambda: lambdaOf(this.model) };
      },

      /** Das Ergebnis des letzten Laufs, oder null. */
      get result() {
        /** @type {AnalysisValue|null} */
        const v = this.analysis;
        return v?.result ?? null;
      },
      /** Es gibt ein Ergebnis. */
      get hasResult() { return this.result != null; },
      /** Grund, warum nichts gerechnet wurde; sonst leer. */
      get errorText() {
        if (this._asyncTasks.analysis.error) return this.t('errCompute');
        return this.analysis?.message ?? '';
      },
      /** Die drei Kacheln der KPI-Leiste; `null` ohne Ergebnis. */
      get kpi() { return display(this)?.kpi ?? null; },
      /** Das Abzeichen der Kopfzeile; `null` ohne Ergebnis. */
      get badge() { return display(this)?.badge ?? null; },
      /** Die Zeilen der Grenzentabelle; leer ohne Ergebnis. */
      get limitRows() { return display(this)?.rows ?? []; },
      /** Kopfzeile des Diagrammabschnitts mit Spaltenname und λ. */
      get chartTitle() {
        if (!this.result) return '';
        return chartTitleOf(this.result, columnName(ctx.source, this.model.columnRef) ?? '?', this.t, ctx.i18n.getLanguage());
      },
      /** Konfiguration der Regelkarte; `null` ohne Ergebnis. */
      get plot() {
        if (!this.result) return null;
        return chartConfig(this.result, this.analysis.points, this.t);
      },
      /** Schlüssel der Editor-Einstellungen in den alten `chartEdits`. */
      get legacyEditKey() { return 'control-chart'; },

      /** λ wird von Hand vorgegeben. */
      get isManualLambda() { return this.model.lambdaMode === 'manual'; },
      /** λ wird aus den Daten geschätzt. */
      get isAutoLambda() { return this.model.lambdaMode !== 'manual'; },
      /** Die Optionen der λ-Auswahl. */
      get lambdaModeOptions() {
        return LAMBDA_MODES.map((value) => ({
          value, label: this.t(LAMBDA_MODE_LABELS[value]), selected: value === this.model.lambdaMode,
        }));
      },
      /** Das λ im gesperrten Feld: im Modus `auto` das geschätzte, sonst das gespeicherte. */
      get lambdaShownText() { return formatNumber(shownLambda(this.model, this.result), ctx.i18n.getLanguage()); },
      /** Das geschätzte λ des letzten Ergebnisses, sonst null. */
      get autoLambda() { return this.result?.lambdaAuto ? this.result.lambda : null; },

      /**
       * Wechsel in der λ-Auswahl: das Model-Kommando übernimmt beim Wechsel auf
       * `manual` das geschätzte λ.
       * @param {Event} e
       */
      lambdaModeChanged(e) {
        const mode = /** @type {HTMLSelectElement} */ (e.target).value;
        this.model.setLambdaMode({ mode: /** @type {'auto'|'manual'} */ (mode), lambda: this.autoLambda });
      },
    };
  },
});

/**
 * D.Mike — Konturdiagramm: Viewmodel.
 *
 * Die Ableitung `surface` des Models tastet die Fläche ab; `computed
 * surfaceGrid` ist diese eine Abtastung für Diagramm, Infokarten, Legende und
 * Export. `computed chart` ist die Konfiguration des Diagramm-Widgets
 * `contour-chart`, die Messpunkte kommen aus der Ableitung `dataPoints`.
 */
import { createModule } from '../../../core/template-module.js';
import { setFields } from '../../../core/model.js';
import { formatNumber, parseNumber } from '../../../core/number-format.js';
import { markRejection, clearRejection } from '../../../core/param-input.js';
import descriptor from '../module.js';
import { State, MODEL_TYPES } from '../domain/model.js';
import {
  betaLabel, formulaErrorText, levelCount, surfaceInfo, legendView, chartConfig, surfaceTable,
} from './present.js';

/** Textschlüssel je Modellform. */
const MODEL_TYPE_LABEL = { quadratic: 'modelQuadratic', interaction: 'modelInteraction', custom: 'modelCustom' };

export default createModule({
  descriptor,
  Model: State,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    return {
      computed: {
        /** Die abgetastete Fläche, oder null bei einem Fehler der eigenen Formel. */
        surfaceGrid() {
          return this.surface ?? null;
        },
        /** Konfiguration des Diagramms; null ohne Fläche. */
        chart() {
          return chartConfig(this.surfaceGrid, this.model, this.dataPoints ?? [], this.t);
        },
      },
      /** Die Fläche aus einer eigenen Formel. */
      get isCustomModel() { return this.model.modelType === 'custom'; },
      /** Es gibt eine Fläche zum Zeichnen. */
      get hasSurface() { return this.surfaceGrid !== null; },
      /** Die Optionen der Modellform. */
      get modelTypeOptions() {
        return MODEL_TYPES.map((value) => ({ value, label: this.t(MODEL_TYPE_LABEL[value]), selected: value === this.model.modelType }));
      },
      /** Der übersetzte Fehler der eigenen Formel; leer ohne Fehler. */
      get formulaErrorText() { return formulaErrorText(this.formulaError, this.t); },
      /** Texte der Infokarten. */
      get info() {
        return surfaceInfo(this.surfaceGrid, levelCount(this.model.chartEdits), this.t, ctx.context.language);
      },
      /** Die Farblegende. */
      get legend() {
        return legendView(this.surfaceGrid, this.model.chartEdits, this.t, ctx.context.language);
      },
      /**
       * Bezeichnung eines Koeffizienten.
       * @param {number} i 0 bis 5
       * @returns {string}
       */
      betaLabel(i) { return betaLabel(i); },
      /**
       * Ein Koeffizient im Eingabefeld, in der App-Sprache ohne Gruppierung.
       * @param {number} i 0 bis 5
       * @returns {string}
       */
      coefficientText(i) {
        return formatNumber(this.model.b[i], ctx.context.language, { profile: 'input' });
      },
      /**
       * Übernimmt einen getippten Koeffizienten. Eine Eingabe, die keine Zahl
       * ist, wird abgewiesen; das Feld zeigt wieder den alten Wert.
       * @param {number} i 0 bis 5
       * @param {Event} event
       */
      coefficientChanged(i, event) {
        const el = /** @type {HTMLInputElement} */ (event.target);
        const v = parseNumber(el.value.trim());
        if (v === null || !Number.isFinite(v)) {
          el.value = this.coefficientText(i);
          markRejection(el, ctx.i18n.t('common.inputRejectedPlain'));
          return;
        }
        clearRejection(el);
        setFields(this.model, { b: this.model.b.map((x, k) => (k === i ? v : x)) });
      },
      /**
       * Hintergrund eines Legendenfelds.
       * @param {{ color: string }} it
       * @returns {string}
       */
      swatchStyle(it) { return `background: ${it.color}`; },
    };
  },

  /** @type {import('../../../core/template-module.js').ExportsDef<import('../domain/model.types.js').StateModel, {}>} */
  exports: {
    fileName: 'contour-plot',
    table() {
      const m = this.model;
      return surfaceTable(this.surfaceGrid, { xMin: m.xMin, xMax: m.xMax, yMin: m.yMin, yMax: m.yMax });
    },
  },
});

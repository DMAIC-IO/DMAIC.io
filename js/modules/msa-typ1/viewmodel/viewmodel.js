/**
 * D.Mike — MSA Typ 1: Viewmodel.
 *
 * Die Ableitung `analysis` (Model) rechnet aus Eingaben und Messwertspalte;
 * Getter machen daraus Statuszeile, Kennzahlen, Statistiktabelle,
 * Formelzeilen und die Konfiguration der beiden Diagramm-Widgets.
 * Kein Viewmodel-Kommando, kein UI-State.
 */
import { createModule } from '../../../core/template-module.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { fromExample } from '../io/example.js';
import {
  fmt, fmtOpt, resultOf, kpiClass, statusLabel, badgeLabel, biasTestText, statCols,
  runChart, histChart, THRESHOLD_PASS, THRESHOLD_WARN,
} from './present.js';

export default createModule({
  descriptor,
  Model: State,
  fromExample,
  history: true,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    const lang = () => ctx.context.language;
    return {
      /** Das Ergebnis, oder null bei fehlenden oder abgelehnten Eingaben. */
      get result() { return resultOf(this.analysis); },
      /** Zweiseitige Toleranz (Cg und Cgk gerechnet). */
      get isTwoSided() { return this.result?.mode === 'two-sided'; },
      /** Urteil der Statuszeile. */
      get statusLabel() { return statusLabel(this.result, this.t); },
      /** Statusklasse des Gesamturteils. */
      get statusClass() { return kpiClass(this.result?.overall); },
      /** Bezeichnung des Merkmals; Strich ohne Namen. */
      get featureName() { return this.model.params.name || '–'; },
      /** Zeile des t-Tests auf Bias. */
      get biasTestText() { return biasTestText(this.result, this.t, lang()); },
      /** Spalten der Statistiktabelle. */
      get statCols() { return statCols(this.result, this.model.params.unit, this.t, lang()); },
      /**
       * Beschriftung einer Option von k₁: Anteil mit Prozent, „0,20 (20 %)“.
       * @param {number} v @returns {string}
       */
      k1Label(v) { return `${fmt(v, 2, lang())} (${Math.round(v * 100)} %)`; },
      /** Schwelle „fähig“ im Zahlformat der Sprache. */
      get thresholdPass() { return fmt(THRESHOLD_PASS, 2, lang()); },
      /** Schwelle „bedingt fähig“ im Zahlformat der Sprache. */
      get thresholdWarn() { return fmt(THRESHOLD_WARN, 2, lang()); },

      /** Statusklasse eines Urteils. @param {string|null} s @returns {string} */
      kpiClass(s) { return kpiClass(s); },
      /** Urteil einer Kennzahl als Text. @param {string|null} s @returns {string} */
      badgeLabel(s) { return badgeLabel(s, this.t); },
      /** Zahl mit vier Stellen. @param {number} v @returns {string} */
      fmt(v) { return fmt(v, 4, lang()); },
      /** Zahl mit `d` Stellen oder Strich. @param {number|null} v @param {number} [d] @returns {string} */
      fmtOpt(v, d = 4) { return fmtOpt(v, d, lang()); },
      /** k₁ · T / 2 der Cgk-Formel, formatiert. @returns {string} */
      halfZone() { const r = this.result; return r ? fmt((r.params.k1 * r.T) / 2, 4, lang()) : ''; },
      /** |Bias| der Cgk-Formel, formatiert. @returns {string} */
      absBias() { const r = this.result; return r ? fmt(Math.abs(r.bias), 4, lang()) : ''; },

      /** Verlaufsdiagramm. */
      get runChart() { return runChart(this.result, this.t); },
      /** Histogramm. */
      get histChart() { return histChart(this.result, this.t); },
      /** Schlüssel des Verlaufsdiagramms in den alten `chartEdits`. */
      get legacyRunKey() { return 'scatter'; },
      /** Schlüssel des Histogramms in den alten `chartEdits`. */
      get legacyHistKey() { return 'histogram'; },
    };
  },
});

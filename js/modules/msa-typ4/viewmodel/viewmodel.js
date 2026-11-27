/**
 * D.Mike — MSA Typ 4: Viewmodel.
 *
 * Die Ableitung `result` (Model) rechnet aus Eingaben und beiden Spalten;
 * Getter machen daraus Kennzahlen je Norm, Deutung, Tabelle je Referenz,
 * Fehlertext und die Konfiguration der vier Diagramm-Widgets. Das
 * Konfidenzband des Linearitätsplots kommt aus dem gemerkten Engine-Lauf
 * (`runEngine`), die Rohpaare liest ein `computed` über `ctx.source`.
 * UI-State: ob die Residuen aufgeklappt sind; der Handler `residualsToggled`
 * betrifft nur die Ansicht (der Agent liest keine Residuen).
 */
import { createModule } from '../../../core/template-module.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { readInputs, runEngine, bandPoints } from '../domain/analyze.js';
import { UiState } from './state.js';
import {
  resultOf, errorText, verdictClass, kpiAiag, kpiVda, maxBiasText, interpretationText, tableRows,
  linearityChart, pctBiasChart, perRefChart, residualChart,
} from './present.js';

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  /** @type {import('./state.types.js').MsaTyp4ViewFn} */
  view(ctx) {
    const lang = () => ctx.context.language;
    return {
      /** @param {string} name @returns {string} DOM-id bzw. Radio-Name je Instanz */
      fieldId(name) { return `msa-typ4-${name}-${ctx.instanceId}`; },

      // ─── Eingaben ──────────────────────────────────────────
      /** σP nur bei der Bezugsstreuung 6 · σP. */
      get showSigma() { return this.activeParams.includes('sigmaP'); },
      /** Bewertung nach VDA 5. */
      get isVda() { return this.model.params.norm === 'VDA5'; },
      /** Bewertung nach AIAG. */
      get isAiag() { return this.model.params.norm !== 'VDA5'; },

      // ─── Ergebnis ──────────────────────────────────────────
      /** Das Ergebnis, oder null bei fehlenden oder abgelehnten Eingaben. */
      get res() { return resultOf(this.result); },
      /** Fehlertext einer abgelehnten Rechnung samt Werten, sonst leer. */
      get invalidText() { return errorText(this.result, this.t, lang()); },
      /** Ampelklasse des Urteils der gewählten Norm. */
      get verdictClass() { return verdictClass(this.res, this.model.params.norm); },
      /** Kacheln nach AIAG. */
      get kpiAiag() { return this.res ? kpiAiag(this.res, this.t, lang()) : null; },
      /** Kacheln nach VDA 5. */
      get kpiVda() { return this.res ? kpiVda(this.res, this.t, lang()) : null; },
      /** Größter %Bias. */
      get maxBiasValue() { return this.res ? maxBiasText(this.res, lang()) : ''; },
      /** Deutungssatz. */
      get interpretationText() { return this.res ? interpretationText(this.res, this.t, lang()) : ''; },
      /** Zeilen der Tabelle je Referenz. */
      get tableRows() { return this.res ? tableRows(this.res, lang()) : []; },

      // ─── Residuen ──────────────────────────────────────────
      /**
       * Der Abschnitt „Residuen“ wurde auf- oder zugeklappt.
       * @param {Event} event
       */
      residualsToggled(event) {
        this.state.residualsOpen = /** @type {HTMLDetailsElement} */ (event.target).open;
      },

      // ─── Diagramme ─────────────────────────────────────────
      /** %Bias je Referenz. */
      get pctBiasConfig() { return pctBiasChart(this.res, this.t); },
      /** Schlüssel des Linearitätsplots in den alten `chartEdits`. */
      get legacyLinearityKey() { return 'linearity'; },
      /** Schlüssel des %Bias-Diagramms in den alten `chartEdits`. */
      get legacyPctBiasKey() { return 'pct-bias'; },
      /** Schlüssel des Diagramms je Referenz in den alten `chartEdits`. */
      get legacyPerRefKey() { return 'per-ref'; },
      /** Schlüssel des Residuen-Diagramms in den alten `chartEdits`. */
      get legacyResidualKey() { return 'residual'; },

      computed: {
        /** Die zeilengleich gepaarten Spalten (Rohpaare der Diagramme). */
        inputs() { return readInputs(this.model, ctx.source); },
        /** Linearitätsplot; das Band aus dem gemerkten Engine-Lauf. */
        linearityConfig() {
          const inputs = this.inputs;
          if (!this.res) return null;
          return linearityChart(inputs, bandPoints(runEngine(this.model.params, inputs), inputs), this.t);
        },
        /** Messwerte je Referenz. */
        perRefConfig() { return perRefChart(this.res, this.inputs, this.t); },
        /** Residuen über ŷ. */
        residualConfig() { return residualChart(this.res, this.inputs, this.t); },
      },
    };
  },
});

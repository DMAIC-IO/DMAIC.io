/**
 * D.Mike — C&E-Matrix: Viewmodel.
 *
 * Inhalt, Kommandos, Invarianten, Zeilensummen und erlaubte Bewertungen liegen
 * im Model (domain/model.js); die Agentenfläche entsteht aus dessen Schema.
 * Namen binden mit `x-model`, Gewicht und Skala mit `x-field`, Löschen über
 * `x-command`, Anlegen über die Leistenaktionen. Hier bleiben die Anzeige
 * (Farbklassen der Summen, Markierung fremder Bewertungen, Pareto-Konfiguration)
 * und das Tippen einer Bewertung: ein Wert, den die Skala nicht zulässt, wird
 * am Feld abgewiesen und das Model bleibt. Exporte: Tabelle (CSV, XLSX), der
 * JSON-Wert in der Form des Altexports und das Bild der Tabelle.
 */
import { createModule } from '../../../core/template-module.js';
import { tableToSVG } from '../../../core/export-utils.js';
import { parseNumber } from '../../../core/number-format.js';
import { markRejection, clearRejection } from '../../../core/param-input.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import {
  SCALE_IDS, WEIGHTS, cellKey, allowedScores, rowSum, colSum, grandTotal, isOnScale, offScaleCount, paretoItems, heat,
} from '../domain/matrix.js';
import { toRows } from '../io/table.js';
import { toLegacyJSON } from '../io/tree.js';
import { toTableDescriptor, HEAT_VARS } from '../io/image.js';

/** @typedef {{ id: string, name: string }} Input */
/** @typedef {{ id: string, name: string, weight: number }} Output */

export default createModule({
  descriptor,
  Model: State,
  history: true,
  config: {
    actions: [
      { icon: 'action.add', title: 'addInput', variant: 'primary', command: 'addInput' },
      { icon: 'action.add', title: 'addOutput', command: 'addOutput' },
    ],
  },
  /** @type {import('../../../core/template-module.js').ExportsDef<import('../domain/model.types.js').StateModel, {}>} */
  exports: {
    fileName: 'ce-matrix',
    table() { return toRows(this.model, this.t); },
    tree() { return toLegacyJSON(this.model); },
    image() { return tableToSVG(toTableDescriptor(this.model, this.t, this.cssVars(HEAT_VARS))); },
  },
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    /**
     * Klasse und Anteil einer Summenzelle im Farbverlauf über alle `values`.
     * @param {number} v @param {number[]} values @returns {{ cls: string, style: string }}
     */
    const heatOf = (v, values) => {
      const h = heat(v, Math.min(...values), Math.max(...values));
      return h ? { cls: `ce-matrix__heat--s${h.segment}`, style: `--ce-heat-t:${h.t}` } : { cls: '', style: '' };
    };
    return {
      /** Die wählbaren Kundenwichtigkeiten. @returns {ReadonlyArray<number>} */
      get weights() { return WEIGHTS; },
      /** Die Skalen in Anzeigereihenfolge. @returns {ReadonlyArray<string>} */
      get scaleIds() { return SCALE_IDS; },
      /** Alter Schlüssel des Diagramms in `chartEdits`. */
      get legacyEditKey() { return 'pareto'; },
      /** @param {string} id @returns {string} Beschriftung einer Skala */
      scaleLabel(id) { return this.t(`scale_${id}`); },

      // ─── Bewertungen ──────────────────────────────────────
      /** Der gespeicherte Wert einer Zelle als Text, ohne Eintrag leer. @param {Input} inp @param {Output} out @returns {string} */
      scoreText(inp, out) {
        const v = this.model.scores[cellKey(inp.id, out.id)];
        return v === undefined ? '' : this.num(v);
      },
      /** Markierung einer gespeicherten Bewertung außerhalb der Skala. @param {Input} inp @param {Output} out @returns {string} */
      scoreClass(inp, out) { return isOnScale(this.model, inp.id, out.id) ? '' : 'ce-matrix__score-input--invalid'; },
      /** Hinweis mit den erlaubten Werten an einer markierten Zelle. @param {Input} inp @param {Output} out @returns {string} */
      scoreTitle(inp, out) {
        return isOnScale(this.model, inp.id, out.id) ? '' : this.t('scoreAllowed', { allowed: allowedScores(this.model.scale).join(', ') });
      },
      /**
       * Getippte Bewertung: leer löscht, ein Wert der Skala wird gespeichert,
       * alles andere am Feld abgewiesen (das Model bleibt) und gemeldet.
       * @param {Event} event
       */
      scoreInput(event) {
        const el = /** @type {HTMLInputElement} */ (event.target);
        const inputId = el.dataset.inputId ?? '';
        const outputId = el.dataset.outputId ?? '';
        const raw = el.value.trim();
        const value = raw === '' ? null : parseNumber(raw);
        const allowed = allowedScores(this.model.scale);
        if ((value === null && raw !== '') || (value !== null && !allowed.includes(value))) {
          const text = this.t('scoreRejected', { value: raw, allowed: allowed.join(', ') });
          markRejection(el, text);
          ctx.notify(text, 'warning');
          return;
        }
        clearRejection(el);
        this.model.setScore({ inputId, outputId, value });
      },

      // ─── Summen ───────────────────────────────────────────
      /** @param {Input} inp @returns {number} */
      rowSumOf(inp) { return rowSum(this.model, inp.id); },
      /** @param {Output} out @returns {number} */
      colSumOf(out) { return colSum(this.model, out.id); },
      /** @returns {number} */
      get total() { return grandTotal(this.model); },
      /** Die Zeilensummen in Zeilenreihenfolge. @returns {number[]} */
      get rowSumList() { return this.model.inputs.map((i) => rowSum(this.model, i.id)); },
      /** Die Spaltensummen in Spaltenreihenfolge. @returns {number[]} */
      get colSumList() { return this.model.outputs.map((o) => colSum(this.model, o.id)); },
      /** @param {Input} inp @returns {string} */
      rowSumClass(inp) { return heatOf(this.rowSumOf(inp), this.rowSumList).cls; },
      /** @param {Input} inp @returns {string} */
      rowSumStyle(inp) { return heatOf(this.rowSumOf(inp), this.rowSumList).style; },
      /** @param {Output} out @returns {string} */
      colSumClass(out) { return heatOf(this.colSumOf(out), this.colSumList).cls; },
      /** @param {Output} out @returns {string} */
      colSumStyle(out) { return heatOf(this.colSumOf(out), this.colSumList).style; },

      computed: {
        /** Pareto der Zeilensummen: Sammelposten, ohne Legende. */
        paretoChart() {
          return {
            items: paretoItems(this.model),
            otherBucket: true,
            showLegend: false,
            title: this.t('paretoTitle'),
            yLabel: this.t('paretoYLabel'),
          };
        },
      },

      /**
       * Ein Skalenwechsel (Oberfläche, Agent, Rückgängig) hebt die
       * Ablehnungen der Felder auf und meldet die Bewertungen, die die neue
       * Skala nicht zulässt.
       */
      init() {
        this.$watch('model.scale', () => {
          this.$root.querySelectorAll('.ce-matrix__score-input.field--error').forEach((el) => clearRejection(/** @type {HTMLElement} */ (el)));
          const off = offScaleCount(this.model);
          if (off > 0) ctx.notify(this.t('offScale', { count: off }), 'warning');
        });
      },
    };
  },
});

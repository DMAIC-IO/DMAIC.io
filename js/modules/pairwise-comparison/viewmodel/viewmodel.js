/**
 * D.Mike — Paarweiser Vergleich: Viewmodel.
 *
 * Inhalt, Kommandos, die Invariante des Reiters und die Auswertung liegen im
 * Model (domain/model.js); die Agentenfläche entsteht aus dessen Schema.
 * Anlegen läuft über ein Formular (`x-command-form`), Start, Entscheidungen,
 * Löschen und Matrixzellen über `x-command`, Reiter und „Zurück“ über
 * `x-set` auf dem Ansichtsfeld. Hier bleiben die Anzeige (Reiterklassen,
 * Fortschritt, Rangliste, Zahlen in der App-Sprache), die Tastenkürzel im
 * Vergleich und der Fokus auf das Eingabefeld. Exporte: die Matrix als
 * Tabelle (Excel, CSV) und die Auswertung als JSON.
 */
import { createModule } from '../../../core/template-module.js';
import { formatNumber } from '../../../core/number-format.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import {
  MAX_CRITERIA, MIN_CRITERIA, PHASES, scores, ranked, phaseReachable,
} from '../domain/run.js';
import { toRows, toTree } from '../io/export.js';

/** Medaillen der ersten drei Plätze. */
const MEDALS = ['gold', 'silver', 'bronze'];

/** @typedef {import('../domain/model.types.js').StateModel & Pick<State, 'hasContent'>} PairwiseModel */

export default createModule({
  descriptor,
  Model: State,
  history: true,
  /** @type {import('../../../core/template-module.js').ExportsDef<PairwiseModel, {}>} */
  exports: {
    fileName: 'pairwise-comparison',
    table() { return toRows(this.model, this.t); },
    tree() { return toTree(this.model, new Date().toISOString()); },
  },
  /** @type {import('../../../core/template-module.js').ViewFn<PairwiseModel, {}>} */
  view(ctx) {
    /** @param {number} v @param {object} [opts] @returns {string} Zahl in der App-Sprache */
    const fmt = (v, opts) => formatNumber(v, ctx.i18n.getLanguage(), opts);
    return {
      // ─── Reiter ───────────────────────────────────────────
      /** Die Reiter in Anzeigereihenfolge. */
      get phases() { return PHASES; },
      /** @param {string} phase @returns {string} „01“ … „03“ */
      tabNum(phase) { return String(PHASES.indexOf(phase) + 1).padStart(2, '0'); },
      /** @param {string} phase @returns {string} Klasse: aktiv, erledigt (davor) oder keine */
      tabClass(phase) {
        const active = PHASES.indexOf(this.model.viewPhase);
        const i = PHASES.indexOf(phase);
        if (i === active) return 'dmike-tab--active';
        return i < active ? 'dmike-tab--done' : '';
      },
      /** @param {string} phase @returns {boolean} gesperrt, solange der Lauf den Reiter nicht erreicht */
      isTabLocked(phase) { return !phaseReachable(phase, this.model); },
      /** @param {string} phase @returns {string} i18n-Schlüssel des Reiters */
      tabLabel(phase) { return this.t(`tab${phase[0].toUpperCase()}${phase.slice(1)}`); },
      get contentClass() { return `pairwise__content--${this.model.viewPhase}`; },

      // ─── Eingabe ──────────────────────────────────────────
      get atMax() { return this.model.criteria.length >= MAX_CRITERIA; },
      /** @param {number} i @returns {string} „01“ … */
      chipNum(i) { return String(i + 1).padStart(2, '0'); },
      get addBtnLabel() { return `+ ${this.t('addBtn')}`; },
      get emptyHintText() { return this.t('emptyHint', { n: MIN_CRITERIA }); },
      get maxReachedText() { return this.t('maxReached', { n: MAX_CRITERIA }); },
      get isStartReady() { return this.model.criteria.length >= MIN_CRITERIA; },
      get startLabel() {
        const n = this.model.criteria.length;
        return n < MIN_CRITERIA
          ? this.t('startBtnNeed', { n: MIN_CRITERIA - n })
          : this.t('startBtnReady', { n: (n * (n - 1)) / 2 });
      },

      // ─── Vergleich ────────────────────────────────────────
      /** Das anstehende Paar, ohne laufenden Vergleich null. @returns {number[]|null} */
      get currentPairIdx() { return this.model.pairs[this.model.currentPair] ?? null; },
      get leftName() { const p = this.currentPairIdx; return p ? (this.model.criteria[p[0]] ?? '') : ''; },
      get rightName() { const p = this.currentPairIdx; return p ? (this.model.criteria[p[1]] ?? '') : ''; },
      get tieLabel() { return `= ${this.t('tie')}`; },
      get progressStyle() {
        const total = this.model.pairs.length;
        const pct = total > 0 ? (this.model.currentPair / total) * 100 : 0;
        return `width:${pct}%`;
      },
      get progressText() { return `${this.model.currentPair} / ${this.model.pairs.length}`; },
      /**
       * Tastenkürzel im Vergleich: ← links, → rechts, Leertaste gleichwertig.
       * Nur im Reiter Vergleich, nur wenn diese Instanz sichtbar ist, nicht
       * bei Fokus in einem Eingabefeld oder auf einem Knopf. Eine Ablehnung
       * bleibt still.
       * @param {KeyboardEvent} e
       */
      compareKey(e) {
        if (this.model.viewPhase !== 'compare') return;
        if (this.$root.offsetParent === null) return;
        const tag = document.activeElement?.tagName ?? '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
        /** @type {'chooseLeft'|'chooseRight'|'tieCurrent'|null} */
        let name = null;
        if (e.key === 'ArrowLeft') name = 'chooseLeft';
        else if (e.key === 'ArrowRight') name = 'chooseRight';
        else if (e.key === ' ' || e.key === 'Spacebar') name = 'tieCurrent';
        if (!name) return;
        e.preventDefault();
        try { this.model[name]({}); } catch { /* kein laufender Vergleich: still */ }
      },

      // ─── Ergebnis ─────────────────────────────────────────
      /** Punkte je Kriterium. @returns {number[]} */
      get scoreList() { return scores(this.model.matrix); },
      /** Die Rangliste. @returns {{ name: string, score: number, idx: number }[]} */
      get ranking() { return ranked(this.model.criteria, this.scoreList); },
      /** @param {number} pos @returns {string} */
      medalClass(pos) { return pos < MEDALS.length ? `pairwise__rank-item--${MEDALS[pos]}` : ''; },
      /** @param {number} pos @returns {string} */
      rankDelay(pos) { return `animation-delay:${pos * 0.05}s`; },
      /** @param {number} score @returns {string} */
      rankBarStyle(score) {
        const m = Math.max(0, ...this.scoreList);
        const pct = m > 0 ? (score / m) * 100 : 0;
        return `width:${pct}%`;
      },
      /** @param {number} score @returns {string} Punkte mit einer Nachkommastelle */
      rankScore(score) { return fmt(score, { decimals: 1 }); },
      /** @param {number} i @returns {string} Summe der Zeile mit einer Nachkommastelle */
      scoreFmt(i) { return fmt(this.scoreList[i], { decimals: 1 }); },
      /** @param {number} i @param {number} j @returns {string} */
      matrixCellClass(i, j) {
        if (i === j) return 'pairwise__matrix-cell--diag';
        const v = this.model.matrix[i]?.[j];
        const cls = v === 1 ? 'pairwise__matrix-cell--win'
          : v === 0.5 ? 'pairwise__matrix-cell--tie'
            : 'pairwise__matrix-cell--lose';
        return `pairwise__matrix-cell--editable ${cls}`;
      },
      /** @param {number} i @param {number} j @returns {string} */
      matrixCellText(i, j) { return i === j ? '—' : fmt(this.model.matrix[i]?.[j]); },
      /** @param {number} i @param {number} j @returns {string|null} */
      cellTitle(i, j) { return i === j ? null : this.t('matrixCellHint'); },
      get legendWinText() { return `${fmt(1)} = ${this.t('legendWin')}`; },
      get legendTieText() { return `${fmt(0.5)} = ${this.t('legendTie')}`; },
      get legendLoseText() { return `${fmt(0)} = ${this.t('legendLose')}`; },

      /**
       * Fokus auf das Eingabefeld, wenn die Instanz mit dem Reiter Kriterien
       * eingehängt wird (wie die Altform). Ein späterer Wechsel auf den Reiter
       * fokussiert nicht: nach Rückgängig stünde der Fokus sonst im Textfeld,
       * und Strg+Y ginge an den Browser statt an den Verlauf.
       */
      init() {
        this.$nextTick(() => {
          if (this.model.viewPhase !== 'input') return;
          /** @type {HTMLInputElement|null} */ (this.$root.querySelector('[data-ref="criterionInput"]'))?.focus();
        });
      },
    };
  },
});

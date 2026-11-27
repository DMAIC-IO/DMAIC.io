/**
 * D.Mike — Korrelation: Viewmodel.
 *
 * Eingaben, Prüfungen und Ableitungen liegen im Model (domain/); die
 * Agentenfläche entsteht aus dessen Schema. Spalten, Methode und Filter binden
 * mit `x-field` bzw. `x-set`. Hier bleiben die Anzeige in der App-Sprache
 * (Karten, Kennzahlen, Matrix, Diagrammkonfiguration), der Handler des
 * Konfidenzfelds (Prozenttext → Anteil, das bildet `x-field` nicht ab) und die
 * Handler des Matrix-UI-States (Hover, Auswahl, Klappen: nur Darstellung).
 */
import { createModule } from '../../../core/template-module.js';
import { setFields } from '../../../core/model.js';
import { markRejection, clearRejection } from '../../../core/param-input.js';
import { columnOptions } from '../../../core/source-columns.js';
import descriptor from '../module.js';
import { State, refKey } from '../domain/model.js';
import { analyze, errorMessage, METHODS } from '../domain/analyze.js';
import { parseConfPercent, confInRange } from '../domain/confidence.js';
import { UiState } from './state.js';
import { pairView, matrixView, methodNames, scatterConfig, confPercent } from './present.js';

/** @typedef {import('../domain/analyze.js').Analysis} Analysis */

/**
 * Filter der wählbaren Spalten, gelesen aus dem Schema von `colRefs` (eine
 * Quelle für Wähler, Agent und Leerzustand; das Schema bleibt ein Literal).
 */
const PICKABLE = (() => {
  const c = /** @type {{ types: readonly string[], minCount: number }} */ (State.schema.fields.colRefs.item);
  return { types: [...c.types], minCount: c.minCount };
})();

/**
 * Signatur der Spaltenwahl; der UI-State gilt nur zu ihr.
 * @param {{ colRefs: readonly object[] }} m @returns {string}
 */
const sigOf = (m) => m.colRefs.map((r) => refKey(/** @type {any} */ (r))).join(',');

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  /** @type {import('./state.types.js').CorrelationViewFn} */
  view(ctx) {
    /** Anzeige je Ergebnis, Sprache und Einstellungen, einmal gebaut. */
    const shown = new WeakMap();
    /**
     * Den UI-State auf die aktuelle Spaltenwahl heben; bei anderer Wahl
     * beginnt er leer und bleibt es, auch wenn die Wahl zur alten zurückkehrt.
     * @param {any} vm
     */
    const touch = (vm) => {
      const sig = sigOf(vm.model);
      if (vm.state.stateSig === sig) return;
      Object.assign(vm.state, {
        hoverRow: -1, hoverCol: -1, selectedPair: null,
        collapsedPairs: [], allCollapsed: false, stateSig: sig,
      });
    };
    /**
     * Zeilen- und Spaltenindex der Matrixzelle unter dem Ereignis.
     * @param {Event} event @returns {{ row: number, col: number, el: HTMLElement }|null}
     */
    const cellOf = (event) => {
      const el = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (event.target).closest?.('[data-row][data-col]'));
      if (!el) return null;
      return { row: Number(el.dataset.row), col: Number(el.dataset.col), el };
    };
    return {
      /**
       * Andere Spaltenwahl leert den UI-State, ein Methodenwechsel die gewählte
       * Zelle (Altform: `runMatrix` bzw. `_applyMethod`); Klappen bleibt beim
       * Methodenwechsel.
       */
      init() {
        this.state.stateSig = sigOf(this.model);
        this.$watch(() => sigOf(this.model), () => touch(this));
        this.$watch(() => this.model.matrixMethod, () => { this.state.selectedPair = null; });
      },
      /** Die Rechnung zum Stand. @returns {Analysis} */
      get analysis() { return analyze(this.model, ctx.source); },
      /** Der UI-State gilt für die aktuelle Spaltenwahl. */
      get uiValid() { return this.state.stateSig === sigOf(this.model); },

      // ── Spaltenwahl ─────────────────────────────────────────
      /** Es gibt ein Arbeitsblatt im Projekt. */
      get hasWorksheet() { return ctx.source.list().some((i) => i.moduleId === 'worksheet'); },
      /** Es gibt wählbare Spalten. */
      get hasColumns() { return columnOptions(ctx.source, PICKABLE).length > 0; },
      /** Leerzustand „kein Arbeitsblatt“. */
      get showNoWorksheet() { return !this.hasWorksheet; },
      /** Leerzustand „keine geeigneten Spalten“. */
      get showNoColumns() { return this.hasWorksheet && !this.hasColumns; },
      /** Hinweis zur Zahl gewählter Spalten. */
      get selectedInfoText() {
        const n = this.model.colRefs.length;
        if (n === 0) return this.t('selectMinTwo');
        if (n === 1) return this.t('selectOneMore');
        if (n === 2) return this.t('pairwiseMode');
        return this.t('matrixMode', { n });
      },
      /** Klasse des Hinweises. */
      get selectedInfoClass() { return this.model.colRefs.length < 2 ? 'corr__hint' : 'corr__col-info'; },

      // ── Konfidenz ───────────────────────────────────────────
      /** Das Konfidenzniveau in Prozent, App-Sprache. */
      get confDisplay() { return confPercent(this.model.confidenceLevel, ctx.i18n.getLanguage()); },
      /** Prozentzahl in Beschriftungen (gleiche Stellen wie das Feld). */
      get confPctText() { return this.confDisplay; },
      /** Beschriftung des Intervalls auf den Karten. */
      get ciLabel() { return `${this.t('confidenceInterval')} ${this.confDisplay} %`; },
      /**
       * Prozenttext oder Anteil übernehmen; außerhalb 50–99,99 % abgewiesen,
       * das Feld springt auf den gespeicherten Wert zurück. Gleicher Wert
       * schreibt nicht.
       * @param {Event} event
       */
      commitConf(event) {
        const el = /** @type {HTMLInputElement} */ (event.target);
        const dec = parseConfPercent(el.value);
        if (!confInRange(dec)) {
          markRejection(el, this.t('confRejected'));
          el.value = this.confDisplay;
          return;
        }
        clearRejection(el);
        if (dec !== this.model.confidenceLevel) setFields(this.model, { confidenceLevel: dec });
        el.value = this.confDisplay;
      },
      /**
       * Enter verlässt das Feld (übernimmt über `change`).
       * @param {KeyboardEvent} event
       */
      confKeydown(event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          /** @type {HTMLInputElement} */ (event.target).blur();
        }
      },

      // ── Fehler ──────────────────────────────────────────────
      /** Grund ohne Ergebnis als Text; leer ohne Grund. */
      get errorText() {
        const e = this.analysis.error;
        if (!e) return '';
        return errorMessage(e, this.t);
      },
      /** Es gibt einen Grund ohne Ergebnis. */
      get hasError() { return this.analysis.error !== null; },

      // ── Paarweise ───────────────────────────────────────────
      /** Karten, Tooltip und Kennzahlen; `null` ohne paarweises Ergebnis. */
      get pairShown() {
        const res = this.analysis.result;
        if (!res) return null;
        const lang = ctx.i18n.getLanguage();
        const hit = shown.get(res);
        if (hit && hit.lang === lang) return hit.value;
        const value = pairView(res, this.t, lang);
        shown.set(res, { lang, value });
        return value;
      },
      /** Die drei Karten. */
      get cards() { return this.pairShown?.cards ?? []; },
      /** Zeilen des Tooltips der Empfehlung. */
      get recTooltipLines() { return this.pairShown?.tooltip ?? []; },
      /** Kennzahlgruppen „Deskriptiv“ und „Diagnose“. */
      get statGroups() { return this.pairShown?.statGroups ?? []; },
      /** Konfiguration des Streudiagramms bei zwei Spalten. */
      get pairChart() {
        const a = this.analysis;
        const p = a.pairs[0];
        if (!a.result || !p) return { series: [] };
        return scatterConfig(p.x, p.y, {
          xLabel: a.result._nameX, yLabel: a.result._nameY, showLegend: true,
          dataName: this.t('dataPoints'), lineName: this.t('regressionLine'),
        });
      },

      // ── Matrix ──────────────────────────────────────────────
      /** Knöpfe der Koeffizienten. */
      get methodOptions() {
        const names = methodNames(this.t);
        return METHODS.map((value) => ({ value, label: names[value] }));
      },
      /**
       * Klasse eines Methodenknopfs.
       * @param {string} method @returns {string}
       */
      methodClass(method) { return this.model.matrixMethod === method ? 'btn--active' : ''; },
      /** Matrixanzeige; `null` ohne Matrix. */
      get matrixShown() {
        const a = this.analysis;
        const mr = a.matrixResult;
        if (!mr) return null;
        const m = this.model;
        const lang = ctx.i18n.getLanguage();
        const key = [lang, m.matrixMethod, m.filterMinR, m.filterMaxP].join('|');
        const hit = shown.get(mr);
        if (hit && hit.key === key) return hit.value;
        const value = matrixView(mr, a.pairs, { method: m.matrixMethod, minR: m.filterMinR, maxP: m.filterMaxP, conf: m.confidenceLevel }, this.t, lang);
        shown.set(mr, { key, value });
        return value;
      },
      /** Spaltennamen der Matrix. */
      get matrixNames() { return this.matrixShown?.names ?? []; },
      /** Zeilen der Matrix. */
      get matrixRows() { return this.matrixShown?.rows ?? []; },
      /** Gefilterte Paare nach Schlüssel (Streudiagramme). */
      get filteredPairs() { return this.matrixShown?.pairs ?? {}; },
      /** Es gibt gefilterte Paare. */
      get hasPlots() { return Object.keys(this.filteredPairs).length > 0; },
      /**
       * Name einer Matrixzeile.
       * @param {number} i @returns {string}
       */
      matrixName(i) { return this.matrixNames[i] ?? ''; },
      /**
       * `p = …` einer Zelle.
       * @param {{ pStr: string }} cell @returns {string}
       */
      cellPText(cell) { return `p = ${cell.pStr}`; },
      /**
       * Kopfzeile einer Karte: `r = …`.
       * @param {{ rLabel: string }} pair @returns {string}
       */
      pairRText(pair) { return `r = ${pair.rLabel}`; },
      /**
       * Intervall in der Kopfzeile einer Karte.
       * @param {{ ciLabel: string }} pair @returns {string}
       */
      pairCiText(pair) { return `${this.confDisplay}% ${this.t('ciShort')} ${pair.ciLabel}`; },
      /**
       * p-Wert in der Kopfzeile einer Karte.
       * @param {{ pLabel: string }} pair @returns {string}
       */
      pairPText(pair) { return `| p = ${pair.pLabel}`; },
      /**
       * Farbe des r in der Kopfzeile.
       * @param {{ color: string }} pair @returns {string}
       */
      pairRStyle(pair) { return `color:${pair.color}`; },

      /**
       * Hover-Kreuz setzen.
       * @param {Event} event
       */
      matrixHover(event) {
        const c = cellOf(event);
        if (!c) return;
        touch(this);
        this.state.hoverRow = c.row;
        this.state.hoverCol = c.col;
      },
      /** Hover-Kreuz aufheben. */
      matrixHoverClear() {
        touch(this);
        this.state.hoverRow = -1;
        this.state.hoverCol = -1;
      },
      /**
       * Klasse des Hover-Kreuzes.
       * @param {number} i @param {number} j @returns {string}
       */
      hoverClass(i, j) {
        if (!this.uiValid) return '';
        const { hoverRow: hr, hoverCol: hc } = this.state;
        if (hr === -1 && hc === -1) return '';
        return i === hr || j === hc ? ' corr__matrix--highlight' : '';
      },
      /**
       * Klick auf eine Zelle isoliert ihr Streudiagramm, ein zweiter hebt auf.
       * @param {Event} event
       */
      matrixClick(event) {
        const c = cellOf(event);
        if (!c || c.row === c.col || c.el.classList.contains('corr__matrix-cell--empty')) return;
        if (!this.hasPlots) return;
        touch(this);
        const key = `${Math.min(c.row, c.col)}-${Math.max(c.row, c.col)}`;
        this.state.selectedPair = this.selectedPair === key ? null : key;
      },
      /** Die gewählte Zelle zur aktuellen Spaltenwahl. */
      get selectedPair() { return this.uiValid ? this.state.selectedPair : null; },
      /**
       * Klasse der gewählten Zelle.
       * @param {number} i @param {number} j @returns {string}
       */
      selectClass(i, j) {
        const sel = this.selectedPair;
        if (!sel) return '';
        return sel === `${Math.min(i, j)}-${Math.max(i, j)}` ? ' corr__matrix-cell--selected' : '';
      },
      /**
       * Klassen einer Zelle samt Hover und Auswahl.
       * @param {{ cls: string }} cell @param {number} i @param {number} j @returns {string}
       */
      cellClass(cell, i, j) { return cell.cls + this.hoverClass(i, j) + this.selectClass(i, j); },
      /**
       * Klasse eines Kopfes (Hover).
       * @param {number} i @param {number} j @returns {string}
       */
      headClass(i, j) { return this.hoverClass(i, j); },
      /**
       * Ist das Streudiagramm zugeklappt?
       * @param {string} key @returns {boolean}
       */
      isCollapsed(key) { return this.uiValid && this.state.collapsedPairs.includes(key); },
      /**
       * Klasse einer Karte.
       * @param {{ key: string }} pair @returns {string}
       */
      plotCardClass(pair) { return this.isCollapsed(pair.key) ? 'corr__matrix-plot-card--collapsed' : ''; },
      /**
       * Sichtbarkeit einer Karte bei gewählter Zelle.
       * @param {{ key: string }} pair @returns {string}
       */
      plotCardDisplay(pair) {
        const sel = this.selectedPair;
        return !sel || sel === pair.key ? '' : 'display:none';
      },
      /**
       * Pfeil einer Karte.
       * @param {{ key: string }} pair @returns {string}
       */
      chevronIcon(pair) { return this.isCollapsed(pair.key) ? 'nav.expand-right' : 'nav.expand-down'; },
      /**
       * Eine Karte auf- oder zuklappen.
       * @param {string} key
       */
      togglePlot(key) {
        touch(this);
        const cur = this.state.collapsedPairs;
        this.state.collapsedPairs = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
      },
      /** Alle Karten auf- oder zuklappen. */
      toggleAllPlots() {
        touch(this);
        const next = !this.state.allCollapsed;
        this.state.collapsedPairs = next ? Object.keys(this.filteredPairs) : [];
        this.state.allCollapsed = next;
      },
      /** Beschriftung des Knopfs „Alle …“. */
      get collapseAllLabel() {
        return this.uiValid && this.state.allCollapsed ? this.t('expandAll') : this.t('collapseAll');
      },
    };
  },
});

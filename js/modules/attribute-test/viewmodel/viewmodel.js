/**
 * D.Mike — Attributtest: Viewmodel.
 *
 * Eingaben, Prüfungen, Ableitungen und Kommandos liegen im Model (domain/);
 * die Agentenfläche entsteht aus dessen Schema. Felder binden mit `x-field`
 * bzw. `x-set`, Anhängen, Entfernen und der Äquivalenz-Folgeschritt über
 * `x-command`. Hier bleiben die Sichtbarkeit je Testart, die Anzeige des
 * Berichts in der App-Sprache und die Handler der Tafelzellen (`x-field`
 * bindet keine Einträge in `list(list(…))`) und des Ereigniswerts (Optionen
 * aus den Daten, gezeigt wird der wirksame Wert).
 */
import { createModule } from '../../../core/template-module.js';
import { runUiCommand } from '../../../core/command-directives.js';
import { formatNumber, parseNumber } from '../../../core/number-format.js';
import { setFields } from '../../../core/model.js';
import { markRejection, clearRejection } from '../../../core/param-input.js';
import { readColumn } from '../../../core/source-columns.js';
import descriptor from '../module.js';
import { State, MIN_DIM, showsDirection } from '../domain/model.js';
import { analyze } from '../domain/analyze.js';
import { present, hypotheses } from './present.js';

/** @typedef {import('../domain/analyze.js').Analysis} Analysis */

/** Die Testrichtungen mit ihrem Beschriftungsschlüssel. */
const DIRECTIONS = Object.freeze([['two-sided', 'dirTwoSided'], ['greater', 'dirGreater'], ['less', 'dirLess']]);

/**
 * Eine getippte Anzahl: leer → `null`, sonst eine ganze Zahl ≥ 0; `undefined`
 * für alles andere.
 * @param {string} raw @returns {number|null|undefined}
 */
function countOf(raw) {
  const s = raw.trim();
  if (s === '') return null;
  const v = parseNumber(s);
  return v !== null && Number.isInteger(v) && v >= 0 ? v : undefined;
}

export default createModule({
  descriptor,
  Model: State,
  history: true,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    /** Anzeige je Rechnung und Sprache, einmal gebaut. */
    const shown = new WeakMap();
    /**
     * Der Name einer gewählten Spalte; leer ohne Bezug.
     * @param {any} ref @returns {string}
     */
    const columnName = (ref) => (ref ? String(readColumn(ctx.source, ref)?.name ?? '').trim() : '');
    /**
     * Eine getippte Zelle über ihr Kommando schreiben; eine unlesbare,
     * negative oder gebrochene Zahl wird am Feld abgewiesen. Ein Wert gleich
     * dem gespeicherten („1,“ nach „1“) schreibt nicht: sonst setzte das
     * Neuzeichnen der Tafel den getippten Text auf „1“ zurück.
     * @param {any} vm @param {string} name @param {Event} event @returns {Promise<void>}
     */
    const writeCell = async (vm, name, event) => {
      const el = /** @type {HTMLInputElement} */ (event.target);
      const value = countOf(el.value);
      if (value === undefined) {
        markRejection(el, vm.t('errCountInvalid'));
        return;
      }
      const row = Number(el.dataset.row);
      const col = Number(el.dataset.col);
      const counts = name === 'setPairCell' ? vm.model.summary.pairs.counts : vm.model.summary.table.counts;
      if ((counts[row]?.[col] ?? null) === value) {
        clearRejection(el);
        return;
      }
      const r = await runUiCommand(vm._ui, name, { row, col, value });
      if (r.ok) clearRejection(el);
      else if ('error' in r) markRejection(el, vm.t('errCountInvalid'));
    };
    return {
      /** Die Rechnung zum Stand. @returns {Analysis} */
      get analysis() { return analyze(this.model, ctx.source); },
      /** Es gibt einen Bericht. */
      get hasResult() { return this.analysis.status === 'ok'; },
      /** Der Grund ohne Bericht ist ein Eingabehinweis. */
      get isHint() { const a = this.analysis; return a.status !== 'ok' && a.hint; },
      /** Der Grund ohne Bericht als Text; leer mit Bericht. */
      get message() { const a = this.analysis; return a.status === 'ok' ? '' : this.t(a.reason); },
      /** Klasse der Meldung ohne Bericht. */
      get messageClass() { return this.isHint ? 'attrtest__message--hint' : 'attrtest__message--error'; },
      /** Der Bericht für die Anzeige; `null` ohne Bericht. */
      get shown() {
        const a = this.analysis;
        if (a.status !== 'ok') return null;
        const lang = ctx.i18n.getLanguage();
        const hit = shown.get(a.report);
        if (hit && hit.lang === lang && hit.alpha === this.model.alpha) return hit.value;
        const value = present(a.report, this.model.alpha, this.t, lang);
        shown.set(a.report, { lang, alpha: this.model.alpha, value });
        return value;
      },
      /** Kennzahlzeilen. */
      get stats() { return this.shown?.stats ?? []; },
      /** Hinweise. */
      get notes() { return this.shown?.notes ?? []; },
      /** Folgeschritte. */
      get actions() { return this.shown?.actions ?? []; },
      /** Entscheidungssatz. */
      get decisionText() { return this.shown?.decisionText ?? ''; },
      /** Klasse der Entscheidung. */
      get decisionClass() { return this.shown?.decisionClass ?? 'attrtest__decision--keep'; },
      /** Grundlage der Entscheidung. */
      get basisText() { return this.shown?.basisText ?? ''; },
      /** Es gibt eine Kreuztabelle. */
      get hasTable() { return !!this.shown?.table; },
      /** Spaltenköpfe der Kreuztabelle. */
      get tableCols() { return this.shown?.table?.cols ?? []; },
      /** Zeilen der Kreuztabelle. */
      get tableRows() { return this.shown?.table?.rows ?? []; },

      /**
       * Die Bezeichnungen der McNemar-Tafel: eigene, sonst im Spaltenmodus die
       * Namen der gewählten Spalten.
       */
      get pairLabels() {
        const m = this.model;
        let before = String(m.summary.pairs.labels.before || '').trim();
        let after = String(m.summary.pairs.labels.after || '').trim();
        if (m.inputMode === 'columns') {
          before = before || columnName(m.colRefs.before);
          after = after || columnName(m.colRefs.after);
        }
        return { before, after };
      },
      /** Nullhypothese und Alternative. */
      get hypotheses() { return hypotheses(this.model, this.pairLabels, this.t); },

      /** @param {string} k @returns {boolean} Testart gewählt */
      isKind(k) { return this.model.testKind === k; },
      /** @param {string} k @returns {string} Klasse des Testart-Knopfs */
      kindClass(k) { return this.model.testKind === k ? 'btn--active' : ''; },
      /** Eingabe als Zusammenfassung. */
      get isSummary() { return this.model.inputMode === 'summary'; },
      /** @param {string} m @returns {string} Klasse des Eingabeart-Knopfs */
      modeClass(m) { return this.model.inputMode === m ? 'btn--active' : ''; },
      /** @param {number} n @returns {string} Klasse des Stichproben-Knopfs */
      samplesClass(n) { return this.model.equiv.samples === n ? 'btn--active' : ''; },
      /** @param {boolean} on @returns {string} Klasse des Grenzen-Knopfs */
      boundsClass(on) { return this.model.equiv.symmetric === on ? 'btn--active' : ''; },
      /** Eine Stichprobe (ein Anteil, Äquivalenz mit einer Stichprobe). */
      get oneSample() { return this.isKind('one') || (this.isKind('equiv') && this.model.equiv.samples === 1); },
      /** Zwei Stichproben (zwei Anteile, Äquivalenz mit zwei Stichproben). */
      get twoSample() { return this.isKind('two') || (this.isKind('equiv') && this.model.equiv.samples === 2); },
      /** @param {string} key @returns {string} Grenzenbeschriftung, bei einer Stichprobe relativ zu p₀ */
      boundLabel(key) { return this.t(this.oneSample ? `${key}One` : key); },
      /** @param {string} slot @returns {boolean} die Spaltenrolle wirkt */
      usesSlot(slot) { return this.activeColumnSlots.includes(slot); },
      /** Umfang je Zeile (Raten aus Spalten). */
      get usesExposurePerRow() { return !this.isSummary && (this.isKind('rate1') || this.isKind('rate2')); },
      /** Ereigniswert wählbar. */
      get showEvent() { return this.activeParams.includes('eventValue'); },
      /** Die Richtung wirkt. */
      get showDirection() { return showsDirection(this.model, ctx.source); },
      /** Die Richtungen für die Auswahl. */
      get directionOptions() {
        return DIRECTIONS.map(([value, key]) => ({ value, label: this.t(key), selected: value === this.model.direction }));
      },
      /** Die Ereigniswerte für die Auswahl. */
      get eventOptions() {
        const on = this.effectiveEventValue;
        return this.eventValueOptions.map((v) => ({ value: v, selected: v === on }));
      },
      /** @param {Event} event Ereigniswert gewählt */
      onEventChange(event) {
        setFields(this.model, { eventValue: /** @type {HTMLSelectElement} */ (event.target).value });
      },

      // ─── Tafeln ─────────────────────────────────────────
      /** Zeilenindizes der Kreuztabelle. */
      get rowIdx() { return this.model.summary.table.rows.map((_, i) => i); },
      /** Spaltenindizes der Kreuztabelle. */
      get colIdx() { return this.model.summary.table.cols.map((_, j) => j); },
      /** @param {number} i @returns {string} */
      rowName(i) { return this.model.summary.table.rows[i]; },
      /** @param {number} j @returns {string} */
      colName(j) { return this.model.summary.table.cols[j]; },
      /** @param {number} i @param {number} j @returns {string} Zelle als Text, leer ohne Wert */
      cellText(i, j) {
        const v = this.model.summary.table.counts[i]?.[j];
        return v == null ? '' : formatNumber(v, ctx.i18n.getLanguage(), { profile: 'input' });
      },
      /** @param {number} i @param {number} j @returns {string} Paarzelle als Text, leer ohne Wert */
      pairText(i, j) {
        const v = this.model.summary.pairs.counts[i]?.[j];
        return v == null ? '' : formatNumber(v, ctx.i18n.getLanguage(), { profile: 'input' });
      },
      /** Eine Zeile mehr als das Minimum. */
      get canRemoveRow() { return this.model.summary.table.rows.length > MIN_DIM; },
      /** Eine Spalte mehr als das Minimum. */
      get canRemoveCol() { return this.model.summary.table.cols.length > MIN_DIM; },
      /** @param {Event} event Zelle der Kreuztabelle getippt */
      onCell(event) { return writeCell(this, 'setTableCell', event); },
      /** @param {Event} event Zelle der McNemar-Tafel getippt */
      onPair(event) { return writeCell(this, 'setPairCell', event); },
      /** @param {Event} event Zeilenname getippt */
      async onRowName(event) {
        const el = /** @type {HTMLInputElement} */ (event.target);
        await runUiCommand(this._ui, 'setTableRowName', { row: Number(el.dataset.row), name: el.value });
      },
      /** @param {Event} event Spaltenname getippt */
      async onColName(event) {
        const el = /** @type {HTMLInputElement} */ (event.target);
        await runUiCommand(this._ui, 'setTableColName', { col: Number(el.dataset.col), name: el.value });
      },
    };
  },
});

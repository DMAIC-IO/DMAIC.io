/**
 * D.Mike — Morphologischer Kasten: Viewmodel.
 *
 * Inhalt, Kommandos und Invarianten liegen im Model (domain/model.js); die
 * Agentenfläche entsteht aus dessen Schema. Namen und Bezeichnungen binden
 * über `x-field`, Löschknöpfe über `x-command`, Reiter und aktives Konzept
 * über `x-set` (Reiter und Knopfgruppe). Die Kennzahlen liefern die Ableitungen des Models; hier bleiben die
 * Ansichtsfunktionen von Kasten, Konzeptliste und Verträglichkeitsmatrix
 * und die Handler, die nach dem Anlegen fokussieren oder ein Kästchen in ein
 * Kommando übersetzen.
 */
import { createModule } from '../../../core/template-module.js';
import { formatNumber } from '../../../core/number-format.js';
import descriptor from '../module.js';
import { State, VIEWS } from '../domain/model.js';

/** Konzeptfarben laufen reihum durch die Diagrammpalette (`--color-chart-1 … 8`). */
const PALETTE_SIZE = 8;

/**
 * Die Lesefläche dieses Moduls, wie `read()` sie liefert.
 *
 * @typedef {object} AgentRead
 * @property {object[]} parameters  the parameters with their options, in box order
 * @property {string[]} optionIds  the ids of all options, in box order
 * @property {string[][]} conflicts  the incompatible option pairs
 * @property {object[]} concepts  the concepts with their picks
 * @property {number} combinationCount  all combinations of one option per parameter
 * @property {number} consistentCount  combinations without an incompatible pair
 * @property {boolean} consistentExact  false when consistentCount is only a lower bound
 * @property {import('../domain/model.js').ConceptCheck[]} conceptChecks  per concept: id, complete, conflicts
 */

/**
 * Eine Ausprägung als Zeile oder Spalte der Verträglichkeitsmatrix.
 * @typedef {{ id: string, parameterId: string, parameterIndex: number }} MatrixOption
 */

/** @typedef {{ id: string, name: string, picks: Record<string, string> }} Concept */

/**
 * Das Model mit den lesenden Hilfen der Klasse State.
 * @typedef {import('../domain/model.types.js').StateModel & Pick<State, 'findParameter'|'findOption'|'findConcept'|'optionIds'|'isConflict'|'combinationCount'|'consistentCount'|'isConceptComplete'|'conceptConflicts'>} BoxModel
 */

export default createModule({
  descriptor,
  Model: State,
  history: true,
  /** @type {import('../../../core/template-module.js').ViewFn<BoxModel, {}>} */
  view(ctx) {
    return {
      // ─── Kennzahlen und Reiter ────────────────────────────
      /** Die Ansichten in Reiterreihenfolge. */
      get views() { return VIEWS; },
      /** @param {number} n @returns {string} Zahl in der aktiven Sprache */
      formatCount(n) { return formatNumber(n, ctx.i18n.getLanguage()); },
      /** Kennzahl der verträglichen Kombinationen, „≥ n“ bei einer Untergrenze. */
      get consistentText() {
        const n = this.formatCount(this.consistentCount);
        return this.consistentExact ? n : `≥ ${n}`;
      },
      /** Warnfarbe, wenn Unverträglichkeiten jede Kombination ausschließen. */
      get consistentKpiClass() {
        return this.combinationCount > 0 && this.consistentCount === 0 ? 'dmike-kpi--warn' : '';
      },
      /** @param {string} view @returns {string} */
      tabClass(view) { return this.model.view === view ? 'dmike-tab--active' : ''; },
      get isBoxView() { return this.model.view === 'box'; },
      get showMatrix() { return this.model.view === 'consistency' && this.model.parameters.length > 0; },

      // ─── Kasten ───────────────────────────────────────────
      /** @param {number} index @returns {string} Farbklasse des Konzepts an dieser Stelle */
      colorClass(index) { return `morphological-box__color--c${(index % PALETTE_SIZE) + 1}`; },
      /**
       * Die Konzepte, die eine Ausprägung wählen, mit ihrer Farbstelle.
       * @param {string} optionId @returns {{ id: string, name: string, index: number }[]}
       */
      markersFor(optionId) {
        /** @type {{ id: string, name: string, index: number }[]} */
        const out = [];
        this.model.concepts.forEach((/** @type {Concept} */ c, /** @type {number} */ index) => {
          if (Object.values(c.picks).includes(optionId)) out.push({ id: c.id, name: c.name, index });
        });
        return out;
      },
      /** Das aktive Konzept, oder undefined. */
      get activeConcept() { return this.model.findConcept(this.model.activeConceptId); },
      /** @param {string} parameterId @param {string} optionId @returns {boolean} */
      isPickedByActive(parameterId, optionId) {
        const c = this.activeConcept;
        return !!c && c.picks[parameterId] === optionId;
      },
      /**
       * Die Ausprägung ist mit einer Wahl des aktiven Konzepts in einem anderen Parameter unverträglich.
       * @param {string} parameterId @param {string} optionId @returns {boolean}
       */
      isBlockedByActive(parameterId, optionId) {
        const c = this.activeConcept;
        if (!c) return false;
        return Object.entries(c.picks).some(([p, o]) => p !== parameterId && this.model.isConflict(o, optionId));
      },
      /** @param {string} parameterId @param {string} optionId @returns {Record<string, boolean>} */
      optionCellClass(parameterId, optionId) {
        return {
          'morphological-box__option--picked': this.isPickedByActive(parameterId, optionId),
          'morphological-box__option--blocked': this.isBlockedByActive(parameterId, optionId),
        };
      },
      /** @param {string} parameterId @param {string} optionId @returns {string} */
      pickPressed(parameterId, optionId) { return this.isPickedByActive(parameterId, optionId) ? 'true' : 'false'; },
      /** Wahlknöpfe sind gesperrt, solange kein Konzept aktiv ist. */
      get pickDisabled() { return !this.activeConcept; },
      /** @param {string} optionId @returns {string} Bezeichnung oder Platzhalter */
      optionText(optionId) { return this.model.findOption(optionId)?.label || this.t('unnamedOption'); },
      /** @param {string} parameterId @returns {string} Name oder Platzhalter */
      parameterText(parameterId) { return this.model.findParameter(parameterId)?.name || this.t('unnamedParameter'); },

      // ─── Konzepte ─────────────────────────────────────────
      /** @param {{ name: string }} concept @returns {string} Name oder Platzhalter */
      conceptText(concept) { return concept.name || this.t('unnamedConcept'); },
      /** @param {Concept} concept @returns {string} vollständig / unvollständig / n unverträgliche Paare */
      conceptStatus(concept) {
        const n = this.model.conceptConflicts(concept.id).length;
        if (n > 0) return this.t('conceptConflicts', { n: String(n) });
        return this.model.isConceptComplete(concept.id) ? this.t('conceptComplete') : this.t('conceptIncomplete');
      },
      /** @param {Concept} concept @returns {string} */
      conceptStatusClass(concept) {
        if (this.model.conceptConflicts(concept.id).length > 0) return 'morphological-box__concept-status--conflict';
        return this.model.isConceptComplete(concept.id) ? 'morphological-box__concept-status--complete' : '';
      },
      /** @param {Concept} concept @returns {string[]} die unverträglichen Paare als „A ↔ B“ */
      conflictTexts(concept) {
        return this.model.conceptConflicts(concept.id).map(([a, b]) => `${this.optionText(a)} ↔ ${this.optionText(b)}`);
      },
      /** @param {Concept} concept @returns {string} */
      conceptCardClass(concept) { return concept.id === this.model.activeConceptId ? 'morphological-box__concept--active' : ''; },

      // ─── Verträglichkeitsmatrix ───────────────────────────
      /** Jede Ausprägung mit Parameter und dessen Stelle. @returns {MatrixOption[]} */
      get matrixOptions() {
        return this.model.parameters.flatMap((/** @type {{ id: string, options: { id: string }[] }} */ p, /** @type {number} */ parameterIndex) =>
          p.options.map((o) => ({ id: o.id, parameterId: p.id, parameterIndex })));
      },
      /** Zeilen: alle Ausprägungen außer denen des ersten Parameters. @returns {MatrixOption[]} */
      get matrixRows() { return this.matrixOptions.filter((/** @type {MatrixOption} */ o) => o.parameterIndex > 0); },
      /** Spalten: alle Ausprägungen außer denen des letzten Parameters. @returns {MatrixOption[]} */
      get matrixCols() {
        const last = this.model.parameters.length - 1;
        return this.matrixOptions.filter((/** @type {MatrixOption} */ o) => o.parameterIndex < last);
      },
      /** Die Parameter über den Spalten (alle außer dem letzten). */
      get matrixColParameters() { return this.model.parameters.slice(0, -1); },
      /** @param {MatrixOption} row @param {MatrixOption} col @returns {boolean} Zelle mit Kästchen (unteres Dreieck) */
      isPairCell(row, col) { return col.parameterIndex < row.parameterIndex; },
      /** @param {MatrixOption} row @param {MatrixOption} col @returns {boolean} */
      isConflictCell(row, col) { return this.model.isConflict(row.id, col.id); },
      /** @param {MatrixOption} row @param {MatrixOption} col @returns {string} */
      pairLabel(row, col) { return this.t('pairLabel', { a: this.optionText(row.id), b: this.optionText(col.id) }); },
      /** @param {number} rowIndex @returns {boolean} die Zeile ist die erste Ausprägung ihres Parameters */
      rowStartsGroup(rowIndex) {
        const rows = this.matrixRows;
        return rowIndex === 0 || rows[rowIndex - 1].parameterId !== rows[rowIndex].parameterId;
      },
      /** @param {MatrixOption} row @returns {number} Zeilen, über die der Parameterkopf reicht */
      rowGroupSize(row) { return this.model.findParameter(row.parameterId)?.options.length || 1; },
      /** @param {number} rowIndex @returns {string} */
      rowGroupClass(rowIndex) { return rowIndex > 0 && this.rowStartsGroup(rowIndex) ? 'morphological-box__matrix-row--group' : ''; },
      /** @param {MatrixOption} col @returns {string} */
      colGroupClass(col) {
        const cols = this.matrixCols;
        const i = cols.findIndex((/** @type {MatrixOption} */ c) => c.id === col.id);
        return i > 0 && cols[i - 1].parameterId !== col.parameterId ? 'morphological-box__matrix-col--group' : '';
      },
      /** @param {MatrixOption} row @param {MatrixOption} col @returns {string} */
      cellClass(row, col) {
        return [
          this.isPairCell(row, col) ? 'morphological-box__matrix-cell--pair' : 'morphological-box__matrix-cell--void',
          this.colGroupClass(col),
        ].filter(Boolean).join(' ');
      },

      // ─── Handler ──────────────────────────────────────────
      /** @param {string} selector Fokus nach dem nächsten Zeichnen */
      focusLater(selector) {
        this.$nextTick(() => { /** @type {HTMLElement|null} */ (this.$root.querySelector(selector))?.focus(); });
      },
      /** Parameter anhängen und seinen Namen fokussieren. */
      addParameterAndFocus() {
        const id = this.model.addParameter({});
        this.focusLater(`[data-parameter-name="${id}"]`);
      },
      /** @param {string} parameterId Ausprägung anhängen und ihre Bezeichnung fokussieren */
      addOptionAndFocus(parameterId) {
        const id = this.model.addOption({ parameterId });
        this.focusLater(`[data-option-label="${id}"]`);
      },
      /** Konzept anhängen (wird aktiv) und seinen Namen fokussieren. */
      addConceptAndFocus() {
        const id = this.model.addConcept({});
        this.focusLater(`[data-concept-name="${id}"]`);
      },
      /**
       * Wahl des aktiven Konzepts in einem Parameter umschalten.
       * @param {string} parameterId @param {string} optionId
       */
      togglePick(parameterId, optionId) {
        const c = this.activeConcept;
        if (!c) return;
        this.model.setConceptPick({ conceptId: c.id, parameterId, optionId: this.isPickedByActive(parameterId, optionId) ? '' : optionId });
      },
      /**
       * Kästchen der Matrix: das Paar markieren oder die Markierung aufheben.
       * @param {MatrixOption} row @param {MatrixOption} col @param {Event} event
       */
      conflictChanged(row, col, event) {
        const incompatible = /** @type {HTMLInputElement} */ (event.target).checked;
        this.model.setConflict({ optionA: row.id, optionB: col.id, incompatible });
      },
    };
  },
});

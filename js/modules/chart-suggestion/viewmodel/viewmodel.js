/**
 * D.Mike — Diagramm-Vorschlag: Viewmodel.
 *
 * Die gewählten Spalten sind Bezüge im Model; Namen, Rollen und Werte kommen
 * live über `ctx.data`. Rangliste, gezeigte Wahl, Zielmodul und Vorschau sind
 * `computed`; die Vorschau zeichnen Diagramm-Widgets.
 *
 * Eingang: `chart-suggestion:load` { instanceId, selection } von der
 * Datensammlung. Ausgang: `module:added` beim Öffnen im eigenen Modul.
 */
import { createModule } from '../../../core/template-module.js';
import { command, list, columnRef, text, object, setFields } from '../../../core/model.js';
import { requireEnum } from '../../../core/validate.js';
import { getSuggestionsFor } from '../../../core/chart-suggestions/chart-suggestions.js';
import { openInstance } from '../../../core/instance-handoff.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { refsFromSelection } from '../domain/migrations.js';
import { liveColumns, checkRefs, shownType } from '../domain/columns.js';
import { buildPrefill } from '../domain/prefill.js';
import { buildPreview } from '../domain/panels.js';
import { fromExample } from '../io/example.js';
import { thumbIcon, thumbRaw } from './thumbs.js';

/**
 * Die Lesefläche dieses Moduls, wie `read()` sie liefert.
 *
 * @typedef {object} AgentRead
 * @property {Selection|null} selection  the selected columns and their source sheet, or null without a selection
 * @property {Suggestion[]} suggestions  the matching charts in rank order
 * @property {string|null} selectedChartType  the picked chart type, or null without suggestions
 * @property {string|null} openTarget  module id openInModule would create, or null for a preview-only type
 * @property {object[]} pickableColumns  the columns setColumns accepts, each `{ key, name }`
 * @property {import('../domain/panels.js').Preview} preview  the chart data of the shown preview: one chart, a panel set or none
 */

/**
 * Die Auswahl, wie `read().selection` sie liefert — ohne Werte, die stehen im Worksheet.
 *
 * @typedef {object} Selection
 * @property {string} sourceInstanceId  worksheet instance the columns come from
 * @property {string} sourceSheetId  sheet of that worksheet
 * @property {SelectedColumn[]} columns  the selected columns in selection order
 */

/**
 * Eine gewählte Spalte.
 *
 * @typedef {object} SelectedColumn
 * @property {string} id  column id in the sheet
 * @property {string} name  display name of the column
 * @property {string} role  role that drives the ranking: continuous, categorical, ordinal or date
 * @property {boolean} roleConfirmed  true when the role was set or confirmed by hand in the worksheet
 */

/**
 * Ein Diagrammvorschlag.
 *
 * @typedef {object} Suggestion
 * @property {string} type  chart type, the value pickChart accepts
 * @property {string} title  translated title
 * @property {string} notes  translated note, or '' without one
 */

/** @typedef {import('../domain/panels.js').Preview} Preview */
/** @typedef {import('../domain/panels.js').Cell} Cell */

const NO_PREVIEW = Object.freeze({ kind: 'none' });

export default createModule({
  descriptor,
  Model: State,
  fromExample,
  commands: {
    setColumns: command({
      params: { refs: list(columnRef({ nullable: false })) },
      returns: list(text()),
      run({ refs }) {
        checkRefs(refs, this.pickableKeys());
        setFields(this.model, { columns: refs });
        return this.snapshot(refs).ranking.map((s) => s.type);
      },
    }),
    pickChart: command({
      params: { type: text() },
      run({ type }) {
        const { ranking } = this.snapshot(this.model.columns);
        requireEnum('type', type, ranking.map((s) => s.type));
        if (type === this.model.pick) return;
        setFields(this.model, { pick: type });
      },
    }),
    openInModule: command({
      params: {},
      returns: object({ instanceId: text(), moduleId: text() }, { nullable: true }),
      run() {
        const { cols, shown } = this.snapshot(this.model.columns);
        const prefill = this.prefillFor(shown, cols);
        if (!prefill) return null;
        return openInstance(this._ui.services, { moduleId: prefill.target, state: prefill.state });
      },
    }),
  },
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    /** @type {((payload: { instanceId?: string, selection?: unknown }) => void)|null} */
    let onLoad = null;
    return {
      init() {
        // Eingang aus der Datensammlung: unbekannte oder fremde Bezüge ergeben eine leere Auswahl, die Wahl bleibt.
        onLoad = ({ instanceId, selection } = {}) => {
          if (instanceId !== ctx.instanceId) return;
          const refs = refsFromSelection(selection);
          let valid = true;
          try { checkRefs(refs, this.pickableKeys()); } catch { valid = false; }
          setFields(this.model, { columns: valid ? refs : [] });
        };
        ctx.eventBus.on('chart-suggestion:load', onLoad);
      },
      destroy() {
        if (onLoad) ctx.eventBus.off('chart-suggestion:load', onLoad);
        onLoad = null;
      },

      computed: {
        /**
         * Die gewählten Spalten mit Rolle und Quelle; null ohne auflösbare Spalte.
         * @returns {Selection|null}
         */
        selection() {
          const cols = this.liveColumns;
          if (cols.length === 0) return null;
          const first = this.model.columns[0];
          return {
            sourceInstanceId: first.instanceId,
            sourceSheetId: first.sheetId ?? '',
            columns: cols.map((/** @type {any} */ c) => ({ id: c.id, name: c.name, role: c.role, roleConfirmed: c.roleConfirmed })),
          };
        },
        /**
         * Die passenden Diagramme in Rangfolge, übersetzt.
         * @returns {Suggestion[]}
         */
        suggestions() {
          return getSuggestionsFor(this.liveColumns).map((s) => ({
            type: s.type,
            title: this.t(`charts.${s.i18nKey}`),
            notes: s.notesKey ? this.t(`notes.${s.notesKey}`) : '',
          }));
        },
        /**
         * Die gezeigte Wahl: die des Nutzers, wenn vorgeschlagen, sonst der Spitzenreiter.
         * @returns {string|null}
         */
        selectedChartType() {
          return Array.isArray(this.suggestions) ? shownType(this.suggestions, this.model.pick) : null;
        },
        /**
         * Das Modul, das openInModule anlegt, oder null.
         * @returns {string|null}
         */
        openTarget() {
          return this.prefillFor(this.selectedChartType, this.liveColumns)?.target ?? null;
        },
        /**
         * Die Spalten, die setColumns annimmt.
         * @returns {{ key: string, name: string }[]}
         */
        pickableColumns() {
          return ctx.data.columns();
        },
        /**
         * Die Vorschau des gezeigten Diagramms.
         * @returns {Preview}
         */
        preview() {
          const type = this.selectedChartType;
          if (typeof type !== 'string') return NO_PREVIEW;
          return buildPreview(type, this.liveColumns, this.labels, ctx.i18n.getLanguage());
        },
      },

      // ─── Arbeitsblatt (live, nicht in read()) ─────────────
      /** Die gewählten Spalten mit Werten. */
      get liveColumns() { return liveColumns(this.model.columns, ctx.data); },
      /**
       * Spalten, Rangliste und gezeigte Wahl für diese Bezüge, frisch gerechnet —
       * für Kommandos, die nicht auf die nächste Runde der `computed` warten.
       * @param {Array<{ instanceId: string, sheetId?: string, columnId: string }>} refs
       * @returns {{ cols: import('../domain/columns.js').LiveColumn[], ranking: Array<{ type: string, i18nKey: string, notesKey: string|null }>, shown: string|null }}
       */
      snapshot(refs) {
        const cols = liveColumns(refs, ctx.data);
        const ranking = getSuggestionsFor(cols);
        return { cols, ranking, shown: shownType(ranking, this.model.pick) };
      },
      /** Schlüssel der wählbaren Spalten. @returns {string[]} */
      pickableKeys() { return ctx.data.columns().map((c) => c.key); },
      /**
       * Vorbelegung des Zielmoduls für einen Typ und die gewählten Spalten, oder null.
       * @param {string|null} type @param {import('../domain/columns.js').LiveColumn[]} cols
       * @returns {{ target: string, state: object }|null}
       */
      prefillFor(type, cols) {
        const first = this.model.columns[0];
        if (!first) return null;
        return buildPrefill(type, cols, first.instanceId, first.sheetId ?? '');
      },
      /** Texte der Vorschau; `previewUnavailable` behält `{type}` (die Domäne setzt ihn ein). */
      get labels() {
        return {
          frequency: this.t('axis.frequency'), observation: this.t('axis.observation'), count: this.t('axis.count'),
          proportion: this.t('axis.proportion'), mean: this.t('axis.mean'), other: this.t('axis.other'),
          otherCategories: this.t('axis.otherCategories'), percentile: this.t('axis.percentile'),
          variable: this.t('axis.variable'), value: this.t('axis.value'), cumulativeSum: this.t('axis.cumulativeSum'),
          previewUnavailable: this.t('axis.previewUnavailable'),
        };
      },

      // ─── Galerie ──────────────────────────────────────────
      get hasSuggestions() { return Array.isArray(this.suggestions) && this.suggestions.length > 0; },
      get emptyText() { return this.t(this.selection ? 'emptyStateNoMatch' : 'emptyStateNoSelection'); },
      get selectionColumns() { return this.selection && Array.isArray(this.selection.columns) ? this.selection.columns : []; },
      get selectionLabel() { return this.t('selectionLabel', { n: this.selectionColumns.length }); },
      /** @param {string} role @returns {string} */
      roleName(role) { return this.t(`role.${role}`); },
      /** @param {{ type: string }} s @returns {boolean} */
      isActive(s) { return s.type === this.selectedChartType; },
      /** @param {string} type @returns {string} */
      thumbIcon(type) { return thumbIcon(type); },
      /** @param {string} type @returns {boolean} */
      thumbRaw(type) { return thumbRaw(type); },

      // ─── Vorschau ─────────────────────────────────────────
      /** Der gezeigte Vorschlag, oder null. */
      get shownSuggestion() {
        return this.hasSuggestions ? (this.suggestions.find((/** @type {Suggestion} */ s) => s.type === this.selectedChartType) ?? null) : null;
      },
      get previewTitle() { return this.shownSuggestion?.title ?? ''; },
      get previewNotes() { return this.shownSuggestion?.notes ?? ''; },
      /** Hinweis statt Diagramm: keine Vorschau für den Typ, oder ein Fehler beim Rechnen. */
      get previewPlaceholder() {
        const p = this.preview;
        if (p && typeof p === 'object' && 'error' in p) return String(p.error);
        if (p?.kind !== 'none' || typeof this.selectedChartType !== 'string') return '';
        return this.t('axis.previewUnavailable', { type: this.selectedChartType });
      },
      /** @returns {any} Konfiguration des einen Diagramms, sonst null */
      get previewConfig() { return this.preview?.kind === 'single' ? this.preview.config : null; },
      /** @param {string} name @returns {boolean} */
      isWidget(name) { return this.preview?.kind === 'single' && this.preview.widget === name; },
      get isPanels() { return this.preview?.kind === 'panels'; },
      /** @returns {Cell[]} */
      get previewCells() { return this.isPanels ? this.preview.cells : []; },
      get previewLayoutClass() { return this.isPanels ? `chart-suggestion__matrix--${this.preview.layout}` : ''; },
      get previewGridStyle() { return this.isPanels ? { '--matrix-n': String(this.preview.n) } : {}; },
      get previewNoteText() {
        const note = this.isPanels ? this.preview.note : null;
        return note ? this.t('notes.matrixTruncated', { shown: note.shown, total: note.total }) : '';
      },
      /** @param {Cell} cell @param {string} name @returns {boolean} */
      cellIs(cell, name) { return cell.widget === name; },
      /** @param {Cell} cell @returns {boolean} */
      cellHasText(cell) { return cell.widget === null && !cell.placeholder && cell.label !== ''; },
      /** @param {Cell} cell @returns {string} */
      cellClass(cell) {
        if (cell.widget !== null || cell.placeholder) return '';
        return cell.label !== '' ? 'chart-suggestion__matrix-cell--diag' : 'chart-suggestion__matrix-cell--empty';
      },
    };
  },
});

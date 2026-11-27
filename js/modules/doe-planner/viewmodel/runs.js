/**
 * D.Mike — DoE Planner: view part "runs" (viewmodel/runs.js)
 *
 * The run table and the datasheet of the plan. Without a current datasheet
 * the preview shows the design in the datagrid widget in its table() form:
 * `previewTable` builds a TableData of the run table for display only (the
 * model keeps the design and the edits). The widget reports every edit as a
 * role; the viewmodel commands `preview…` turn the roles into the model
 * commands `setPreviewCell`, `setPreviewCells` and `forbidRun` (typing,
 * paste, clear and cut, fill, the row menu of an optimal design). Sorting,
 * columns and rows are not offered. Undo goes through the module history.
 * Once a datasheet is bound its fill state comes from the sheet through
 * `ctx.source`; a response column that is gone from the sheet shows a note
 * instead of numbers. The buttons start the runs (create, hand over,
 * extend) and open the sheet or the new regression afterwards. The export
 * button in the corner of the grid (role `exportAs`) downloads the preview
 * with its head as `data.xlsx`, `data.csv` or `data.json`, like the legacy grid.
 */
import { formatNumber } from '../../../core/number-format.js';
import { TableData } from '../../../core/table-data.js';
import { command, text, number, list, object, boolean, oneOf } from '../../../core/model.js';
import { runExport } from '../../../core/exporter.js';
import { downloadFile } from '../../../core/export-utils.js';
import {
  gridRows, gridRecords, gridCsv, XLSX_SHEET_NAME, EXPORT_FILE_NAME,
} from '../../../core/datagrid/table/export.js';
import { fillBlock } from '../../../core/datagrid/table/paste.js';
import { inferRole } from '../../../core/datagrid/datagrid-roles.js';
import { buildRunTable, editsDirty, previewColumns, previewValue } from '../domain/runtable.js';
import { actualRows, isOptimal } from '../domain/design.js';

/**
 * A column head of the preview in model form (`x-widget-columns`).
 * @typedef {{ id: string, name: string, shortName: string, type: string, unit: string|null, role: string,
 *   format: { decimals: number|null }|null,
 *   meta: { lock: 'hard'|'soft', reason: string, managedBy: string }|null }} PreviewColumn
 */

/**
 * The preview as the datagrid widget takes it: the run table as a TableData
 * (values, not text), the column heads and a counter that rises with every
 * new build (`x-widget-rev`).
 * @typedef {{ table: TableData, columns: PreviewColumn[], rev: number }} PreviewTable
 */

/** Roles of the widget → viewmodel commands of the preview. */
const PREVIEW_COMMANDS = Object.freeze({
  setCells: 'previewSetCells',
  pasteBlock: 'previewPasteBlock',
  clearRange: 'previewClearRange',
  fillRange: 'previewFillRange',
  contextMenu: 'previewContextMenu',
  exportAs: 'previewExport',
});

/** Copy and paste, fill handle; no formulas, roles, structure or sorting. */
const PREVIEW_FEATURES = Object.freeze({ clipboard: true, fill: true });

const row0 = () => number({ integer: true, min: 0 });
const rect = (opts) => object({ c0: row0(), r0: row0(), c1: row0(), r1: row0() }, opts);

/**
 * The model as the run table reads it: the stored design with its settings as numbers.
 * @param {any} m planner model with a design
 * @returns {any}
 */
const tableView = (m) => ({
  factors: m.factors,
  responses: m.responses,
  previewEdits: m.previewEdits,
  design: { ...m.design, actualMatrix: actualRows(m.design, m.factors) },
});

/**
 * The run table of the model as table and column heads of the preview; empty without a design.
 * @param {any} m planner model
 * @param {(key: string) => string} t module translation
 * @returns {{ table: TableData, columns: PreviewColumn[] }}
 */
function previewOf(m, t) {
  if (!m.design || !m.design.actualMatrix.length) return { table: TableData.empty(), columns: [] };
  const cols = /** @type {any[]} */ (buildRunTable(tableView(m), t));
  const keys = previewColumns(m);
  return {
    table: new TableData(m.design.actualMatrix.length, cols.map((c) => c.values)),
    columns: cols.map((c, i) => ({
      id: keys[i],
      name: c.name,
      // Short name and role as the grid has always shown them: C1, C2, … and the role from the values.
      shortName: `C${i + 1}`,
      type: c.type,
      unit: c.unit || null,
      role: inferRole(c),
      format: c.format ? { decimals: c.format.decimals ?? null } : null,
      meta: c.meta ? { lock: c.meta.lock, reason: c.meta.reason, managedBy: 'doe-planner' } : null,
    })),
  };
}

/**
 * The preview with its build counter; a build that throws gives the empty
 * preview (the cause goes to the console), so the widget and the commands
 * never see an `{ error }`.
 * @param {() => { table: TableData, columns: PreviewColumn[] }} build
 * @param {number} rev
 * @returns {PreviewTable}
 */
export function previewOrEmpty(build, rev) {
  try {
    return { ...build(), rev };
  } catch (err) {
    console.warn('[doe-planner] preview', err);
    return { table: TableData.empty(), columns: [], rev };
  }
}

/** @type {import('./state.types.js').DoePlannerViewFn} */
export const runsView = (ctx) => {
  /** Builds of the preview so far (`previewTable.rev`). */
  let rev = 0;
  return {
    // ── State of the datasheet ────────────────────────────────

    /** @returns {boolean} the bound datasheet is gone out of step with the plan */
    get isStale() { return this.staleness === 'stale'; },

    /** @returns {boolean} the bound datasheet matches the plan */
    get isBound() { return this.staleness === 'bound'; },

    /** @returns {boolean} no datasheet (or it is gone) */
    get isUnbound() { return this.staleness === 'none'; },

    /** @returns {boolean} a response column of the bound sheet is gone */
    get progressMissing() { return Boolean(this.progress && this.progress.missing.length > 0); },

    /** @returns {string} which response columns are gone from the bound sheet */
    get missingColumnsText() {
      const missing = this.progress ? this.progress.missing : [];
      const names = missing.map((i) => this.model.responses[i]?.name || `Y${i + 1}`).join(', ');
      return this.t('responseColumnMissing', { names });
    },

    /** @returns {boolean} the fill state can be shown in numbers */
    get showProgress() { return Boolean(this.progress) && !this.progressMissing; },

    /** @returns {string} inline width of the fill bar */
    get progressBarStyle() { return `width:${this.progress ? this.progress.pct : 0}%`; },

    /** @returns {string} filled of all response cells, in the app language */
    get progressText() {
      const p = this.progress;
      if (!p) return '';
      const lang = ctx.context.language;
      return `${formatNumber(p.filled, lang)} / ${formatNumber(p.total, lang)} ${this.t('valuesFilled')} (${formatNumber(p.pct, lang)}%)`;
    },

    /** @returns {boolean} every response cell of the bound sheet holds a number */
    get progressComplete() { return Boolean(this.progress && this.progress.complete); },

    /** @returns {string} id of the augment field, unique per instance (its label points to it) */
    get augmentFieldId() { return `doe-augment-runs-${ctx.instanceId}`; },

    /** @returns {boolean} an optimal design: it can grow by new runs */
    get canAugment() { return isOptimal(this.model); },

    // ── Preview ───────────────────────────────────────────────

    /** @returns {boolean} the preview shows: a design and no current datasheet */
    get showPreview() { return !this.isBound && Boolean(this.model.design && this.model.design.actualMatrix.length); },

    /** @returns {boolean} a setting was changed by hand; the evaluation is for the design as made */
    get previewSettingsChanged() {
      const m = this.model;
      if (!m.previewEdits || !m.design || this.pending) return false;
      return editsDirty(tableView(m), m.previewEdits);
    },

    /**
     * The widget configuration of the preview: read only while a new design is
     * pending or the design is bound to its datasheet (the sheet may be gone,
     * the model cannot tell); the forbid entry only for an optimal design.
     * @returns {{ readOnly: boolean, features: { clipboard: boolean, fill: boolean },
     *   commands: Record<string, string>, contextMenu: Array<{ id: string, labelKey: string }> }}
     */
    get previewConfig() {
      return {
        readOnly: Boolean(this.pending) || /** @type {any} */ (this.model).previewLocked(),
        features: PREVIEW_FEATURES,
        commands: PREVIEW_COMMANDS,
        contextMenu: isOptimal(this.model) ? [{ id: 'forbidRun', labelKey: 'forbiddenContextAction' }] : [],
      };
    },

    computed: {
      /**
       * The preview for display: locked order columns, the factors
       * (categorical ones locked), the responses with seeds and edits. Built
       * anew whenever the design or the edits change; `rev` counts the builds.
       * @returns {PreviewTable}
       */
      previewTable() {
        rev += 1;
        return previewOrEmpty(() => previewOf(this.model, (/** @type {string} */ key) => this.t(key)), rev);
      },
    },

    /**
     * Makes the design current for the automatic run `generate`.
     * With the module history the new design belongs to the step of the
     * change that called for it: one undo takes back both, and nothing is
     * made anew afterwards.
     * @param {object|null} source rows of the source worksheet, or null
     * @returns {void}
     */
    applyGenerated(source) {
      const run = () => { this.model.regenerate({ source }); };
      if (ctx.history) ctx.history.amend(run);
      else run();
    },

    // ── Buttons ───────────────────────────────────────────────

    /**
     * Starts a run; a run that may not start says why.
     * @param {string} name @param {object} args
     * @returns {Promise<any>} the result of a finished run, otherwise null
     */
    async startRun(name, args) {
      const out = await this._asyncTaskHost.start(name, args);
      if (out.status === 'rejected') ctx.notify(ctx.i18n.t('common.asyncTask.rejected', { reason: out.reason }), 'error');
      return out.status === 'done' ? out.value : null;
    },

    /**
     * Shows an instance of the project (the datasheet, the new regression).
     * @param {string|null|undefined} instanceId
     * @returns {void}
     */
    activate(instanceId) {
      if (instanceId) ctx.eventBus.emit('module:activated', { instanceId });
    },

    /**
     * Creates the datasheet of the design (a stale one is replaced) and opens it.
     * @returns {Promise<void>}
     */
    async recreate() {
      const res = await this.startRun('createDatasheet', {});
      if (res) this.activate(res.instanceId);
    },

    /** Opens the bound datasheet, also a stale one. @returns {void} */
    openWorksheet() { this.activate(this.model.worksheetRef?.instanceId); },

    /**
     * Hands the datasheet to a new regression for the response of the analysis and opens it.
     * @returns {Promise<void>}
     */
    async handOver() {
      const res = await this.startRun('transferToRegression', { response: this.model.analysisResponseIdx });
      if (res) this.activate(res.instanceId);
    },

    /**
     * Extends the optimal design by the number of runs in the field.
     * @returns {Promise<void>}
     */
    async runAugment() {
      await this.startRun('augment', { runs: this.state.augmentRuns });
    },

    /** @param {string} name a run @returns {boolean} the run is going */
    isRunning(name) { return Boolean(this.asyncTasks?.[name]?.running); },
  };
};

/**
 * The column of the preview with this id and its index.
 * @param {PreviewTable} p @param {string} columnId
 * @returns {number}
 * @throws {Error} unknown column
 */
function columnAt(p, columnId) {
  const at = p.columns.findIndex((c) => c.id === columnId);
  if (at < 0) throw new Error(`invalid columnId ${JSON.stringify(columnId)}; allowed: ${p.columns.map((c) => c.id).join(', ')}`);
  return at;
}

/**
 * A cell for `setPreviewCells`: a locked column gives null (the model keeps
 * it), any other the value of the text.
 * @param {PreviewColumn} col @param {any} v
 * @returns {any}
 */
const cellFor = (col, v) => (col.meta?.lock ? null : previewValue(col.type, v));

/**
 * The filled cells of a fill drag as one block: the rows (down or up) or the
 * columns (right or left) the fill reaches inside the preview, from the pure
 * fill of the core (`fillBlock`). Locked columns are null in the block.
 * @param {PreviewTable} p
 * @param {{ c0: number, r0: number, c1: number, r1: number }} s source
 * @param {{ c0: number, r0: number, c1: number, r1: number }} t target
 * @param {boolean} ctrl the other kind of fill (series ↔ copy)
 * @returns {{ row: number, col: number, values: any[][] }|null} null when nothing is filled
 */
export function fillCells(p, s, t, ctrl) {
  const { table, columns } = p;
  const n = table.rowCount;
  const src = (/** @type {number} */ c, /** @type {number} */ r) => ({ value: table.get(c, r), formula: null });
  if (t.r0 !== s.r0 || t.r1 !== s.r1) {
    const dir = t.r1 > s.r1 ? 1 : -1;
    const count = dir === 1 ? t.r1 - s.r1 : s.r0 - t.r0;
    const limit = Math.min(count, dir === 1 ? n - 1 - s.r1 : s.r0);
    if (limit <= 0) return null;
    const row = dir === 1 ? s.r1 + 1 : s.r0 - limit;
    const byCol = [];
    for (let c = s.c0; c <= s.c1; c++) {
      const cells = [];
      for (let r = s.r0; r <= s.r1; r++) cells.push(src(c, r));
      const [filled] = fillBlock([cells], columns[c].type, count, dir, ctrl, { axis: 'v', before: s.r0, after: n - 1 - s.r1 });
      const ordered = dir === 1 ? filled : [...filled].reverse();
      byCol.push(ordered.map((f) => cellFor(columns[c], f.value)));
    }
    return { row, col: s.c0, values: Array.from({ length: limit }, (_, k) => byCol.map((vals) => vals[k] ?? null)) };
  }
  const dir = t.c1 > s.c1 ? 1 : -1;
  const count = dir === 1 ? t.c1 - s.c1 : s.c0 - t.c0;
  const limit = Math.min(count, dir === 1 ? columns.length - 1 - s.c1 : s.c0);
  if (limit <= 0) return null;
  const col = dir === 1 ? s.c1 + 1 : s.c0 - limit;
  const values = [];
  for (let r = s.r0; r <= s.r1; r++) {
    const cells = [];
    for (let c = s.c0; c <= s.c1; c++) cells.push(src(c, r));
    const [filled] = fillBlock([cells], columns[s.c0].type, count, dir, ctrl, {
      axis: 'h', before: s.c0, after: columns.length - 1 - s.c1, maxCols: columns.length,
    });
    const line = new Array(limit).fill(null);
    filled.forEach((f, k) => {
      const c = dir === 1 ? s.c1 + 1 + k : s.c0 - 1 - k;
      line[c - col] = cellFor(columns[c], f.value);
    });
    values.push(line);
  }
  return { row: s.r0, col, values };
}

/**
 * Viewmodel commands of the preview, for the grid only (a parameter with
 * `agentWrite: false` keeps each off the agent surface): the roles of the datagrid widget
 * (`previewConfig.commands`), turned into the model commands. Their
 * arguments are the arguments of the roles; a text cell becomes a number as
 * the column type says (`previewValue`).
 */
export const previewCommands = {
  /**
   * Typed values from a cell down (role `setCells`): one value goes out as
   * `setPreviewCell`, several as `setPreviewCells`.
   * Grid only (role of the datagrid widget)
   */
  previewSetCells: command({
    params: { columnId: text({ agentWrite: false }), startRow: row0(), values: list(text({ nullable: true })) },
    run({ columnId, startRow, values }) {
      const p = this.previewTable;
      const col = p.columns[columnAt(p, columnId)];
      const cells = values.map((v) => previewValue(col.type, v));
      if (cells.length === 1) return this.model.setPreviewCell({ row: startRow, column: columnId, value: cells[0] });
      return this.model.setPreviewCells({ row: startRow, column: columnId, values: cells.map((v) => [v]) });
    },
  }),
  /**
   * A pasted block from a cell (role `pasteBlock`) as `setPreviewCells`,
   * cut to the rows and columns of the preview; locked columns stay.
   * Grid only (role of the datagrid widget)
   */
  previewPasteBlock: command({
    params: { columnId: text({ agentWrite: false }), startRow: row0(), rows: list(list(text({ nullable: true }))) },
    run({ columnId, startRow, rows }) {
      const p = this.previewTable;
      const start = columnAt(p, columnId);
      const height = Math.max(0, p.table.rowCount - startRow);
      const width = p.columns.length - start;
      const values = rows.slice(0, height).map((line) => line.slice(0, width).map((v, j) => cellFor(p.columns[start + j], v)));
      if (!values.length) return undefined;
      return this.model.setPreviewCells({ row: startRow, column: columnId, values });
    },
  }),
  /**
   * Clears a range (role `clearRange`, Delete and cut) as `setPreviewCells`
   * with null; locked columns stay.
   * Grid only (role of the datagrid widget)
   */
  previewClearRange: command({
    params: { c0: number({ integer: true, min: 0, agentWrite: false }), r0: row0(), c1: row0(), r1: row0() },
    run({ c0, r0, c1, r1 }) {
      const p = this.previewTable;
      const last = Math.min(r1, p.table.rowCount - 1);
      const right = Math.min(c1, p.columns.length - 1);
      if (c0 > right || r0 > last) return undefined;
      const values = Array.from({ length: last - r0 + 1 }, () => new Array(right - c0 + 1).fill(null));
      return this.model.setPreviewCells({ row: r0, column: p.columns[c0].id, values });
    },
  }),
  /**
   * Continues a range with the fill handle (role `fillRange`): series or
   * copies as the grid fills them, inside the preview, as `setPreviewCells`;
   * locked columns stay.
   * Grid only (role of the datagrid widget)
   */
  previewFillRange: command({
    params: { source: rect({ agentWrite: false }), target: rect(), ctrl: boolean({ optional: true }) },
    run({ source, target, ctrl = false }) {
      const p = this.previewTable;
      const block = fillCells(p, source, target, ctrl);
      if (!block) return undefined;
      return this.model.setPreviewCells({ row: block.row, column: p.columns[block.col].id, values: block.values });
    },
  }),
  /**
   * An entry of the row menu (role `contextMenu`): `forbidRun` forbids the
   * run of this row (optimal design only).
   * Grid only (role of the datagrid widget)
   */
  previewContextMenu: command({
    params: { id: text({ agentWrite: false }), columnId: text(), row: row0() },
    run({ id, row }) {
      if (id !== 'forbidRun') throw new Error(`invalid id ${JSON.stringify(id)}; allowed: forbidRun`);
      return this.model.forbidRun({ row });
    },
  }),
  /**
   * The export button in the corner of the grid (role `exportAs`): the
   * preview with its head as a file, like the legacy grid (`data.csv` with
   * BOM and no message; `data.xlsx`, sheet `Data`, and `data.json` through
   * the core exporter, with a message). Changes nothing.
   * Grid only (role of the datagrid widget)
   */
  previewExport: command({
    params: { format: oneOf(['xlsx', 'csv', 'json'], { agentWrite: false }) },
    run({ format }) {
      const { table, columns } = this.previewTable;
      const ui = this._ui;
      if (format === 'csv') {
        downloadFile(gridCsv(columns, table, ui.i18n.getLanguage()), `${EXPORT_FILE_NAME}.csv`, 'text/csv;charset=utf-8');
        return;
      }
      void runExport({
        ...ui,
        exports: {
          fileName: EXPORT_FILE_NAME,
          tables: () => ({ [XLSX_SHEET_NAME]: gridRows(columns, table) }),
          tree: () => gridRecords(columns, table),
        },
      }, format);
    },
  }),
};

/**
 * D.Mike — DoE Planner: view part "runs" (viewmodel/runs.js)
 *
 * The run table and the datasheet of the plan. Without a current datasheet
 * the preview shows the design in the datagrid widget: a changed cell or a
 * pasted block goes out as `setPreviewCell` / `setPreviewCells`, the row
 * menu of an optimal design as `forbidRun`. Once a datasheet is bound its
 * fill state comes from the sheet through `ctx.data`; a response column
 * that is gone from the sheet shows a note instead of numbers. The buttons
 * start the runs (create, hand over, extend) and open the sheet or the new
 * regression afterwards.
 */
import { formatNumber } from '../../../core/number-format.js';
import { buildRunTable, editsDirty, previewColumns } from '../domain/runtable.js';
import { actualRows, isOptimal } from '../domain/design.js';

/**
 * The input of the datagrid widget.
 * @typedef {object} PreviewGrid
 * @property {Array<{ key: string, name: string, type: string, lock: 'hard'|'soft'|null,
 *   format: { decimals: number|null }|null, reason: string|null, unit: string|null }>} columns
 * @property {Array<Array<string|null>>} rows cell texts, one row per run in design order
 * @property {boolean} readOnly while a new design is pending
 * @property {Array<{ id: string, labelKey: string }>} contextMenu
 */

/** @type {PreviewGrid} */
const EMPTY_GRID = { columns: [], rows: [], readOnly: true, contextMenu: [] };

/** @param {any} v @returns {string|null} a cell as text; empty → null */
const cellText = (v) => (v === null || v === undefined || v === '' ? null : String(v));

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

/** @type {import('./state.types.js').DoePlannerViewFn} */
export const runsView = (ctx) => ({
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

  /** @returns {PreviewGrid} the widget input; empty while it cannot be built */
  get previewConfig() {
    const g = this.previewGrid;
    return g && !(/** @type {any} */ (g).error) ? g : EMPTY_GRID;
  },

  computed: {
    /**
     * The preview as the datagrid widget takes it: locked order columns,
     * the factors (categorical ones locked), the responses with seeds and
     * edits. Read only while a new design is pending.
     * @returns {PreviewGrid|null}
     */
    previewGrid() {
      const m = this.model;
      if (!m.design || !m.design.actualMatrix.length) return null;
      const cols = /** @type {any[]} */ (buildRunTable(tableView(m), (/** @type {string} */ key) => this.t(key)));
      const keys = previewColumns(m);
      const n = m.design.actualMatrix.length;
      return {
        columns: cols.map((c, i) => ({
          key: keys[i],
          name: c.name,
          type: c.type,
          lock: c.meta ? c.meta.lock : null,
          format: c.format ? { decimals: c.format.decimals ?? null } : null,
          reason: c.meta ? c.meta.reason : null,
          unit: c.unit || null,
        })),
        rows: Array.from({ length: n }, (_, r) => cols.map((c) => cellText(c.values[r]))),
        readOnly: Boolean(this.pending),
        contextMenu: isOptimal(m) ? [{ id: 'forbidRun', labelKey: 'forbiddenContextAction' }] : [],
      };
    },
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
});

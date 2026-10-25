/**
 * D.Mike — DoE planner runs (viewmodel/runs.js)
 *
 * Sub-viewmodel of the run table: the embedded preview grid (the module's
 * only imperative widget), the linked datasheet and its fill state, and
 * the agent's way into the preview. Matrix, preview edits and source
 * seeds meet in the pure doe-planner-runtable.js (spec E4); this class
 * holds only the grid object. Once a datasheet is bound, its values live
 * there: setRunValue refers to worksheet.setCells (spec E6).
 *
 * Spec: docs/superpowers/specs/2026-10-25-doe-planner-teil-viewmodels-design.md
 */
import { DataGrid } from '../../../core/datagrid/datagrid.js';
import { uid } from '../../../core/uid.js';
import {
  createDesignWorksheet, createExperimentRecord, removeExperimentRecord,
} from '../doe-planner-worksheet.js';
import {
  buildRunTable, captureEdits, applyEdits, runRows, columnNames, resolveColumn, withEdit,
} from '../doe-planner-runtable.js';
import {
  readResponses, staleness as stalenessOf, boundPct as boundPctOf, boundComplete as boundCompleteOf,
} from '../doe-planner-responses.js';
import { requireEnum, requireKnownId, requireNumber } from '../../../core/agent/agent-argcheck.js';

export class RunsViewModel {
  /**
   * Gets only what exists before the mount; the model comes with attach().
   * @param {{t: function(string, object=): string, context: object, container: function(): ?Element}} deps
   */
  constructor({ t, context, container }) {
    this._t = t;
    this._context = context;
    this._container = container;
    /** @type {?object} the component's State, set by attach() */
    this.model = null;
    this._save = () => {};
    this._rev = () => 0;
    this._nextTick = () => {};
    /** @type {?object} the embedded DataGrid */
    this._previewGrid = null;
  }

  /**
   * Binds the model; remounts the grid whenever the preview's identity
   * changes, and mounts it for the restored state after first paint.
   * @noagent lifecycle
   * @param {{model: object, save: function(): void, watch: function, nextTick: function, rev: function(): number}} binding
   */
  attach({ model, save, watch, nextTick, rev }) {
    this.model = model;
    this._save = save;
    this._rev = rev;
    this._nextTick = nextTick;
    watch(() => this._previewSignal(), () => nextTick(() => this.mountPreviewGrid()));
    nextTick(() => this.mountPreviewGrid());
  }

  /**
   * Disposes the grid.
   * @noagent lifecycle
   */
  detach() {
    this.destroyPreviewGrid();
    this._save = () => {};
    this._nextTick = () => {};
  }

  // ── Linked datasheet ──────────────────────────────────────

  /** @noagent view transform @returns {'unbound'|'bound'|'stale'} */
  staleness() { void this._rev(); return stalenessOf(this._context, this.model); }

  /** @noagent view transform @returns {number} */
  boundPct() { void this._rev(); return boundPctOf(this._context, this.model); }

  /** @noagent view transform @returns {string} */
  boundProgressText() {
    void this._rev();
    const resp = readResponses(this._context, this.model);
    if (!resp) return '';
    return `${resp.filledCount} / ${resp.totalCount} ${this._t('valuesFilled')} (${this.boundPct()}%)`;
  }

  /** @noagent view transform @returns {boolean} */
  boundComplete() { void this._rev(); return boundCompleteOf(this._context, this.model); }

  /** @noagent view transform @returns {boolean} the preview grid shows (no bound, current datasheet) */
  showPreview() {
    return this.staleness() !== 'bound'
      && Boolean(this.model.design && this.model.design.actualMatrix && this.model.design.actualMatrix.length);
  }

  /** Deletes a datasheet the planner created, with its experiment record. */
  _removeOldWorksheet(ref) {
    if (!ref) return;
    const ctx = this._context;
    if (ref.experimentId) removeExperimentRecord(ctx, ref.experimentId);
    const sm = ctx.stateManager;
    const phases = sm.get('phases') || {};
    for (const phaseId of Object.keys(phases)) {
      const arr = sm.get(`phases.${phaseId}`) || [];
      const next = arr.filter((i) => i.instanceId !== ref.instanceId);
      if (next.length !== arr.length) sm.set(`phases.${phaseId}`, next);
    }
    sm.removeModuleState(ref.instanceId);
    ctx.eventBus.emit('module:removed', { moduleId: 'worksheet', instanceId: ref.instanceId });
  }

  /**
   * Create the datasheet of the design, with the preview's values; a
   * datasheet created before is replaced. The planner opens it.
   * @agent
   * @returns {string} the instance id of the new datasheet (a worksheet)
   * @throws {Error} if there is no design yet
   */
  createDatasheet() {
    const m = this.model;
    const ctx = this._context;
    if (!m.design) throw new Error('no design yet: configure factors, responses and a design type first');
    if (this._previewGrid) this.capturePreviewEdits();
    applyEdits(m);
    if (m.worksheetRef) { this._removeOldWorksheet(m.worksheetRef); m.worksheetRef = null; }
    const expId = uid();
    const ref = createDesignWorksheet(ctx, m.design, m.factors, m.responses, m.doeName, 'improve', expId);
    createExperimentRecord(ctx, expId, m.design, m.factors, m.responses, m.doeName, ref, m.modelTerms());
    ref.designSignature = m.designSignature();
    m.worksheetRef = ref;
    m.previewEdits = null;
    m.previewDirty = false;
    this._save();
    ctx.eventBus.emit('module:activated', { instanceId: ref.instanceId });
    return ref.instanceId;
  }

  /** @noagent navigation — opens the linked datasheet */
  openLinkedWorksheet() {
    const ref = this.model.worksheetRef;
    if (ref && ref.instanceId) this._context.eventBus.emit('module:activated', { instanceId: ref.instanceId });
  }

  // ── Agent access to the preview ───────────────────────────

  /**
   * Set one value of the run table before a datasheet exists (or while it
   * is outdated): a response result or an adjusted continuous factor
   * setting. The preview grid follows; the value goes into the datasheet
   * when it is created.
   * @agent
   * @param {number} run the run number (run order) from read().runs
   * @param {string} column a factor or response name as in read().runs
   * @param {?number} value the value; null reverts the cell
   * @returns {void}
   * @throws {Error} if there is no design, the datasheet is bound (then write it with worksheet.setCells), or run, column or value are invalid
   */
  setRunValue(run, column, value) {
    const m = this.model;
    if (!m.design || !m.design.actualMatrix || !m.design.actualMatrix.length) {
      throw new Error('no design yet: configure factors, responses and a design type first');
    }
    if (this.staleness() === 'bound') {
      throw new Error(`the run table lives in the linked datasheet now: write it with worksheet.setCells on instance ${m.worksheetRef.instanceId} (read().worksheet.instanceId)`);
    }
    const rows = runRows(m);
    const runs = rows.map((r) => r.run);
    requireKnownId('run', run, runs);
    const names = columnNames(m);
    requireEnum('column', column, [...names.factors, ...names.responses]);
    const col = resolveColumn(m, column);
    if (col.kind === 'factor' && m.factors[col.index].kind === 'categorical') {
      throw new Error(`column ${column} is a categorical factor; its levels come from the design`);
    }
    const v = value === null ? null : requireNumber('value', value);
    const { edits, dirty } = withEdit(m, runs.indexOf(run), col, v);
    m.previewEdits = edits;
    m.previewDirty = dirty;
    this._save();
    this._nextTick(() => this.mountPreviewGrid());
  }

  // ── Preview grid (imperative widget) ──────────────────────

  /** @returns {string} cheap identity of the preview; a change remounts the grid */
  _previewSignal() {
    const m = this.model;
    if (!this.showPreview()) return '';
    const d = m.design;
    return d && d.actualMatrix ? `${d.designType}:${d.actualMatrix.length}:${m.factors.length}:${m.responses.length}` : '';
  }

  /** @noagent widget lifecycle — (re)mounts the preview grid into its anchor */
  mountPreviewGrid() {
    this.destroyPreviewGrid();
    const root = this._container();
    if (!root) return;
    const slot = root.querySelector('[data-ref="preview-grid"]');
    if (!slot) return;
    const m = this.model;
    if (!m.design || !m.design.actualMatrix || !m.design.actualMatrix.length) return;
    const cols = buildRunTable(m, this._t);
    if (!cols.length) return;
    const ctx = this._context;
    this._previewGrid = new DataGrid(slot, {
      toast: ctx.notify || (() => {}),
      t: (key) => ctx.i18n.t(key),
      dialog: ctx.dialog,
      extraRowMenuItems: m.isOptimalType()
        ? (cell) => [{ label: this._t('forbiddenContextAction'), action: () => this._forbidRow(cell.rowIdx) }]
        : undefined,
    });
    this._previewGrid.setData(cols);
    this._previewGrid.on('cell:changed', () => this.capturePreviewEdits());
    this._previewGrid.on('data:pasted', () => this.capturePreviewEdits());
  }

  /** @noagent widget lifecycle */
  destroyPreviewGrid() {
    if (this._previewGrid) {
      if (this._previewGrid.destroy) this._previewGrid.destroy();
      this._previewGrid = null;
    }
  }

  /** @noagent widget sync — reads the grid's edits into the model */
  capturePreviewEdits() {
    if (!this._previewGrid) return;
    const captured = captureEdits(this.model, this._previewGrid.getData());
    if (!captured) return;
    this.model.previewEdits = captured.edits;
    this.model.previewDirty = captured.dirty;
    this._save();
  }

  /** Context-menu action of an optimal design: forbid the row's coded combination. */
  _forbidRow(rowIdx) {
    const coded = this.model.design && this.model.design.codedMatrix ? this.model.design.codedMatrix[rowIdx] : null;
    if (!Array.isArray(coded)) return;
    if (this.model.addForbiddenVertex([...coded])) this._save();
  }
}

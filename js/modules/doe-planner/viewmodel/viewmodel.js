/**
 * D.Mike — DoE Planner: viewmodel (viewmodel/viewmodel.js)
 *
 * The runs of the planner:
 * - `generate` (auto) makes the design current: after a short, abortable
 *   pause it calls `regenerate` — only while the design does not belong to
 *   the configuration (`pending`), so mounting a stored plan or switching
 *   the language changes nothing. An optimal design on a source worksheet
 *   gets the source rows read through `ctx.source`.
 * - `createDatasheet` writes the design as a new worksheet (a stale one is
 *   replaced in the same stack) and binds it with a snapshot.
 * - `augment` appends optimal runs to the bound datasheet; the grown
 *   design is built and evaluated before the stack goes out and written
 *   only after it went through.
 * - `transferToRegression` adds a regression in the planner's phase and
 *   hands it the experiment of the datasheet for one response (model
 *   command `importExperiment`; the button opens it).
 * - `syncResponses` (auto) carries a renamed, added or removed response
 *   into the bound, current datasheet and updates the snapshot; a change
 *   it cannot carry over is reported once.
 *   Like the design of `generate`, the updated binding belongs to the
 *   history step of the change that called for it.
 * Every write goes out as one stack over `ctx.instances.interact`; when it
 * fails the planner stays as it was and shows its own text, the cause goes
 * to the console. Opening the datasheet or the regression afterwards is up
 * to the button, not to the run.
 */
import { createModule } from '../../../core/template-module.js';
import { asyncTask } from '../../../core/async-task.js';
import { number, index, setFields } from '../../../core/model.js';
import { worksheetWrite, commitWorksheetWrite } from '../../../core/worksheet-write.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { isOptimal } from '../domain/design.js';
import { sourceData } from '../domain/source.js';
import { readSheet } from '../../../core/source-columns.js';
import { designColumns } from '../domain/columns.js';
import { snapshotOf, appendedRuns } from '../domain/experiment.js';
import { designSignature } from '../domain/signatures.js';
import { applyEdits, codedToActualRows } from '../domain/runtable.js';
import { augmentRows } from '../domain/generate.js';
import { augmentStack, responseSyncPlan, regressionHandoverStack } from '../domain/stacks.js';
import { UiState } from './state.js';
import { factorsView } from './factors.js';
import { designView } from './design.js';
import { optimalView } from './optimal.js';
import { evaluationView } from './evaluation.js';
import { analysisView } from './analysis.js';
import { evopView } from './evop.js';
import { runsView, previewCommands } from './runs.js';

/** Pause before a run reacts to a change (debounce of typing). */
const RERUN_DELAY = 600;
/** How long a writing run waits for the automatic runs to settle. */
const SETTLE_MS = 120000;

/**
 * Waits `ms`, or rejects when `signal` aborts.
 * @param {number} ms @param {AbortSignal} signal
 * @returns {Promise<void>}
 */
function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    function onAbort() { clearTimeout(timer); reject(signal.reason); }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** @param {any} v @returns {any} a plain deep copy */
const plain = (v) => (v === undefined || v === null ? v : JSON.parse(JSON.stringify(v)));

/**
 * The error a run ends with: the module's own text; the cause goes to the console.
 * @param {string} text translated message
 * @param {string} where name of the run
 * @param {unknown} cause
 * @returns {Error}
 */
function failure(text, where, cause) {
  console.warn(`[doe-planner] ${where} failed`, cause);
  return new Error(text, { cause });
}

/**
 * @param {Array<{ name: string, unit?: string|null }>} a
 * @param {Array<{ name: string, unit?: string|null }>} b
 * @returns {boolean} same responses (name and unit) in the same order
 */
const sameResponses = (a, b) => a.length === b.length
  && a.every((r, i) => r.name === b[i].name && (r.unit || '') === (b[i].unit || ''));

/**
 * The value at `path` (`value.0`) of a result.
 * @param {any} result @param {string} path
 * @returns {any}
 */
const at = (result, path) => path.split('.').reduce((v, key) => (v === null || v === undefined ? v : v[key]), result);

/**
 * Helper column ids for the binding: they run parallel to the responses
 * from the start, so the list ends before the first response without one.
 * @param {Array<string|null>} ids
 * @returns {string[]}
 */
function leadingIds(ids) {
  const cut = ids.indexOf(null);
  return /** @type {string[]} */ (cut === -1 ? ids : ids.slice(0, cut));
}

/**
 * The part of the viewmodel the runs use: worksheet reads through
 * `ctx.source` and the write of a new binding.
 * @type {import('./state.types.js').DoePlannerViewFn}
 */
const tasksView = (ctx) => {
  /** @type {string|null} the diverging state last reported as not carried over */
  let skipped = null;
  return {
    /**
     * Whether a response change that cannot be carried over is new; remembers it.
     * @param {string} key the diverging state
     * @returns {boolean} true the first time for this state
     */
    firstSkip(key) {
      if (skipped === key) return false;
      skipped = key;
      return true;
    },
    /**
     * The rows of the source worksheet of an optimal design, as `regenerate` takes them;
     * empty rows when the sheet is gone or has no usable row.
     * @returns {{ codedMatrix: number[][], actualRows: string[][], responseValues: Array<Array<number|null>>,
     *   rowCount: number, sheetRowCount: number }}
     */
    sourceInput() {
      const m = this.model;
      const ref = m.sourceWorksheet;
      const sd = sourceData(ctx.source, ref, m.factors, m.responses);
      const sheetRowCount = readSheet(ctx.source, ref)?.rowCount ?? 0;
      if (!sd.ok) {
        return { codedMatrix: [], actualRows: [], responseValues: m.responses.map(() => []), rowCount: 0, sheetRowCount };
      }
      return {
        codedMatrix: /** @type {number[][]} */ (sd.codedMatrix),
        actualRows: /** @type {any[][]} */ (sd.actualRows).map((row) => row.map((v) => String(v))),
        responseValues: /** @type {Array<Array<number|null>>} */ (sd.responseValues),
        rowCount: /** @type {number} */ (sd.rowCount),
        sheetRowCount,
      };
    },
    /**
     * A sheet with its columns and their meta, or null.
     * @param {{ instanceId: string, sheetId: string }|null} ref
     * @returns {any}
     */
    sheetOf(ref) { return ref ? readSheet(ctx.source, { instanceId: ref.instanceId, sheetId: ref.sheetId }) : null; },
    /**
     * The worksheet instance still exists. Asks the project, not the
     * worksheet reader: before the worksheet code is loaded every read is
     * null (`not_loaded`), and "not loaded" must not leave the old datasheet
     * beside a new one.
     * @param {string} instanceId @returns {boolean}
     */
    hasWorksheet(instanceId) {
      return (ctx.instances?.list({ modules: ['worksheet'] }) ?? []).some((i) => i.instanceId === instanceId);
    },
    /** Column names of a new datasheet, in the app language. */
    get columnNames() {
      return {
        runOrder: this.t('colRunOrder'),
        stdOrder: this.t('colStdOrder'),
        block: this.t('colBlock'),
        replicate: this.t('colReplicate'),
        factor: this.t('factor'),
        meanSuffix: this.t('colMeanSuffix'),
        lnVarSuffix: this.t('colLnVarSuffix'),
      };
    },
    /**
     * Writes plan fields of a new binding; in a project the active phase follows.
     * @param {object} values fields to write
     * @returns {void}
     */
    writeBinding(values) {
      setFields(this.model, values);
      const m = this.model;
      if (!m.projectMode || !m.projectPhases[m.activePhaseIdx]) return;
      const phases = plain(m.projectPhases);
      Object.assign(phases[m.activePhaseIdx], /** @type {any} */ (m).phaseState());
      setFields(this.model, { projectPhases: phases });
    },
    /**
     * Writes the binding as a follow-up of the change that called
     * for it (the automatic run `syncResponses`): with the module history it
     * belongs to that change's step, so one undo takes back both and the run
     * does not start anew.
     * @param {object} values fields to write
     * @returns {void}
     */
    amendBinding(values) {
      const run = () => { this.writeBinding(values); };
      if (ctx.history) ctx.history.amend(run);
      else run();
    },
  };
};

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  commands: previewCommands,
  asyncTasks: {
    generate: asyncTask({
      auto: true,
      async run(_args, { signal }) {
        // State before the first await: the configuration (through pending) and the source rows.
        const pending = this.pending;
        const withSource = isOptimal(this.model) && Boolean(this.model.sourceWorksheet);
        if (!pending) return null;
        const source = withSource ? this.sourceInput() : null;
        await pause(RERUN_DELAY, signal);
        signal.throwIfAborted();
        try {
          this.applyGenerated(source);
        } catch (err) {
          this._ui.notify(this.t('generateFailed'), 'error');
          throw failure(this.t('generateFailed'), 'generate', err);
        }
        return null;
      },
    }),
    createDatasheet: asyncTask({
      blocked() { return this.valid ? null : this.t('noEvaluation'); },
      async run(_args, { signal }) {
        // First let a pending design be made: a change just before must not write the old design.
        if (!(await this._asyncTaskHost.settle(SETTLE_MS))) throw new Error(this.t('noEvaluation'));
        signal.throwIfAborted();
        const m = this.model;
        if (!m.design || this.pending) throw new Error(this.t('noEvaluation'));
        const old = m.worksheetRef && this.hasWorksheet(m.worksheetRef.instanceId) ? m.worksheetRef.instanceId : null;
        const design = applyEdits(plain(m.design), m.previewEdits, m.factors, m.responses.length);
        const factors = plain(m.factors);
        const responses = plain(m.responses);
        const { columns, ids } = designColumns(design, factors, responses, {
          names: this.columnNames, managedRef: `doe:${this._ui.instanceId}`,
        });
        let write = worksheetWrite().newWorksheet({ name: m.doeName ? `DoE: ${m.doeName}` : `DoE ${new Date().toLocaleDateString()}`, fitRows: true });
        for (const c of columns) {
          /** @type {any} */
          const input = { name: c.name, type: c.type, unit: c.unit, values: c.values, formulas: c.formulas, role: c.role };
          if (c.format) input.format = c.format;
          if (c.meta) input.meta = c.meta;
          write = write.column(input);
        }
        if (old) write = write.replace(old);
        let res;
        try {
          res = await commitWorksheetWrite(this._ui.services, write.build());
        } catch (err) {
          throw failure(this.t('datasheetFailed'), 'createDatasheet', err);
        }
        // Written: the binding is recorded even if the run was cancelled meanwhile.
        const idAt = (/** @type {number} */ i) => res.columnIds[i];
        const stored = { ...design, actualMatrix: design.actualMatrix.map((row) => row.map((v) => String(v))) };
        this.writeBinding({
          design: stored,
          previewEdits: null,
          worksheetRef: {
            instanceId: res.instanceId,
            sheetId: res.sheetId,
            factorColumnIds: ids.factors.map(idAt),
            responseColumnIds: ids.responses.map(idAt),
            meanColumnIds: ids.means.map(idAt),
            lnVarColumnIds: ids.lnVars.map(idAt),
            runOrderColumnId: idAt(ids.runOrder),
            stdOrderColumnId: idAt(ids.stdOrder),
            designSignature: designSignature({ design: stored, factors }),
            snapshot: snapshotOf({ doeName: m.doeName, designType: m.designType, factors, responses, options: plain(m.options) }, stored),
          },
        });
        return { instanceId: res.instanceId, sheetId: res.sheetId };
      },
    }),
    augment: asyncTask({
      params: { runs: number({ integer: true, min: 1 }) },
      blocked() {
        if (!isOptimal(this.model)) return this.t('needsOptimal');
        if (this.staleness === 'none') return this.t('needsDatasheet');
        if (this.staleness !== 'bound') return this.t('needsCurrentDatasheet');
        return null;
      },
      async run({ runs }, { signal }) {
        // First let pending runs end: a response just renamed must not be written back over the new runs.
        if (!(await this._asyncTaskHost.settle(SETTLE_MS))) throw new Error(this.t('augmentFailed'));
        signal.throwIfAborted();
        if (this.staleness !== 'bound') throw new Error(this.t('needsCurrentDatasheet'));
        const m = this.model;
        const ref = plain(m.worksheetRef);
        const sheet = this.sheetOf(ref);
        // A tagged column the user removed: the new runs would lose their settings there.
        const present = new Set((sheet?.columns ?? []).map((/** @type {any} */ c) => c.id));
        const tagged = [ref.runOrderColumnId, ref.stdOrderColumnId, ...ref.factorColumnIds];
        if (!sheet || !tagged.every((id) => present.has(id))) {
          throw failure(this.t('augmentFailed'), 'augment', new Error('a tagged column of the datasheet is missing'));
        }
        // The grown design is made and evaluated before anything is sent: after a written stack nothing may fail.
        let rows;
        let grown;
        try {
          rows = augmentRows(m, runs);
          grown = appendedRuns(m, rows);
          /** @type {any} */ (m).evaluateFor(grown.design);
        } catch (err) {
          throw failure(this.t('augmentFailed'), 'augment', err);
        }
        const stack = augmentStack(ref, sheet.columns, codedToActualRows(rows, m.factors), sheet.rowCount);
        let res;
        try {
          res = await this._ui.services.instances.interact(stack);
        } catch (err) {
          throw failure(this.t('augmentFailed'), 'augment', err);
        }
        if (res?.ok !== true) throw failure(this.t('augmentFailed'), 'augment', res);
        // Into the current binding: only what the new runs change.
        const current = plain(this.model.worksheetRef) ?? grown.worksheetRef;
        this.writeBinding({
          design: grown.design,
          worksheetRef: {
            ...current,
            designSignature: grown.worksheetRef.designSignature,
            snapshot: current.snapshot
              ? { ...current.snapshot, replicateGroups: grown.worksheetRef.snapshot?.replicateGroups ?? current.snapshot.replicateGroups }
              : null,
          },
        });
        this._ui.notify(this.t('augmentSuccess', { n: runs }), 'success');
        return { added: runs };
      },
    }),
    transferToRegression: asyncTask({
      params: { response: index('responses', { existing: true }) },
      blocked() { return this.experiment ? null : this.t('needsDatasheet'); },
      async run({ response }) {
        const services = this._ui.services;
        const plannerId = this._ui.instanceId;
        const phase = services.instances.list({ modules: ['doe-planner'] }).find((i) => i.instanceId === plannerId)?.phase;
        if (!phase) throw failure(this.t('transferFailed'), 'transferToRegression', new Error('the planner is in no phase'));
        // The datasheet may predate later changes to the responses (stale
        // sheet, no sync): the response is matched by name, not by position.
        const cols = this.experiment?.responseColumns ?? [];
        const wanted = plain(this.model.responses)?.[response];
        const wantedName = wanted ? (wanted.name || `Y${response + 1}`) : null;
        const hits = wantedName == null ? [] : cols.reduce((acc, c, i) => (c.name === wantedName ? [...acc, i] : acc), []);
        if (hits.length !== 1) {
          throw failure(this.t('transferResponseMissing'), 'transferToRegression', new Error(`response ${response} is not (uniquely) in the datasheet`));
        }
        // Everything the stack needs is read before the first await.
        /** @type {any} */
        const stack = regressionHandoverStack({ plannerId, phase, experiment: plain(this.experiment), response: hits[0] });
        const notify = this._ui.notify;
        const doneText = this.t('transferSuccess');
        const failText = this.t('transferFailed');
        let res;
        try {
          res = await services.instances.interact(stack);
        } catch (err) {
          throw failure(failText, 'transferToRegression', err);
        }
        if (res?.ok !== true) throw failure(failText, 'transferToRegression', res);
        notify(doneText, 'success');
        return { instanceId: res.results?.[0]?.result?.instanceId ?? null };
      },
    }),
    syncResponses: asyncTask({
      auto: true,
      async run(_args, { signal }) {
        // State before the first await: the binding, its state and the responses.
        const staleness = this.staleness;
        const ref = plain(this.model.worksheetRef);
        const after = plain(this.model.responses);
        if (staleness !== 'bound' || !ref?.snapshot) return null;
        const before = ref.snapshot.responses;
        if (sameResponses(before, after)) return null;
        const sheet = this.sheetOf(ref);
        await pause(RERUN_DELAY, signal);
        signal.throwIfAborted();
        if (!sheet) return null;
        const names = this.columnNames;
        const plan = responseSyncPlan(ref, before, after, {
          columns: sheet.columns, names: { meanSuffix: names.meanSuffix, lnVarSuffix: names.lnVarSuffix },
        });
        // Several changes at once or two equal responses: the sheet and its snapshot stay; said once.
        if (!plan) {
          if (this.firstSkip(JSON.stringify([ref.instanceId, ref.sheetId, before, after]))) {
            this._ui.notify(this.t('syncSkipped'), 'warning');
          }
          return null;
        }
        /** @type {Map<string, any>} */
        const written = new Map();
        if (plan.stack.length) {
          let res;
          try {
            res = await this._ui.services.instances.interact(/** @type {any} */ (plan.stack));
          } catch (err) {
            this._ui.notify(this.t('syncFailed'), 'error');
            throw failure(this.t('syncFailed'), 'syncResponses', err);
          }
          if (res?.ok !== true) {
            this._ui.notify(this.t('syncFailed'), 'error');
            throw failure(this.t('syncFailed'), 'syncResponses', res);
          }
          for (const r of res.results ?? []) if (r.id) written.set(r.id, r.result);
        }
        // Into the current binding: only the response columns and the responses of the snapshot.
        const current = plain(this.model.worksheetRef);
        if (!current || current.instanceId !== ref.instanceId || current.sheetId !== ref.sheetId) return null;
        const idOf = (/** @type {any} */ x) => (typeof x === 'string' ? x : at(written.get(x.$from), x.path));
        this.amendBinding({
          worksheetRef: {
            ...current,
            responseColumnIds: plan.responseColumnIds.map(idOf),
            meanColumnIds: leadingIds(plan.meanColumnIds),
            lnVarColumnIds: leadingIds(plan.lnVarColumnIds),
            snapshot: current.snapshot
              ? { ...current.snapshot, responses: after.map((r) => ({ name: r.name, unit: r.unit ?? null })) }
              : null,
          },
        });
        return null;
      },
    }),
  },
  view: [tasksView, factorsView, designView, optimalView, evaluationView, analysisView, evopView, runsView],
});

/**
 * D.Mike — ZEG sheet wiring (core/zeg-sheet/zeg-sheet.js)
 *
 * Keeps an editable worksheet in the `data` phase in two-way sync with
 * `phaseAchievementHistory`. The history stays the source of truth; the
 * sheet is found by its column metas (`managedBy: 'zeg'`), never by name.
 */

import { getPhaseIds } from '../cycles/cycles.js';
import { readWorksheet } from '../worksheet-columns.js';
import { uniqueSheetName } from '../worksheet-sheets.js';
import {
  isZegColumn, historyToRows, rowsToHistory, readRows, buildSheetState, planZegStack,
} from './zeg-sheet-model.js';

const SOURCE = 'zeg-sheet';

/**
 * Id of the first sheet of a fresh worksheet: its model starts with
 * `sheetCounter` 0 and `addSheet` names the first sheet `sheet_1`.
 */
const FIRST_SHEET = 'sheet_1';

/** Own stacks in flight, per stateManager: the sheet is mid-write then. */
const writing = new WeakMap();

/** A running `ensureZegSheet`, per stateManager: a second call joins it. */
const ensuring = new WeakMap();

/**
 * @typedef {object} ZegCtx
 * @property {object} stateManager
 * @property {object} eventBus
 * @property {object} i18n
 * @property {(stack: object[]) => Promise<object>} interact  sends a stack to
 *   the agent surface as the kernel (`workspace.interactAsKernel(s, 'zeg-sheet')`)
 */

/**
 * Locate the ZEG sheet: first worksheet sheet holding a ZEG column. Reads
 * the column heads through the worksheet facade (`readWorksheet`); a
 * worksheet the facade cannot read yet (module not loaded) is skipped.
 * @param {object} stateManager
 * @returns {{instanceId: string, sheetId: string}|null}
 */
export function findZegSheet(stateManager) {
  for (const { instanceId } of stateManager.listInstances('worksheet')) {
    const book = readWorksheet(stateManager, instanceId);
    for (const { id } of book?.sheets ?? []) {
      const sheet = id === book.sheetId ? book : readWorksheet(stateManager, instanceId, { sheetId: id });
      if (sheet?.columns?.some(isZegColumn)) return { instanceId, sheetId: id };
    }
  }
  return null;
}

/**
 * The ZEG sheet as `{ columns, rowCount }` with per-column `values` and
 * `formulas` arrays — the shape `readRows`, `buildSheetState` and
 * `planZegStack` read. `read()` lists formulas per sheet; they are spread
 * back onto their columns here, else a rewrite would drop them.
 * @param {object} stateManager
 * @param {{instanceId: string, sheetId: string}} ref
 * @returns {{columns: object[], rowCount: number}|null} null if unreadable
 */
function readSheet(stateManager, { instanceId, sheetId }) {
  const head = readWorksheet(stateManager, instanceId, { sheetId });
  if (!head) return null;
  const read = readWorksheet(stateManager, instanceId, {
    sheetId, columns: head.columns.map(c => c.id), fields: ['formulas'],
  });
  if (!read) return null;
  const n = read.rowCount;
  const formulas = new Map(read.columns.map(c => [c.id, new Array(n).fill(null)]));
  for (const f of Array.isArray(read.formulas) ? read.formulas : []) {
    const col = formulas.get(f.columnId);
    if (col && f.row < n) col[f.row] = f.formula;
  }
  return { rowCount: n, columns: read.columns.map(c => ({ ...c, formulas: formulas.get(c.id) })) };
}

/**
 * Send one stack through `ctx.interact`. While it runs, the sheet is
 * mid-write: `syncSheetToHistory` ignores it (the target state reads back
 * to the history anyway).
 * @param {ZegCtx} ctx
 * @param {object[]} stack
 * @returns {Promise<object>} the surface's answer
 * @throws {Error} if the surface refused or rolled back the stack
 */
async function send(ctx, stack) {
  const sm = ctx.stateManager;
  writing.set(sm, (writing.get(sm) ?? 0) + 1);
  try {
    const out = await ctx.interact(stack);
    if (out?.ok !== true) {
      const failed = out?.results?.find(r => r?.ok === false) ?? out;
      throw new Error(`zeg-sheet: stack failed (${failed?.error ?? 'unknown'}: ${failed?.message ?? ''})`);
    }
    return out;
  } finally {
    writing.set(sm, writing.get(sm) - 1);
  }
}

/** Methodology phases of the active cycle. */
function phaseIdsOf(stateManager) {
  return getPhaseIds(stateManager.getProjectCycle());
}

/** Column labels for the current language. */
function labelsOf(i18n, phaseIds) {
  return {
    date: i18n.t('dashboard.zegSheet.date'),
    phases: Object.fromEntries(phaseIds.map(p => [p, i18n.t(`phases.${p}`)])),
  };
}

/**
 * Rebuild the managed columns of the ZEG sheet from the history. Sends the
 * difference as one stack (`planZegStack`) through `ctx.interact`; a sheet
 * that already shows the history gets no stack and no undo step.
 * Never await this inside a running agent op: kernel stacks queue behind it.
 * @param {ZegCtx} ctx
 * @param {{instanceId: string, sheetId: string}|null} [ref]
 * @returns {Promise<boolean>} false when there is no readable ZEG sheet or
 *   the project is read-only
 */
export async function writeHistoryToSheet(ctx, ref = findZegSheet(ctx.stateManager)) {
  const { stateManager, i18n } = ctx;
  if (!ref || stateManager.isCompleted()) return false;
  const prev = readSheet(stateManager, ref);
  if (!prev) return false;
  const phaseIds = phaseIdsOf(stateManager);
  const rows = historyToRows(stateManager.get('phaseAchievementHistory') || {}, phaseIds);
  const next = buildSheetState(prev, rows, phaseIds, labelsOf(i18n, phaseIds));
  const stack = planZegStack(ref.instanceId, ref.sheetId, prev, next);
  if (stack.length) await send(ctx, stack);
  return true;
}

/**
 * Write the ZEG sheet of `instanceId` back into the history. Idempotent: a
 * sheet built from the history reads back to the same history. Reads through
 * the worksheet facade; never sends a stack.
 * @param {{stateManager: object, eventBus: object}} ctx
 * @param {string} instanceId
 * @returns {string[]} phases whose history changed
 */
export function syncSheetToHistory({ stateManager, eventBus }, instanceId) {
  if (stateManager.isCompleted()) return [];
  if (writing.get(stateManager)) return [];
  const ref = findZegSheet(stateManager);
  if (!ref || ref.instanceId !== instanceId) return [];
  const sheet = readSheet(stateManager, ref);
  if (!sheet) return [];
  const phaseIds = phaseIdsOf(stateManager);
  const { rows, presentPhases } = readRows(sheet);
  const old = stateManager.get('phaseAchievementHistory') || {};
  const next = rowsToHistory(rows, phaseIds, old, presentPhases);
  const changed = phaseIds.filter(p => JSON.stringify(old[p] || []) !== JSON.stringify(next[p] || []));
  if (!changed.length) return [];
  stateManager.set('phaseAchievementHistory', next);
  for (const phase of changed) {
    const entries = next[phase] || [];
    const value = entries.length ? entries[entries.length - 1].v : 0;
    stateManager.set(`phaseAchievement.${phase}`, value);
    eventBus.emit('phase:achievement-changed', { phase, value, source: SOURCE });
  }
  return changed;
}

/**
 * Find the ZEG sheet; a worksheet the facade cannot read yet (its code not
 * loaded) is read once through the surface, which loads it, then searched
 * again — else a not-yet-loaded ZEG sheet would be created a second time.
 * @param {ZegCtx} ctx
 * @returns {Promise<{instanceId: string, sheetId: string}|null>}
 */
async function locateZegSheet(ctx) {
  const { stateManager } = ctx;
  const ref = findZegSheet(stateManager);
  if (ref) return ref;
  const unread = stateManager.listInstances('worksheet')
    .map(i => i.instanceId)
    .filter(id => readWorksheet(stateManager, id) === null);
  if (!unread.length) return null;
  await send(ctx, unread.map(id => ({
    op: 'instance.call', instance: id, module: 'worksheet', method: 'read', args: [],
  })));
  return findZegSheet(stateManager);
}

/**
 * Create the ZEG sheet as a worksheet in the `data` phase. Stack 1 adds the
 * worksheet, renames its first sheet and reads its start columns; stack 2
 * writes the history and drops the start columns (`planZegStack` with the
 * start columns as `prev`).
 * @param {ZegCtx} ctx
 * @returns {Promise<{instanceId: string, sheetId: string}>}
 */
async function createZegSheet(ctx) {
  const { stateManager, i18n } = ctx;
  if (stateManager.isCompleted()) throw new Error('zeg-sheet: project is read-only');
  const name = uniqueSheetName(stateManager, i18n.t('dashboard.zegSheet.name'));
  const instance = { $from: 'ws', path: 'instanceId' };
  const call = (method, args, id) => ({
    op: 'instance.call', ...(id ? { id } : {}), instance, module: 'worksheet', method, args,
  });
  const out = await send(ctx, [
    { op: 'module.add', id: 'ws', module: 'worksheet', phase: 'data' },
    call('renameSheet', [FIRST_SHEET, name]),
    call('read', [{ sheetId: FIRST_SHEET }], 'start'),
  ]);
  const instanceId = out.results[0].result.instanceId;
  const start = out.results[2].result.value;
  const phaseIds = phaseIdsOf(stateManager);
  const rows = historyToRows(stateManager.get('phaseAchievementHistory') || {}, phaseIds);
  const next = buildSheetState(null, rows, phaseIds, labelsOf(i18n, phaseIds));
  await send(ctx, planZegStack(instanceId, FIRST_SHEET, { columns: start.columns, rowCount: start.rowCount }, next));
  // The module tab carries the sheet name, as the sheet tab does.
  const items = stateManager.get('phases.data') ?? [];
  if (items.some(it => it.instanceId === instanceId)) {
    stateManager.set('phases.data', items.map(it => (it.instanceId === instanceId ? { ...it, customName: name } : it)));
  }
  return { instanceId, sheetId: FIRST_SHEET };
}

/**
 * Find the ZEG sheet or create it as a worksheet in the `data` phase, then
 * (re)write it from the history (adds missing phase columns). A call while
 * another one runs joins it.
 * Never await this inside a running agent op: kernel stacks queue behind it.
 * @param {ZegCtx} ctx
 * @returns {Promise<{instanceId: string, sheetId: string}>}
 * @throws {Error} in a read-only project without ZEG sheet, or if a stack fails
 */
export function ensureZegSheet(ctx) {
  const sm = ctx.stateManager;
  if (!ensuring.has(sm)) {
    const run = (async () => {
      const ref = await locateZegSheet(ctx);
      if (!ref) return createZegSheet(ctx);
      await writeHistoryToSheet(ctx, ref);
      return ref;
    })();
    ensuring.set(sm, run.finally(() => ensuring.delete(sm)));
  }
  return ensuring.get(sm);
}

/**
 * Install the two-way sync. Runs for the whole app lifetime, also while the
 * dashboard is closed.
 * @param {ZegCtx} ctx
 * @returns {() => void} uninstall
 */
export function installZegSheetSync(ctx) {
  const { eventBus } = ctx;
  // Detached: a handler can run inside an agent op (cycle switch, …); the
  // kernel stack queues behind it, so awaiting it there would deadlock.
  const write = () => {
    writeHistoryToSheet(ctx).catch(err => console.warn('[zeg-sheet] writing the history to the sheet failed', err));
  };
  const onSheet = ({ instanceId } = {}) => { syncSheetToHistory(ctx, instanceId); };
  const onAchievement = ({ source } = {}) => { if (source !== SOURCE) write(); };
  const onCycle = () => { write(); };
  eventBus.on('worksheet:dataChanged', onSheet);
  eventBus.on('phase:achievement-changed', onAchievement);
  eventBus.on('cycle:changed', onCycle);
  return () => {
    eventBus.off('worksheet:dataChanged', onSheet);
    eventBus.off('phase:achievement-changed', onAchievement);
    eventBus.off('cycle:changed', onCycle);
  };
}

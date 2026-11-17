/**
 * D.Mike — ZEG sheet wiring (core/zeg-sheet/zeg-sheet.js)
 *
 * Keeps an editable worksheet in the `data` phase in two-way sync with
 * `phaseAchievementHistory`. The history stays the source of truth; the
 * sheet is found by its column metas (`managedBy: 'zeg'`), never by name.
 *
 * Reads go through the worksheet facade (`readWorksheet`). Writes go only
 * through the agent surface as a kernel service
 * (`workspace.interactAsKernel`, stack from `planZegStack`): the worksheet's
 * model commands run without mounting it, so a pencil edit never switches
 * the view into the data phase (F1.14d).
 */

import { getPhaseIds } from '../cycles/cycles.js';
import { readWorksheet } from '../worksheet-columns.js';
import { worksheetWrite, completeStack, loadUnreadableWorksheets } from '../worksheet-write.js';
import {
  isZegColumn, rowsToHistory, readRows, historyToRows, buildSheetState, planZegStack,
} from './zeg-sheet-model.js';

const SOURCE = 'zeg-sheet';

/**
 * @typedef {{
 *   stateManager: object,
 *   eventBus: object,
 *   i18n: object,
 *   workspace: { interactAsKernel: (stack: object[], source: string) => Promise<any> },
 *   instances: { list: Function, read: Function },
 * }} ZegCtx
 */

/**
 * Methodology phases of the active cycle.
 * @param {object} stateManager
 * @returns {string[]}
 */
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

/** The history as sheet rows of the active cycle. */
function historyRows(stateManager, phaseIds) {
  return historyToRows(stateManager.get('phaseAchievementHistory') || {}, phaseIds);
}

/** Writes in flight, per stateManager: one after the other, each planned on the sheet it finds. */
const queues = new WeakMap();

/**
 * Run `fn` after every earlier ZEG write of this project store. Two writes
 * planned on the same sheet state would otherwise append a new column twice.
 * @template T
 * @param {object} stateManager
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function serial(stateManager, fn) {
  const prev = queues.get(stateManager) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  queues.set(stateManager, run.catch(() => {}));
  return run;
}

/**
 * Locate the ZEG sheet: first worksheet sheet holding a ZEG column. Reads
 * the column heads through the worksheet facade (`readWorksheet`); a
 * worksheet the facade cannot read yet (module not loaded) is skipped —
 * writers use `locateZegSheet`, which loads the code first.
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
 * `findZegSheet` after loading the worksheet code, so an existing ZEG sheet
 * is never missed (and never created a second time) just because the
 * facade answered `not_loaded`.
 * @param {ZegCtx} ctx
 * @returns {Promise<{instanceId: string, sheetId: string}|null>}
 */
async function locateZegSheet(ctx) {
  await loadUnreadableWorksheets(ctx);
  return findZegSheet(ctx.stateManager);
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
 * Rewrite the ZEG sheet `ref` from the history over the agent surface. A
 * sheet that already shows the history (`planZegStack` plans nothing) is not
 * written: no stack, no save, no events.
 * @param {ZegCtx} ctx
 * @param {{instanceId: string, sheetId: string}} ref
 * @returns {Promise<boolean>} false when the sheet is unreadable or the stack failed
 */
async function rewriteSheet(ctx, ref) {
  const { stateManager, i18n } = ctx;
  if (stateManager.isCompleted()) return true;
  const prev = readSheet(stateManager, ref);
  if (!prev) return false;
  const phaseIds = phaseIdsOf(stateManager);
  const next = buildSheetState(prev, historyRows(stateManager, phaseIds), phaseIds, labelsOf(i18n, phaseIds));
  const stack = planZegStack(ref.instanceId, ref.sheetId, prev, next);
  if (stack.length === 0) return true;
  const out = await ctx.workspace.interactAsKernel(stack, SOURCE);
  if (out?.ok !== true) console.warn('[zeg-sheet] rewriting the sheet failed', out);
  return out?.ok === true;
}

/**
 * Rebuild the managed columns of the ZEG sheet from the history, over the
 * agent surface (`interactAsKernel`). The worksheet need not be mounted, and
 * the view stays where it is.
 * @param {ZegCtx} ctx
 * @param {{instanceId: string, sheetId: string}|null} [ref] the sheet; located if omitted
 * @returns {Promise<boolean>} false when there is no ZEG sheet (or writing it failed)
 */
export function writeHistoryToSheet(ctx, ref = null) {
  return serial(ctx.stateManager, async () => {
    const target = ref ?? await locateZegSheet(ctx);
    if (!target) return false;
    return rewriteSheet(ctx, target);
  });
}

/**
 * Create the ZEG worksheet in the `data` phase over the agent surface:
 * `module.add`, `renameSheet` (unique name), `writeColumns` into the empty
 * start columns, surplus rows removed, column metas last. The instance tab
 * gets the sheet name as its custom name.
 * @param {ZegCtx} ctx
 * @returns {Promise<{instanceId: string, sheetId: string}>}
 * @throws {Error} when the stack fails (read-only project, …)
 */
async function createZegSheet(ctx) {
  const { stateManager, eventBus, i18n } = ctx;
  const phaseIds = phaseIdsOf(stateManager);
  const next = buildSheetState(null, historyRows(stateManager, phaseIds), phaseIds, labelsOf(i18n, phaseIds));
  const builder = worksheetWrite().newWorksheet({ name: i18n.t('dashboard.zegSheet.name'), fitRows: true });
  for (const col of next.columns) {
    builder.column({ name: col.name, type: col.type, format: col.format, values: col.values, meta: col.meta });
  }
  const plan = builder.build();
  // Ohne Aufrufer-Instanz: `module.add` geht in die Datenphase, der Name wird eindeutig.
  const stack = completeStack({ stateManager, instanceId: null }, plan);
  const out = await ctx.workspace.interactAsKernel(stack, SOURCE);
  if (out?.ok !== true) {
    console.warn('[zeg-sheet] creating the sheet failed', out);
    throw new Error(`zeg-sheet: creating the sheet failed (${out?.error ?? 'stack failed'})`);
  }
  const instanceId = out.results.find(r => r.id === 'ws')?.result?.instanceId;
  const name = stack.find(a => a.method === 'renameSheet')?.args?.[0]?.name;
  // Der Reiter trägt den Blattnamen (Projektstruktur, nicht der Stand des Arbeitsblatts).
  const items = stateManager.get('phases.data') ?? [];
  if (name && items.some(i => i.instanceId === instanceId)) {
    stateManager.set('phases.data', items.map(i => (i.instanceId === instanceId ? { ...i, customName: name } : i)));
    eventBus.emit('state:remote-changed', { instanceIds: [], metaChanged: true });
  }
  return { instanceId, sheetId: plan.sheetId };
}

/**
 * Find the ZEG sheet or create it as a worksheet in the `data` phase, then
 * (re)write it from the history (adds missing phase columns). Writes over
 * the agent surface only.
 * @param {ZegCtx} ctx
 * @returns {Promise<{instanceId: string, sheetId: string}>}
 * @throws {Error} in a read-only project without ZEG sheet
 */
export function ensureZegSheet(ctx) {
  return serial(ctx.stateManager, async () => {
    const ref = await locateZegSheet(ctx);
    if (ref) {
      await rewriteSheet(ctx, ref);
      return ref;
    }
    if (ctx.stateManager.isCompleted()) throw new Error('zeg-sheet: project is read-only');
    return createZegSheet(ctx);
  });
}

/**
 * Write the ZEG sheet of `instanceId` back into the history. Idempotent: a
 * sheet built from the history reads back to the same history. Reads through
 * the worksheet facade.
 * @param {{stateManager: object, eventBus: object}} ctx
 * @param {string} instanceId
 * @returns {string[]} phases whose history changed
 */
export function syncSheetToHistory({ stateManager, eventBus }, instanceId) {
  if (stateManager.isCompleted()) return [];
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
 * Install the two-way sync. Runs for the whole app lifetime, also while the
 * dashboard is closed.
 * @param {ZegCtx} ctx
 * @returns {() => void} uninstall
 */
export function installZegSheetSync(ctx) {
  const { eventBus } = ctx;
  // `reason: 'preload'`: der Arbeitsblatt-Code ist nur eben geladen, die
  // Daten sind unverändert. Weichen Blatt und Verlauf eines Projekts
  // voneinander ab, überschriebe das erste Öffnen sonst den Verlauf und
  // machte das Projekt schmutzig.
  const onSheet = ({ instanceId, reason } = {}) => {
    if (reason === 'preload') return;
    syncSheetToHistory(ctx, instanceId);
  };
  const onAchievement = ({ source } = {}) => { if (source !== SOURCE) void writeHistoryToSheet(ctx); };
  const onCycle = () => { void writeHistoryToSheet(ctx); };
  eventBus.on('worksheet:dataChanged', onSheet);
  eventBus.on('phase:achievement-changed', onAchievement);
  eventBus.on('cycle:changed', onCycle);
  return () => {
    eventBus.off('worksheet:dataChanged', onSheet);
    eventBus.off('phase:achievement-changed', onAchievement);
    eventBus.off('cycle:changed', onCycle);
  };
}

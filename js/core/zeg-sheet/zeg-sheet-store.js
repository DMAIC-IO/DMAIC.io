/**
 * D.Mike — ZEG sheet: the direct write (core/zeg-sheet/zeg-sheet-store.js)
 *
 * The only part of the ZEG wiring that touches the stored worksheet state
 * directly (`getModuleState`/`setModuleState`): locating the sheet in the
 * stored state, rewriting it from the history, creating it. Everything that
 * only READS goes through the worksheet facade in `zeg-sheet.js`.
 *
 * Direct on purpose (plan F1.14a, Ruling Task 5b): the worksheet is a legacy
 * module, every write through `interact` needs its viewmodel and so mounts
 * it — a pencil edit would jump into the data phase. F1.14d (the worksheet's
 * target form, model commands without mount) switches this file to
 * `interact` with the stack from `planZegStack` and deletes it. Its exception
 * in the worksheet-state gate (`tools/build/worksheet-state-gate.mjs`) covers
 * this file only.
 */

import { getPhaseIds } from '../cycles/cycles.js';
import { uid } from '../uid.js';
import { uniqueSheetName, buildInitialWorksheetState } from '../worksheet-sheets.js';
import { isZegColumn, historyToRows, buildSheetState, planZegStack } from './zeg-sheet-model.js';

/**
 * Methodology phases of the active cycle.
 * @param {object} stateManager
 * @returns {string[]}
 */
export function phaseIdsOf(stateManager) {
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
 * Locate the ZEG sheet in the stored worksheet state — for the direct write
 * only (see `writeHistoryToSheet`). Unlike the facade it also finds a sheet
 * whose worksheet code is not loaded yet, so no second ZEG sheet is created.
 * @param {object} stateManager
 * @returns {{instanceId: string, sheetId: string}|null}
 */
function findStoredZegSheet(stateManager) {
  for (const { instanceId } of stateManager.listInstances('worksheet')) {
    const ws = stateManager.getModuleState(instanceId);
    const sheet = ws?.sheets?.find(s => s.state?.columns?.some(isZegColumn));
    if (sheet) return { instanceId, sheetId: sheet.id };
  }
  return null;
}

/**
 * Rebuild the managed columns of the ZEG sheet from the history and hand the
 * new state to a mounted worksheet (`state:remote-changed`). A sheet that
 * already shows the history (`planZegStack` plans nothing) is not written:
 * no save, no events.
 *
 * Direct write on purpose (plan F1.14a, Ruling Task 5b): the worksheet is a
 * legacy module, every write through `interact` needs its viewmodel and so
 * mounts it — a pencil edit would jump into the data phase. F1.14d (the
 * worksheet's target form, model commands without mount) switches this to
 * `interact` with the stack from `planZegStack`.
 * @param {{stateManager: object, eventBus: object, i18n: object}} ctx
 * @param {{instanceId: string, sheetId: string}|null} [ref]
 * @returns {boolean} false when there is no ZEG sheet
 */
export function writeHistoryToSheet({ stateManager, eventBus, i18n }, ref = findStoredZegSheet(stateManager)) {
  if (!ref) return false;
  // getModuleState hands out the live cache; edit a copy so a refused save leaves it intact.
  const ws = structuredClone(stateManager.getModuleState(ref.instanceId));
  const sheet = ws?.sheets?.find(s => s.id === ref.sheetId);
  if (!sheet) return false;
  const phaseIds = phaseIdsOf(stateManager);
  const rows = historyToRows(stateManager.get('phaseAchievementHistory') || {}, phaseIds);
  const next = buildSheetState(sheet.state, rows, phaseIds, labelsOf(i18n, phaseIds));
  // No-op skip: an empty `planZegStack` also leaves out the resets `buildSheetState`
  // would apply (sortCol/sortDir, selection, shortName, the `type` of managed
  // columns). Accepted (plan F1.14a, Task 6).
  if (sheet.state && planZegStack(ref.instanceId, ref.sheetId, sheet.state, next).length === 0) return true;
  sheet.state = next;
  stateManager.setModuleState(ref.instanceId, ws);
  eventBus.emit('state:remote-changed', { instanceIds: [ref.instanceId], metaChanged: false });
  eventBus.emit('worksheet:dataChanged', { instanceId: ref.instanceId });
  return true;
}

/**
 * Find the ZEG sheet or create it as a worksheet in the `data` phase, then
 * (re)write it from the history (adds missing phase columns). Writes
 * directly, see `writeHistoryToSheet`.
 * @param {{stateManager: object, eventBus: object, i18n: object}} ctx
 * @returns {{instanceId: string, sheetId: string}}
 * @throws {Error} in a read-only project without ZEG sheet
 */
export function ensureZegSheet(ctx) {
  const { stateManager, eventBus, i18n } = ctx;
  let ref = findStoredZegSheet(stateManager);
  if (!ref) {
    const instanceId = uid();
    const name = uniqueSheetName(stateManager, i18n.t('dashboard.zegSheet.name'));
    const ws = buildInitialWorksheetState(name);
    const phaseIds = phaseIdsOf(stateManager);
    ws.sheets[0].state = buildSheetState(null, historyToRows(stateManager.get('phaseAchievementHistory') || {}, phaseIds), phaseIds, labelsOf(i18n, phaseIds));
    stateManager.setModuleState(instanceId, ws);
    const items = stateManager.get('phases.data') ?? [];
    stateManager.set('phases.data', [
      ...items,
      { instanceId, moduleId: 'worksheet', order: items.length, state: {}, customName: name },
    ]);
    ref = findStoredZegSheet(stateManager);
    if (!ref) throw new Error('zeg-sheet: project is read-only');
    eventBus.emit('module:added', { moduleId: 'worksheet', phase: 'data', instanceId });
    return ref;
  }
  writeHistoryToSheet(ctx, ref);
  return ref;
}

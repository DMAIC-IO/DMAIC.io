/**
 * D.Mike — ZEG sheet wiring (core/zeg-sheet/zeg-sheet.js)
 *
 * Keeps an editable worksheet in the `data` phase in two-way sync with
 * `phaseAchievementHistory`. The history stays the source of truth; the
 * sheet is found by its column metas (`managedBy: 'zeg'`), never by name.
 * Spec: docs/superpowers/specs/2026-10-12-zeg-worksheet-design.md
 */

import { getPhaseIds } from '../cycles/cycles.js';
import { uid } from '../uid.js';
import { uniqueSheetName, buildInitialWorksheetState } from '../worksheet-sheets.js';
import {
  isZegColumn, historyToRows, rowsToHistory, readRows, buildSheetState,
} from './zeg-sheet-model.js';

const SOURCE = 'zeg-sheet';

/**
 * Locate the ZEG sheet: first worksheet sheet holding a ZEG column.
 * @param {object} stateManager
 * @returns {{instanceId: string, sheetId: string}|null}
 */
export function findZegSheet(stateManager) {
  for (const { instanceId } of stateManager.listInstances('worksheet')) {
    const ws = stateManager.getModuleState(instanceId);
    const sheet = ws?.sheets?.find(s => s.state?.columns?.some(isZegColumn));
    if (sheet) return { instanceId, sheetId: sheet.id };
  }
  return null;
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
 * Rebuild the managed columns of the ZEG sheet from the history and hand the
 * new state to a mounted worksheet (`state:remote-changed`).
 * @param {{stateManager: object, eventBus: object, i18n: object}} ctx
 * @param {{instanceId: string, sheetId: string}|null} [ref]
 * @returns {boolean} false when there is no ZEG sheet
 */
export function writeHistoryToSheet({ stateManager, eventBus, i18n }, ref = findZegSheet(stateManager)) {
  if (!ref) return false;
  // getModuleState hands out the live cache; edit a copy so a refused save leaves it intact.
  const ws = structuredClone(stateManager.getModuleState(ref.instanceId));
  const sheet = ws?.sheets?.find(s => s.id === ref.sheetId);
  if (!sheet) return false;
  const phaseIds = phaseIdsOf(stateManager);
  const rows = historyToRows(stateManager.get('phaseAchievementHistory') || {}, phaseIds);
  sheet.state = buildSheetState(sheet.state, rows, phaseIds, labelsOf(i18n, phaseIds));
  stateManager.setModuleState(ref.instanceId, ws);
  eventBus.emit('state:remote-changed', { instanceIds: [ref.instanceId], metaChanged: false });
  eventBus.emit('worksheet:dataChanged', { instanceId: ref.instanceId });
  return true;
}

/**
 * Write the ZEG sheet of `instanceId` back into the history. Idempotent: a
 * sheet built from the history reads back to the same history.
 * @param {{stateManager: object, eventBus: object}} ctx
 * @param {string} instanceId
 * @returns {string[]} phases whose history changed
 */
export function syncSheetToHistory({ stateManager, eventBus }, instanceId) {
  if (stateManager.isCompleted()) return [];
  const ref = findZegSheet(stateManager);
  if (!ref || ref.instanceId !== instanceId) return [];
  const sheet = stateManager.getModuleState(ref.instanceId).sheets.find(s => s.id === ref.sheetId);
  const phaseIds = phaseIdsOf(stateManager);
  const { rows, presentPhases } = readRows(sheet.state);
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
 * Find the ZEG sheet or create it as a worksheet in the `data` phase, then
 * (re)write it from the history (adds missing phase columns).
 * @param {{stateManager: object, eventBus: object, i18n: object}} ctx
 * @returns {{instanceId: string, sheetId: string}}
 */
export function ensureZegSheet(ctx) {
  const { stateManager, eventBus, i18n } = ctx;
  let ref = findZegSheet(stateManager);
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
    ref = findZegSheet(stateManager);
    if (!ref) throw new Error('zeg-sheet: project is read-only');
    eventBus.emit('module:added', { moduleId: 'worksheet', phase: 'data', instanceId });
    return ref;
  }
  writeHistoryToSheet(ctx, ref);
  return ref;
}

/**
 * Install the two-way sync. Runs for the whole app lifetime, also while the
 * dashboard is closed.
 * @param {{stateManager: object, eventBus: object, i18n: object}} ctx
 * @returns {() => void} uninstall
 */
export function installZegSheetSync(ctx) {
  const { eventBus } = ctx;
  const onSheet = ({ instanceId } = {}) => { syncSheetToHistory(ctx, instanceId); };
  const onAchievement = ({ source } = {}) => { if (source !== SOURCE) writeHistoryToSheet(ctx); };
  const onCycle = () => { writeHistoryToSheet(ctx); };
  eventBus.on('worksheet:dataChanged', onSheet);
  eventBus.on('phase:achievement-changed', onAchievement);
  eventBus.on('cycle:changed', onCycle);
  return () => {
    eventBus.off('worksheet:dataChanged', onSheet);
    eventBus.off('phase:achievement-changed', onAchievement);
    eventBus.off('cycle:changed', onCycle);
  };
}

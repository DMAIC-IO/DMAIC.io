/**
 * D.Mike — ZEG sheet wiring (core/zeg-sheet/zeg-sheet.js)
 *
 * Keeps an editable worksheet in the `data` phase in two-way sync with
 * `phaseAchievementHistory`. The history stays the source of truth; the
 * sheet is found by its column metas (`managedBy: 'zeg'`), never by name.
 * This file reads only through the worksheet facade (`readWorksheet`); the
 * direct write of the sheet (`writeHistoryToSheet`, `ensureZegSheet`) is in
 * `zeg-sheet-store.js` until F1.14d and re-exported here.
 */

import { readWorksheet } from '../worksheet-columns.js';
import { isZegColumn, rowsToHistory, readRows } from './zeg-sheet-model.js';
import { phaseIdsOf, writeHistoryToSheet, ensureZegSheet } from './zeg-sheet-store.js';

// The direct write (stored state) lives in zeg-sheet-store.js until F1.14d.
export { writeHistoryToSheet, ensureZegSheet };

const SOURCE = 'zeg-sheet';

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
 * @param {{stateManager: object, eventBus: object, i18n: object}} ctx
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

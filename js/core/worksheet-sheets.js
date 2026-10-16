/**
 * D.Mike — Worksheet sheet helpers (worksheet-sheets.js)
 *
 * DOM-free helpers for creating worksheets from outside the worksheet module:
 * a collision-free sheet name and the initial worksheet state.
 */

/**
 * Generate a unique sheet name by appending a number if necessary.
 * Collects all existing sheet names across all worksheets and ensures
 * the returned name does not collide.
 * @param {Object} stateManager
 * @param {string} baseName — Desired name (e.g. "Tabelle" or "Sheet")
 * @returns {string} — e.g. "Tabelle", "Tabelle 1", "Tabelle 2", …
 */
export function uniqueSheetName(stateManager, baseName) {
  const existing = new Set();
  for (const phase of Object.keys(stateManager.get('phases') || {})) {
    const instances = stateManager.get(`phases.${phase}`) ?? [];
    for (const inst of instances) {
      if (inst.moduleId !== 'worksheet') continue;
      const ws = stateManager.getModuleState(inst.instanceId);
      if (!ws?.sheets) continue;
      for (const sheet of ws.sheets) {
        existing.add(sheet.name);
      }
    }
  }
  if (!existing.has(baseName)) return baseName;
  let i = 1;
  while (existing.has(`${baseName} ${i}`)) i++;
  return `${baseName} ${i}`;
}

/**
 * Build an initial worksheet state object with one empty sheet.
 * Useful for pre-populating a worksheet before it is activated.
 * @param {string} sheetName
 * @returns {Object}
 */
export function buildInitialWorksheetState(sheetName) {
  return {
    sheets: [{ id: 'sheet_1', name: sheetName, state: null }],
    activeSheetId: 'sheet_1',
    sheetCounter: 1,
  };
}

/**
 * D.Mike — DataGrid → Worksheet Helper (datagrid-to-worksheet.js)
 *
 * Creates a new Worksheet (Datensammlung) module instance populated with the
 * current state of an embedded DataGrid. Used by the "Open in Data Collection"
 * button in integrated datagrids.
 */

/**
 * Create a new Worksheet instance from a DataGrid's current state.
 *
 * @param {import('./datagrid.js').DataGrid} grid - The embedded DataGrid
 * @param {object} context - Module context (stateManager, eventBus, i18n, notify)
 * @param {object} [options]
 * @param {string} [options.phase='data'] - DMAIC phase to register worksheet in
 * @param {string} [options.sheetName] - Name for the first sheet
 * @param {boolean} [options.navigate=false] - Whether to switch to the new worksheet
 * @returns {string} The new worksheet instance ID
 */
export function openGridInWorksheet(grid, context, options = {}) {
  const { stateManager: sm, eventBus, i18n } = context;

  // Resolve target phase. If `options.phase` is set, use it. Otherwise place
  // the worksheet in the same phase as the calling module (context.instanceId)
  // so the host module's tab stays visible alongside the new worksheet tab.
  // Falls back to 'data' if the host instance can't be located.
  let phase = options.phase;
  if (!phase) {
    const allPhases = Object.keys(sm.get('phases') || {});
    for (const p of allPhases) {
      const list = sm.get(`phases.${p}`) ?? [];
      if (list.some(i => i.instanceId === context.instanceId)) { phase = p; break; }
    }
    if (!phase) phase = 'data';
  }
  const sheetName = options.sheetName || `${i18n?.t?.('modules.worksheet.defaultSheetName') || 'Sheet'  } 1`;

  // Snapshot the grid state (strip runtime-only fields)
  const raw = grid.getState();
  const sheetState = {
    columns: raw.columns,
    rowCount: raw.rowCount,
    colWidths: raw.colWidths || {},
    sortCol: raw.sortCol ?? null,
    sortDir: raw.sortDir ?? null,
    selection: null,
  };

  // Deep-clone through JSON to drop any class instances (e.g. History)
  const cleanSheetState = JSON.parse(JSON.stringify(sheetState));

  const wsInstanceId = crypto.randomUUID();
  const sheetId = 'sheet_1';
  const wbState = {
    sheets: [{ id: sheetId, name: sheetName, state: cleanSheetState }],
    activeSheetId: sheetId,
    sheetCounter: 1,
  };

  // Register worksheet in the given phase
  const existing = sm.get(`phases.${phase}`) ?? [];
  sm.set(`phases.${phase}`, [
    ...existing,
    { instanceId: wsInstanceId, moduleId: 'worksheet', order: existing.length, state: {} },
  ]);

  // Persist workbook state
  sm.setModuleState(wsInstanceId, wbState);

  // When navigate=true: emit a regular (non-silent) module:added so the
  // workspace re-renders the phase (showing both existing and new tabs) and
  // activates the new worksheet in one pass — identical to the sidebar flow.
  // When navigate=false: emit silently so the host module keeps focus and
  // only the sidebar/tab bar updates.
  eventBus.emit('module:added', {
    moduleId: 'worksheet',
    phase,
    instanceId: wsInstanceId,
    silent: options.navigate !== true,
  });

  return wsInstanceId;
}

/**
 * D.Mike — Survey hand-over (survey-link.js)
 *
 * The only file that knows the state shapes of other modules: worksheet
 * (DataGrid workbook), kano and voc-ctx-tree. Everything here is a pure
 * snapshot builder; the module writes the result via stateManager.
 *
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md §6.2, §8
 */

import { uid } from '../../core/uid.js';

/**
 * Workbook state for a new worksheet instance (DataGrid format, same shape
 * as doe-planner-worksheet.js builds).
 * @param {Array<{name: string, type: 'numeric'|'text', role: string, values: Array}>} columns
 * @param {string} sheetName
 * @returns {{sheets: object[], activeSheetId: string, sheetCounter: number}}
 */
export function buildWorksheetState(columns, sheetName) {
  const rowCount = columns.reduce((m, c) => Math.max(m, c.values.length), 0);
  const cols = columns.map((c, i) => ({
    id: uid(),
    name: c.name,
    shortName: `C${i + 1}`,
    type: c.type,
    unit: '',
    values: c.values.slice(),
    formulas: new Array(rowCount).fill(null),
    format: {},
    role: c.role,
    roleManual: true,
  }));
  return {
    sheets: [{
      id: 'sheet_1',
      name: sheetName,
      state: { columns: cols, rowCount, colWidths: {}, sortCol: null, sortDir: null, selection: null },
    }],
    activeSheetId: 'sheet_1',
    sheetCounter: 1,
  };
}

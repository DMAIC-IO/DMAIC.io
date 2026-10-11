/**
 * D.Mike — Survey hand-over tests (survey-link.test.js)
 * Worksheet state, Kano hand-over, VoC tree hand-over.
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md §6.2, §8
 */

import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { buildWorksheetState } from '../../js/modules/survey-builder/survey-link.js';

suite('survey-link — buildWorksheetState', () => {
  const columns = [
    { name: 'Antwort-ID', type: 'text', role: 'identifier', values: ['x1', 'x2'] },
    { name: 'R: R1', type: 'numeric', role: 'ordinal', values: [5, null] },
  ];

  test('one sheet with DataGrid columns', () => {
    const wb = buildWorksheetState(columns, 'Umfrage');
    assertEqual(wb.activeSheetId, 'sheet_1');
    assertEqual(wb.sheetCounter, 1);
    assertEqual(wb.sheets.length, 1);
    assertEqual(wb.sheets[0].name, 'Umfrage');
    const st = wb.sheets[0].state;
    assertEqual(st.rowCount, 2);
    assertDeepEqual(st.colWidths, {});
    assertEqual(st.sortCol, null);
    assertDeepEqual(st.columns.map((c) => c.shortName), ['C1', 'C2']);
    assertDeepEqual(st.columns[1].values, [5, null]);
    assertDeepEqual(st.columns[1].formulas, [null, null]);
    assertEqual(st.columns[1].role, 'ordinal');
    assertEqual(st.columns[1].roleManual, true);
    assertEqual(st.columns[1].unit, '');
    assertTrue(typeof st.columns[0].id === 'string' && st.columns[0].id !== st.columns[1].id);
  });

  test('values are copied, not shared', () => {
    const wb = buildWorksheetState(columns, 'X');
    wb.sheets[0].state.columns[0].values.push('x3');
    assertEqual(columns[0].values.length, 2);
  });
});

/**
 * Tests for core/worksheet-sheets.js — sheet naming and initial worksheet state.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { uniqueSheetName, buildInitialWorksheetState } from '../../js/core/worksheet-sheets.js';

function fakeStateManager(sheetNames) {
  const phases = { data: [{ instanceId: 'w1', moduleId: 'worksheet' }, { instanceId: 's1', moduleId: 'sipoc' }] };
  const modules = { w1: { sheets: sheetNames.map((name, i) => ({ id: `sheet_${i + 1}`, name })) } };
  return {
    get: (p) => (p === 'phases' ? phases : phases[p.split('.')[1]]),
    getModuleState: (id) => modules[id] ?? null,
  };
}

suite('core/worksheet-sheets', () => {
  test('uniqueSheetName keeps a free name', () => {
    assertEqual(uniqueSheetName(fakeStateManager(['Daten']), 'Tabelle'), 'Tabelle');
  });

  test('uniqueSheetName numbers a taken name', () => {
    assertEqual(uniqueSheetName(fakeStateManager(['Tabelle', 'Tabelle 1']), 'Tabelle'), 'Tabelle 2');
  });

  test('buildInitialWorksheetState holds one empty sheet', () => {
    assertDeepEqual(buildInitialWorksheetState('Tabelle'), {
      sheets: [{ id: 'sheet_1', name: 'Tabelle', state: null }],
      activeSheetId: 'sheet_1',
      sheetCounter: 1,
    });
  });
});

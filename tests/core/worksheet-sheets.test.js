/**
 * Tests for core/worksheet-sheets.js — sheet naming and initial worksheet state.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { uniqueSheetName, buildInitialWorksheetState } from '../../js/core/worksheet-sheets.js';
import { registerWorksheetReader } from '../../js/core/worksheet-columns.js';
import { readWorksheetState } from '../helpers/legacy-worksheet-read.js';

function fakeStateManager(sheetNames) {
  const phases = { data: [{ instanceId: 'w1', moduleId: 'worksheet' }, { instanceId: 's1', moduleId: 'sipoc' }] };
  const modules = { w1: { sheets: sheetNames.map((name, i) => ({ id: `sheet_${i + 1}`, name })) } };
  // Die Fassade liest über den Leser; getModuleState ist tabu.
  const sm = {
    get: (p) => (p === 'phases' ? phases : phases[p.split('.')[1]]),
    getModuleState: () => { throw new Error('getModuleState must not be called'); },
  };
  registerWorksheetReader(sm, (id, o) => {
    if (!modules[id]) { const e = new Error('unknown_instance'); e.code = 'unknown_instance'; throw e; }
    return readWorksheetState(modules[id], o);
  });
  return sm;
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

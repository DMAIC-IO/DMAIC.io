/**
 * D.Mike — DoE Planner response state (doe-planner-responses.js) and sourceRowCount
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { readResponses, staleness, boundPct, boundComplete } from '../../js/modules/doe-planner/doe-planner-responses.js';
import { sourceRowCount } from '../../js/modules/doe-planner/doe-planner-worksheet.js';
import { stateWith } from './doe-planner-designs/state.js';

/** A context whose stateManager knows one worksheet "ws-1" with sheet "s-1". */
function contextWith(values, rowCount = 4) {
  const ws = {
    sheets: [{
      id: 's-1',
      state: { rowCount, columns: [{ id: 'c-y', values }] },
    }],
  };
  return { stateManager: { getModuleState: (id) => (id === 'ws-1' ? ws : null) } };
}

function linked(extra = {}) {
  const s = stateWith({ responses: ['Y'], ...extra });
  s.design = { designType: 'full', codedMatrix: [[-1, -1], [1, -1], [-1, 1], [1, 1]] };
  s.worksheetRef = { instanceId: 'ws-1', sheetId: 's-1', responseColumnIds: ['c-y'], designSignature: s.designSignature() };
  return s;
}

suite('doe-planner responses — read', () => {
  test('null without a linked datasheet', () => {
    assertEqual(readResponses(contextWith([]), stateWith()), null);
  });

  test('values and fill state from the linked sheet', () => {
    const r = readResponses(contextWith([1, null, 3, 4]), linked());
    assertDeepEqual(r.values, [[1, null, 3, 4]]);
    assertEqual(r.filledCount, 3);
    assertEqual(r.totalCount, 4);
    assertEqual(r.complete, false);
  });

  test('percent and completeness', () => {
    assertEqual(boundPct(contextWith([1, null, 3, 4]), linked()), 75);
    assertEqual(boundComplete(contextWith([1, null, 3, 4]), linked()), false);
    assertEqual(boundComplete(contextWith([1, 2, 3, 4]), linked()), true);
    assertEqual(boundPct(contextWith([]), stateWith()), 0);
    assertEqual(boundComplete(contextWith([]), stateWith()), false);
  });
});

suite('doe-planner responses — staleness', () => {
  test('unbound without a valid datasheet', () => {
    assertEqual(staleness(contextWith([]), stateWith()), 'unbound');
    const s = linked();
    s.worksheetRef.instanceId = 'gone';
    assertEqual(staleness(contextWith([]), s), 'unbound');
  });

  test('bound while the design signature matches, stale after a change', () => {
    const s = linked();
    assertEqual(staleness(contextWith([]), s), 'bound');
    s.responses[0].unit = 'kg';
    assertEqual(staleness(contextWith([]), s), 'stale');
  });
});

suite('doe-planner worksheet — sourceRowCount', () => {
  test('row count of the referenced sheet, 0 otherwise', () => {
    assertEqual(sourceRowCount(contextWith([], 7), { instanceId: 'ws-1', sheetId: 's-1' }), 7);
    assertEqual(sourceRowCount(contextWith([], 7), { instanceId: 'ws-1', sheetId: 'nope' }), 0);
    assertEqual(sourceRowCount(contextWith([], 7), null), 0);
  });
});

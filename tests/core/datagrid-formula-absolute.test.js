/**
 * Tests for js/core/datagrid/datagrid-formula.js
 * Absolute-reference markers ($) evaluate like the plain references.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { evaluateFormula } from '../../js/core/datagrid/datagrid-formula.js';

/** Build a minimal grid mock with the surface the formula engine touches. */
function makeGrid(columns) {
  const rowCount = Math.max(0, ...columns.map(c => c.values.length));
  return {
    columns,
    rowCount,
    getColumnByIndex(i) { return columns[i] ?? null; },
  };
}

const grid = () => makeGrid([
  { name: 'Ist', values: [10, 20, 30] },
  { name: 'Ref', values: [5, 7, 9] },
]);

/** Evaluate and return the result, asserting no error. */
function value(formula) {
  const { result, error } = evaluateFormula(formula, grid());
  assertEqual(error, null);
  return result;
}

suite('DataGrid Formula — absolute references ($)', () => {
  test('pinned row', () => assertEqual(value('=C1[2]/C2[$1]'), 4));
  test('pinned column', () => assertEqual(value('=$C1[3]'), 30));
  test('pinned column and row', () => assertEqual(value('=$C2[$3]*2'), 18));
  test('pinned named row', () => assertEqual(value("='Ist'[$1]+'Ref'[1]"), 15));
  test('pinned bare column', () => assertEqual(value('=SUM($C1)'), 60));
  test('pinned column range', () => assertEqual(value('=SUM($C1:$C2)'), 81));
  test('pinned cell range', () => assertEqual(value('=SUM(C1[$1]:$C1[$2])'), 30));
  test('a $ inside a string literal is kept', () => {
    assertEqual(value('=IF(C1[1]>5; "$C1"; "x")'), '$C1');
  });
});

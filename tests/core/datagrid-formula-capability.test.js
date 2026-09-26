/**
 * Tests for js/core/datagrid/datagrid-formula.js
 * Capability formulas CP, CPK, CPKUP, CPKLO.
 *
 * All four use σ within = MR̄/d2 (d2 = 1.128) over the column in row order,
 * like Minitab's Cp/Cpk for individuals. [8, 10, 12] → MR̄ = 2.
 */

import { suite, test, assertEqual, assertAlmostEqual } from '../test-utils.js';
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

const grid = () => makeGrid([{ name: 'X', values: [8, 10, 12] }]);
const SIGMA_WITHIN = 2 / 1.128;

suite('DataGrid Formula — capability (σ within = MR̄/d2)', () => {
  test('CP', () => {
    const { result, error } = evaluateFormula('=CP(\'X\'; 4; 16)', grid());
    assertEqual(error, null);
    assertAlmostEqual(result, 12 / (6 * SIGMA_WITHIN), 1e-12);
  });

  test('CPK', () => {
    const { result, error } = evaluateFormula('=CPK(\'X\'; 4; 13)', grid());
    assertEqual(error, null);
    assertAlmostEqual(result, 3 / (3 * SIGMA_WITHIN), 1e-12);
  });

  test('CPKUP', () => {
    const { result, error } = evaluateFormula('=CPKUP(\'X\'; 13)', grid());
    assertEqual(error, null);
    assertAlmostEqual(result, 3 / (3 * SIGMA_WITHIN), 1e-12);
  });

  test('CPKLO', () => {
    const { result, error } = evaluateFormula('=CPKLO(\'X\'; 4)', grid());
    assertEqual(error, null);
    assertAlmostEqual(result, 6 / (3 * SIGMA_WITHIN), 1e-12);
  });

  test('row order matters: [8, 12, 10] → MR̄ = 3', () => {
    const g = makeGrid([{ name: 'X', values: [8, 12, 10] }]);
    const { result } = evaluateFormula('=CP(\'X\'; 4; 16)', g);
    assertAlmostEqual(result, 12 / (6 * 3 / 1.128), 1e-12);
  });

  test('constant column → #DIV/0', () => {
    const g = makeGrid([{ name: 'X', values: [5, 5, 5] }]);
    assertEqual(evaluateFormula('=CP(\'X\'; 4; 16)', g).error, '#DIV/0');
  });
});

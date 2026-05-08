/**
 * Tests for js/core/datagrid/datagrid-formula.js
 * Conditional aggregates: COUNTIF, SUMIF, AVERAGEIF, STDEVIF, VARIF.
 *
 * Two-arg form  : FN(criteriaRange; criterion)
 * Three-arg form: FN(criteriaRange; criterion; valueRange)  [SUMIF, AVERAGEIF, STDEVIF, VARIF]
 *
 * Implicit equality: a criterion without a leading operator is treated as "= …".
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

const replicateGrid = () => makeGrid([
  { name: 'GroupID', values: [1, 1, 2, 2, 3, 3] },
  { name: 'Yield',   values: [47.3, 48.4, 39.1, 40.0, 52.7, 51.9] },
]);

const textGroupGrid = () => makeGrid([
  { name: 'Tool',   values: ['A', 'A', 'B', 'B', 'C'] },
  { name: 'Cycle',  values: [12, 14, 20, 22, 30] },
]);

suite('DataGrid Formula — COUNTIF', () => {
  test('counts numeric matches with comparison operator', () => {
    const g = replicateGrid();
    const { result, error } = evaluateFormula('=COUNTIF(\'Yield\'; > 45)', g);
    assertEqual(error, null);
    assertEqual(result, 4);
  });

  test('implicit equality on numeric criterion', () => {
    const g = replicateGrid();
    const { result, error } = evaluateFormula('=COUNTIF(\'GroupID\'; 2)', g);
    assertEqual(error, null);
    assertEqual(result, 2);
  });
});

suite('DataGrid Formula — SUMIF (3-arg)', () => {
  test('sums valueRange where criteriaRange equals criterion', () => {
    const g = replicateGrid();
    const { result, error } = evaluateFormula('=SUMIF(\'GroupID\'; 1; \'Yield\')', g);
    assertEqual(error, null);
    assertAlmostEqual(result, 95.7);
  });

  test('still supports legacy 2-arg form', () => {
    const g = replicateGrid();
    const { result, error } = evaluateFormula('=SUMIF(\'Yield\'; > 50)', g);
    assertEqual(error, null);
    assertAlmostEqual(result, 104.6);
  });

  test('text criterion drives sum of separate value column', () => {
    const g = textGroupGrid();
    const { result, error } = evaluateFormula('=SUMIF(\'Tool\'; "A"; \'Cycle\')', g);
    assertEqual(error, null);
    assertEqual(result, 26);
  });
});

suite('DataGrid Formula — AVERAGEIF', () => {
  test('mean of valueRange filtered by criteriaRange (cell ref criterion)', () => {
    const g = replicateGrid();
    // GroupID[1] = 1 → mean of yields where group is 1 = (47.3 + 48.4) / 2
    const { result, error } = evaluateFormula('=AVERAGEIF(\'GroupID\'; \'GroupID\'[1]; \'Yield\')', g);
    assertEqual(error, null);
    assertAlmostEqual(result, 47.85);
  });

  test('mean for second replicate group', () => {
    const g = replicateGrid();
    const { result, error } = evaluateFormula('=AVERAGEIF(\'GroupID\'; 2; \'Yield\')', g);
    assertEqual(error, null);
    assertAlmostEqual(result, 39.55);
  });

  test('no matching rows → #DIV/0', () => {
    const g = replicateGrid();
    const { result, error } = evaluateFormula('=AVERAGEIF(\'GroupID\'; 999; \'Yield\')', g);
    assertEqual(result, null);
    assertEqual(error, '#DIV/0');
  });
});

suite('DataGrid Formula — STDEVIF / VARIF', () => {
  test('STDEVIF of replicate group (sample stddev)', () => {
    const g = replicateGrid();
    const { result, error } = evaluateFormula('=STDEVIF(\'GroupID\'; 1; \'Yield\')', g);
    assertEqual(error, null);
    // sample stddev of [47.3, 48.4] = |47.3-48.4|/sqrt(2) ≈ 0.7778
    assertAlmostEqual(result, Math.abs(47.3 - 48.4) / Math.sqrt(2), 1e-6);
  });

  test('VARIF equals STDEVIF squared', () => {
    const g = replicateGrid();
    const sd = evaluateFormula('=STDEVIF(\'GroupID\'; 2; \'Yield\')', g).result;
    const vr = evaluateFormula('=VARIF(\'GroupID\'; 2; \'Yield\')',  g).result;
    assertAlmostEqual(vr, sd * sd, 1e-9);
  });

  test('STDEVIF with single match → #N/A (stddev needs ≥2 values)', () => {
    const g = textGroupGrid();
    const { result, error } = evaluateFormula('=STDEVIF(\'Tool\'; "C"; \'Cycle\')', g);
    assertEqual(result, null);
    assertEqual(error, '#N/A');
  });

  test('LN(VARIF(...)) computes Y_LnVar as used by DoE helper columns', () => {
    const g = replicateGrid();
    const { result, error } = evaluateFormula('=LN(VARIF(\'GroupID\'; 1; \'Yield\'))', g);
    assertEqual(error, null);
    const expectedVar = ((47.3 - 47.85) ** 2 + (48.4 - 47.85) ** 2); // n-1 = 1, so divisor 1
    assertAlmostEqual(result, Math.log(expectedVar), 1e-6);
  });
});

suite('DataGrid Formula — implicit equality and edge cases', () => {
  test('implicit equality matches loose: number criterion vs numeric column', () => {
    const g = replicateGrid();
    const { result } = evaluateFormula('=AVERAGEIF(\'GroupID\'; 3; \'Yield\')', g);
    assertAlmostEqual(result, (52.7 + 51.9) / 2);
  });

  test('null cells in valueRange are skipped', () => {
    const g = makeGrid([
      { name: 'Key', values: ['x', 'x', 'x'] },
      { name: 'Val', values: [10, null, 12] },
    ]);
    const { result, error } = evaluateFormula('=AVERAGEIF(\'Key\'; "x"; \'Val\')', g);
    assertEqual(error, null);
    assertAlmostEqual(result, 11);
  });

  test('different lengths → only overlap is considered', () => {
    const g = makeGrid([
      { name: 'Key', values: [1, 1, 1, 1, 1] },
      { name: 'Val', values: [10, 20, 30] },
    ]);
    const { result } = evaluateFormula('=SUMIF(\'Key\'; 1; \'Val\')', g);
    assertEqual(result, 60); // only first 3 rows overlap
  });

  test('unknown column reference → #REF!', () => {
    const g = replicateGrid();
    const { error } = evaluateFormula('=AVERAGEIF(\'Nope\'; 1; \'Yield\')', g);
    assertEqual(error, '#REF!');
  });

  test('wrong arg count → #ARG', () => {
    const g = replicateGrid();
    const { error } = evaluateFormula('=AVERAGEIF(\'GroupID\')', g);
    assertEqual(error, '#ARG');
  });
});

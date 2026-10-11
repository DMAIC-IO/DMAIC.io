/**
 * Tests for js/core/datagrid/datagrid-formula.js
 * Capability formulas CP, CPK, CPKUP, CPKLO.
 *
 * All four use σ within = MR̄/d2 (d2 = 1.128) over the column in row order,
 * like Minitab's Cp/Cpk for individuals. [8, 10, 12] → MR̄ = 2.
 */

import { suite, test, assertEqual, assertAlmostEqual } from '../test-utils.js';
import { evaluateFormula } from '../../js/core/datagrid/datagrid-formula.js';
import { DataGrid } from '../../js/core/datagrid/datagrid.js';

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

// ═══════════════════════════════════════════════════════════
//  setCellValue(…, { clearFormula })
// ═══════════════════════════════════════════════════════════

/**
 * Ein ECHTES Grid, nicht das Formel-Mock oben: `clearFormula` lebt in
 * `DataGrid.setCellValue` und schreibt in die Historie, und beides hat das
 * Mock nicht. Detachter Container wie in `datagrid-locked-columns.test.js`.
 *
 * Zwei Spalten, und die Formel steht in der zweiten: eine Formel in C1 Zeile 2,
 * die C1 Zeile 2 liest, wäre ein Selbstbezug. `'=C1[2]*2'` ist 20*2 = 40 — und
 * genau der Wert, den die Zelle vor dem Schreibzugriff trägt. Das ist kein
 * Zufall, sondern nötig: `_applyUndo` schließt mit `render()`, und
 * `recalcAllFormulas` rechnet eine zurückgeholte Formel sofort wieder aus.
 * Trüge die Zelle vorher einen anderen Wert, wäre „undo stellt den Wert
 * wieder her" an einer Formelzelle gar nicht prüfbar.
 */
function newGrid() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const grid = new DataGrid(container);
  grid.setData([
    { id: 'col_a', name: 'Yield', type: 'numeric', values: [10, 20, 30], format: {} },
    { id: 'col_b', name: 'Doppelt', type: 'numeric', values: [20, 40, 60], format: {} },
  ]);
  return grid;
}

const FORMULA = '=C1[2]*2';   // C1 Zeile 2 = 20 → 40

suite('DataGrid setCellValue — clearFormula', () => {
  test('setCellValue mit clearFormula löscht die Formel und merkt sie in der Historie', () => {
    const grid = newGrid();
    const col = grid.getColumn('col_b');
    col.formulas = [null, FORMULA, null];

    grid.setCellValue(col.id, 1, 99, { clearFormula: true });

    assertEqual(col.formulas[1], null);
    assertEqual(col.values[1], 99);
    const entry = grid.history._stack[grid.history._index];
    assertEqual(entry.oldFormula, FORMULA);
    assertEqual(entry.newFormula, null);
  });

  test('undo nach einem clearFormula-Schreibzugriff stellt Wert UND Formel wieder her', () => {
    // Bisher trug der Eintrag die Formel nur, wenn er aus dem Zell-Editor
    // kam. Ein Agent konnte eine Formel zerstören, die er nicht sehen
    // konnte, und sie nicht zurückholen.
    const grid = newGrid();
    const col = grid.getColumn('col_b');
    col.formulas = [null, FORMULA, null];

    grid.setCellValue(col.id, 1, 99, { clearFormula: true });
    grid.undo();

    assertEqual(col.values[1], 40);
    assertEqual(col.formulas[1], FORMULA);
  });

  test('setCellValue OHNE clearFormula lässt die Formel stehen — altes Verhalten', () => {
    const grid = newGrid();
    const col = grid.getColumn('col_b');
    col.formulas = [null, FORMULA, null];

    grid.setCellValue(col.id, 1, 99);

    assertEqual(col.formulas[1], FORMULA);
    assertEqual(grid.history._stack[grid.history._index].oldFormula, undefined);
  });

  test('clearFormula an einer Zelle ohne Formel ändert die Historie nicht', () => {
    const grid = newGrid();
    const col = grid.getColumn('col_a');
    grid.setCellValue(col.id, 0, 7, { clearFormula: true });
    assertEqual(grid.history._stack[grid.history._index].oldFormula, undefined);
    grid.undo();
    assertEqual(col.values[0], 10);
  });
});

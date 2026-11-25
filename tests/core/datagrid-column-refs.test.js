/**
 * Tests that positional column references in formulas (C1, C1[2], $C1, ranges)
 * follow their column when columns are moved, inserted or removed.
 *
 * Regression: dragging a new, empty column in front of a formula column left
 * `=C1*2` pointing at the empty column — the whole formula column showed NaN.
 *
 * Runs in the browser test runner — uses a detached <div> as the grid container.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { DataGrid } from '../../js/core/datagrid/datagrid.js';
import { remapColumnRefs, evaluateFormula } from '../../js/core/datagrid/datagrid-formula.js';

function newGrid() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const grid = new DataGrid(container);
  grid.setData([
    { id: 'col_a', name: 'X', type: 'numeric', values: [1, 2, 3], format: {} },
    { id: 'col_b', name: 'Doppelt', type: 'numeric', values: [null, null, null], format: {} },
  ]);
  for (let r = 0; r < 3; r++) grid.setCellFormula('col_b', r, `=C1[${r + 1}]*2`);
  return { grid, dispose: () => { grid.destroy?.(); container.remove(); } };
}

const values = (grid, id) => grid.getColumn(id).values.join('|');

suite('DataGrid column refs — structural changes', () => {
  test('a new column dragged in front keeps the formulas on their source', () => {
    const { grid, dispose } = newGrid();
    assertEqual(values(grid, 'col_b'), '2|4|6');
    const added = grid.addColumn();
    grid.moveColumn(2, 0);
    assertEqual(grid.columns[0].id, added.id);
    assertEqual(values(grid, 'col_b'), '2|4|6');
    assertEqual(grid.getColumn('col_b').formulas[0], '=C2[1]*2');
    dispose();
  });

  test('a column inserted at the left keeps the formulas on their source', () => {
    const { grid, dispose } = newGrid();
    grid.addColumn({ position: 0 });
    assertEqual(values(grid, 'col_b'), '2|4|6');
    dispose();
  });

  test('undo of a move restores the formula text', () => {
    const { grid, dispose } = newGrid();
    grid.addColumn();
    grid.moveColumn(2, 0);
    grid.undo();
    assertEqual(grid.getColumn('col_b').formulas[0], '=C1[1]*2');
    assertEqual(values(grid, 'col_b'), '2|4|6');
    dispose();
  });

  test('removing a column in front shifts the references back', () => {
    const { grid, dispose } = newGrid();
    const added = grid.addColumn({ position: 0 });
    grid.removeColumn(added.id);
    assertEqual(grid.getColumn('col_b').formulas[0], '=C1[1]*2');
    assertEqual(values(grid, 'col_b'), '2|4|6');
    dispose();
  });

  test('undo of a removal restores references to both the removed column and its neighbour', () => {
    const { grid, dispose } = newGrid();
    const mid = grid.addColumn({ position: 1 });        // X | mid | Doppelt
    grid.setCellValue(mid.id, 0, 5);
    grid.setCellFormula('col_b', 1, '=C2[1]+C1[2]');    // mid[1] + X[2] = 7
    grid.removeColumn(mid.id);
    grid.undo();
    assertEqual(grid.getColumn('col_b').formulas[1], '=C2[1]+C1[2]');
    assertEqual(grid.getColumn('col_b').formulas[0], '=C1[1]*2');
    assertEqual(grid.getColumn('col_b').values[1], 7);
    dispose();
  });
});

suite('DataGrid column refs — removed column', () => {
  function gridWithMiddleColumn() {
    const env = newGrid();
    const { grid } = env;
    const mid = grid.addColumn({ position: 1 });        // X | mid | Doppelt
    grid.setCellValue(mid.id, 0, 5);
    grid.setCellFormula('col_b', 1, '=C2[1]+C1[2]');    // mid[1] + X[2] = 7
    return { ...env, mid };
  }

  test('a reference to the removed column becomes #REF!', () => {
    const { grid, mid, dispose } = gridWithMiddleColumn();
    grid.removeColumn(mid.id);
    assertEqual(grid.getColumn('col_b').formulas[1], '=#REF!+C1[2]');
    assertEqual(grid.getColumn('col_b').formulas[0], '=C1[1]*2');
    assertEqual(grid.getColumn('col_b').values[1], null);
    assertEqual(evaluateFormula(grid.getColumn('col_b').formulas[1], grid).error, '#REF!');
    dispose();
  });

  test('redo of the removal writes #REF! again', () => {
    const { grid, mid, dispose } = gridWithMiddleColumn();
    grid.removeColumn(mid.id);
    grid.undo();
    grid.redo();
    assertEqual(grid.getColumn('col_b').formulas[1], '=#REF!+C1[2]');
    dispose();
  });
});

suite('remapColumnRefs', () => {
  const swap = (n) => ({ 1: 2, 2: 1 }[n] ?? n);

  test('rewrites cell, bare, pinned and range references', () => {
    assertEqual(remapColumnRefs('=C1[2]+$C2[$3]+SUM(C1:C2)+MEAN(C1)', swap),
      '=C2[2]+$C1[$3]+SUM(C2:C1)+MEAN(C2)');
  });

  test('leaves names, strings and function names alone', () => {
    assertEqual(remapColumnRefs("=COUNTIF('C1', \"C1\")+LOG10(C1)", swap),
      "=COUNTIF('C1', \"C1\")+LOG10(C2)");
  });

  test('replaces a reference mapped to #REF!, pin and row index included', () => {
    const removeSecond = (n) => ({ 1: 1, 2: '#REF!', 3: 2 }[n] ?? null);
    assertEqual(remapColumnRefs('=$C2[$5]+C3[2]+SUM(C1:C2)', removeSecond),
      '=#REF!+C2[2]+SUM(C1:#REF!)');
  });

  test('keeps a reference whose column no longer exists', () => {
    assertEqual(remapColumnRefs('=C3*2', () => null), '=C3*2');
  });
});

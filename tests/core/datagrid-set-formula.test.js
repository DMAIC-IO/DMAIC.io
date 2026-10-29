/**
 * Tests for DataGrid.setCellFormula in js/core/datagrid/datagrid.js — the
 * common sink of the cell editor, the worksheet's formula editor and the
 * worksheet agent facade.
 *
 * Zwei Spalten, die Formeln stehen in der zweiten: eine Formel in C1, die C1
 * liest, wäre ein Selbstbezug. `'=C1[2]*2'` ist 20*2 = 40 — und genau der Wert,
 * den col_b Zeile 2 vorher trägt. `_applyUndo` schließt mit `render()`, und
 * `recalcAllFormulas` rechnet eine zurückgeholte Formel sofort wieder aus;
 * nur so ist „Undo stellt Wert und Formel her“ prüfbar.
 *
 * Runs in the browser test runner — uses a detached <div> as the grid container.
 */

import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { DataGrid } from '../../js/core/datagrid/datagrid.js';

const FORMULA = '=C1[2]*2';   // C1 Zeile 2 = 20 → 40

function newGrid() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const grid = new DataGrid(container);
  grid.setData([
    { id: 'col_a', name: 'Yield', type: 'numeric', values: [10, 20, 30], format: {} },
    { id: 'col_b', name: 'Doppelt', type: 'numeric', values: [1, 40, 3], format: {} },
  ]);
  return { grid, dispose: () => container.remove() };
}

/** Collect the payloads of one grid event. */
function collect(grid, event) {
  const seen = [];
  grid.on(event, (e) => seen.push(e));
  return seen;
}

suite('DataGrid setCellFormula — formula', () => {
  test('stores the trimmed formula, its value, one undo entry and cell:changed', () => {
    const { grid, dispose } = newGrid();
    const changed = collect(grid, 'cell:changed');
    const before = grid.history._index;

    const r = grid.setCellFormula('col_b', 0, '  =C1[1]*2 ');

    assertDeepEqual(r, { value: 20, error: null });
    const col = grid.getColumn('col_b');
    assertEqual(col.formulas[0], '=C1[1]*2');
    assertEqual(col.values[0], 20);
    assertEqual(grid.history._index, before + 1);
    const entry = grid.history._stack[grid.history._index];
    assertEqual(entry.type, 'cell-edit');
    assertEqual(entry.oldFormula, null);
    assertEqual(entry.newFormula, '=C1[1]*2');
    assertDeepEqual(changed, [{ columnId: 'col_b', rowIndex: 0, oldValue: 1, newValue: 20 }]);
    dispose();
  });

  test('a failing formula is stored, the value is null and the error is returned', () => {
    const { grid, dispose } = newGrid();
    const r = grid.setCellFormula('col_b', 0, '=C1[1]/0');
    assertEqual(r.value, null);
    assertEqual(typeof r.error, 'string');
    assertEqual(grid.getColumn('col_b').formulas[0], '=C1[1]/0');
    assertEqual(grid.getColumn('col_b').values[0], null);
    dispose();
  });

  test('undo restores the previous formula and value, redo the new one', () => {
    const { grid, dispose } = newGrid();
    const col = grid.getColumn('col_b');
    col.formulas = [null, FORMULA, null];

    grid.setCellFormula('col_b', 1, '=C1[3]*2');
    assertEqual(col.values[1], 60);

    grid.undo();
    assertEqual(col.formulas[1], FORMULA);
    assertEqual(col.values[1], 40);

    grid.redo();
    assertEqual(col.formulas[1], '=C1[3]*2');
    assertEqual(col.values[1], 60);
    dispose();
  });

  test('a row past the end extends the sheet', () => {
    const { grid, dispose } = newGrid();
    const r = grid.setCellFormula('col_b', 3, '=C1[1]*2');
    assertEqual(grid.rowCount, 4);
    assertEqual(r.value, 20);
    assertEqual(grid.getColumn('col_b').formulas[3], '=C1[1]*2');
    dispose();
  });
});

suite('DataGrid setCellFormula — locks and unknown targets', () => {
  test('a locked column writes nothing, emits cell:edit-blocked and returns null', () => {
    const { grid, dispose } = newGrid();
    grid.setColumnLock('col_b', { lock: 'soft' });
    const blocked = collect(grid, 'cell:edit-blocked');
    const changed = collect(grid, 'cell:changed');
    const before = grid.history._index;

    assertEqual(grid.setCellFormula('col_b', 0, FORMULA), null);

    const col = grid.getColumn('col_b');
    assertEqual(col.values[0], 1);
    assertEqual(col.formulas?.[0] ?? null, null);
    assertEqual(grid.history._index, before);
    assertEqual(blocked.length, 1);
    assertEqual(blocked[0].columnId, 'col_b');
    assertEqual(changed.length, 0);
    dispose();
  });

  test('a locked column with a plain value also writes nothing (one blocked event)', () => {
    const { grid, dispose } = newGrid();
    grid.setColumnLock('col_b', { lock: 'hard' });
    const blocked = collect(grid, 'cell:edit-blocked');
    assertEqual(grid.setCellFormula('col_b', 0, '7'), null);
    assertEqual(grid.getColumn('col_b').values[0], 1);
    assertEqual(blocked.length, 1);
    dispose();
  });

  test('bypassLock writes into a soft-locked column', () => {
    const { grid, dispose } = newGrid();
    grid.setColumnLock('col_b', { lock: 'soft' });
    const r = grid.setCellFormula('col_b', 0, FORMULA, { bypassLock: true });
    assertDeepEqual(r, { value: 40, error: null });
    dispose();
  });

  test('unknown column and negative row return null', () => {
    const { grid, dispose } = newGrid();
    assertEqual(grid.setCellFormula('nope', 0, FORMULA), null);
    assertEqual(grid.setCellFormula('col_b', -1, FORMULA), null);
    assertEqual(grid.getColumn('col_b').formulas?.[0] ?? null, null);
    dispose();
  });
});

suite('DataGrid setCellFormula — plain values go through setCellValue', () => {
  test('a plain value replaces a formula; undo brings the formula back', () => {
    const { grid, dispose } = newGrid();
    const col = grid.getColumn('col_b');
    col.formulas = [null, FORMULA, null];

    const r = grid.setCellFormula('col_b', 1, '7');

    assertDeepEqual(r, { value: 7, error: null });
    assertEqual(col.formulas[1], null);
    grid.undo();
    assertEqual(col.formulas[1], FORMULA);
    assertEqual(col.values[1], 40);
    dispose();
  });

  test('an empty text clears the cell and its formula', () => {
    const { grid, dispose } = newGrid();
    const col = grid.getColumn('col_b');
    col.formulas = [null, FORMULA, null];
    const r = grid.setCellFormula('col_b', 1, '');
    assertDeepEqual(r, { value: null, error: null });
    assertEqual(col.values[1], null);
    assertEqual(col.formulas[1], null);
    dispose();
  });
});

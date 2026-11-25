/**
 * Tests for moving a block of cells (DataGrid.moveCells, the border drag and
 * moveCellRefs): the cells move, and the formula references follow them.
 *
 * Spec: docs/superpowers/specs/2026-11-25-datagrid-cell-block-move-design.md
 *
 * Runs in the browser test runner — the grid container sits in document.body.
 */

import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { DataGrid } from '../../js/core/datagrid/datagrid.js';
import { moveCellRefs } from '../../js/core/datagrid/datagrid-formula.js';

/** X | Y | Z (formulas), six rows. */
function newGrid() {
  const container = document.createElement('div');
  container.style.cssText = 'width:900px;height:400px;position:relative';
  document.body.appendChild(container);
  const grid = new DataGrid(container);
  grid.setData([
    { id: 'x', name: 'X', type: 'numeric', values: [1, 2, 3, 4, null, null], format: {} },
    { id: 'y', name: 'Y', type: 'numeric', values: [10, 20, 30, 40, null, null], format: {} },
    { id: 'z', name: 'Z', type: 'numeric', values: [null, null, null, null, null, null], format: {} },
  ]);
  grid.setCellFormula('z', 0, '=C1[1]+C2[1]');
  grid.setCellFormula('z', 1, '=SUM(C1[1]:C1[2])');
  grid.setCellFormula('z', 2, '=C2[3]');
  grid.setCellFormula('z', 3, '=C1[4]');
  return { grid, container, dispose: () => { grid.destroy?.(); container.remove(); } };
}

const col = (grid, id) => grid.getColumn(id);
const join = (arr) => arr.map(v => v ?? '').join('|');

suite('DataGrid.moveCells', () => {
  test('moves the values and empties the source', () => {
    const { grid, dispose } = newGrid();
    assertTrue(grid.moveCells({ c1: 0, c2: 0, r1: 0, r2: 1 }, 0, 4));
    assertEqual(join(col(grid, 'x').values), '||3|4|1|2');
    dispose();
  });

  test('references to the moved cells follow them', () => {
    const { grid, dispose } = newGrid();
    grid.moveCells({ c1: 0, c2: 0, r1: 0, r2: 1 }, 0, 4);
    assertEqual(col(grid, 'z').formulas[0], '=C1[5]+C2[1]');
    assertEqual(col(grid, 'z').formulas[1], '=SUM(C1[5]:C1[6])');
    assertEqual(col(grid, 'z').values[0], 11);
    assertEqual(col(grid, 'z').values[1], 3);
    dispose();
  });

  test('a reference to an overwritten cell becomes #REF!', () => {
    const { grid, dispose } = newGrid();
    grid.moveCells({ c1: 0, c2: 0, r1: 0, r2: 1 }, 0, 2);   // X[1..2] onto X[3..4]
    assertEqual(join(col(grid, 'x').values), '||1|2||');
    assertEqual(col(grid, 'z').formulas[3], '=#REF!');
    assertEqual(col(grid, 'z').formulas[0], '=C1[3]+C2[1]');
    assertEqual(col(grid, 'z').values[3], null);
    dispose();
  });

  test('a moved formula keeps pointing at the same cells', () => {
    const { grid, dispose } = newGrid();
    grid.moveCells({ c1: 2, c2: 2, r1: 2, r2: 2 }, 2, 5);
    assertEqual(col(grid, 'z').formulas[5], '=C2[3]');
    assertEqual(col(grid, 'z').values[5], 30);
    assertEqual(col(grid, 'z').formulas[2] ?? null, null);
    assertEqual(col(grid, 'z').values[2], null);
    dispose();
  });

  test('a formula moved together with its source still sees it', () => {
    const { grid, dispose } = newGrid();
    grid.moveCells({ c1: 1, c2: 2, r1: 2, r2: 2 }, 1, 5);   // Y[3] and Z[3]='=C2[3]'
    assertEqual(col(grid, 'z').formulas[5], '=C2[6]');
    assertEqual(col(grid, 'z').values[5], 30);
    dispose();
  });

  test('undo and redo restore values and formulas', () => {
    const { grid, dispose } = newGrid();
    grid.moveCells({ c1: 0, c2: 0, r1: 0, r2: 1 }, 0, 2);
    grid.undo();
    assertEqual(join(col(grid, 'x').values), '1|2|3|4||');
    assertEqual(col(grid, 'z').formulas[3], '=C1[4]');
    assertEqual(col(grid, 'z').values[3], 4);
    grid.redo();
    assertEqual(join(col(grid, 'x').values), '||1|2||');
    assertEqual(col(grid, 'z').formulas[3], '=#REF!');
    dispose();
  });

  test('selects the target and emits cells:moved', () => {
    const { grid, dispose } = newGrid();
    let payload = null;
    grid.on('cells:moved', (p) => { payload = p; });
    grid.moveCells({ c1: 0, c2: 1, r1: 0, r2: 0 }, 1, 4);
    assertEqual(JSON.stringify(payload.to), JSON.stringify({ c1: 1, c2: 2, r1: 4, r2: 4 }));
    const s = grid.selection;
    assertEqual([s.startCol, s.startRow, s.endCol, s.endRow].join(','), '1,4,2,4');
    dispose();
  });

  test('clamps the target into the grid', () => {
    const { grid, dispose } = newGrid();
    grid.moveCells({ c1: 0, c2: 0, r1: 0, r2: 1 }, 0, 99);
    assertEqual(join(col(grid, 'x').values), '||3|4|1|2');
    dispose();
  });

  test('a locked column in the target refuses the move', () => {
    const { grid, dispose } = newGrid();
    col(grid, 'y').meta = { lock: 'hard' };
    let blocked = null;
    grid.on('cell:edit-blocked', (p) => { blocked = p; });
    assertEqual(grid.moveCells({ c1: 0, c2: 0, r1: 0, r2: 0 }, 1, 4), false);
    assertEqual(blocked?.action, 'move');
    assertEqual(join(col(grid, 'x').values), '1|2|3|4||');
    dispose();
  });
});

suite('DataGrid cell move — border drag', () => {
  const mouse = (type, target, x, y) => target.dispatchEvent(new MouseEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0,
  }));
  const td = (container, c, r) => container.querySelector(`td[data-col-idx="${c}"][data-row-idx="${r}"]`);

  test('dragging the selection border moves the block', () => {
    const { grid, container, dispose } = newGrid();
    grid.setSelection({ startCol: 0, startRow: 0, endCol: 0, endRow: 1, activeCol: 0, activeRow: 0 });
    const from = td(container, 0, 0).getBoundingClientRect();
    const to = td(container, 0, 4).getBoundingClientRect();
    mouse('mousedown', td(container, 0, 0), from.left + 2, from.top + from.height / 2);
    mouse('mousemove', td(container, 0, 4), to.left + 2, to.top + to.height / 2);
    mouse('mouseup', td(container, 0, 4), to.left + 2, to.top + to.height / 2);
    assertEqual(join(col(grid, 'x').values), '||3|4|1|2');
    dispose();
  });

  test('a click inside the selection, away from the border, still selects', () => {
    const { grid, container, dispose } = newGrid();
    grid.setSelection({ startCol: 0, startRow: 0, endCol: 1, endRow: 1, activeCol: 0, activeRow: 0 });
    const box = td(container, 1, 1).getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    mouse('mousedown', td(container, 1, 1), x, y);
    mouse('mouseup', td(container, 1, 1), x, y);
    assertEqual(join(col(grid, 'x').values), '1|2|3|4||');
    assertEqual(grid.selection.startCol, 1);
    dispose();
  });
});

suite('moveCellRefs', () => {
  const names = ['X', 'Y', null];
  const move = (extra) => ({
    src: { c1: 1, c2: 1, r1: 1, r2: 2 }, dCol: 0, dRow: 3,
    colName: (n) => names[n - 1] ?? null,
    colIndex: (name) => { const i = names.indexOf(name); return i < 0 ? null : i + 1; },
    ...extra,
  });

  test('keeps $ markers and leaves column refs alone', () => {
    assertEqual(moveCellRefs('=$C1[$2]+C1+SUM(C1:C2)+C2[1]', move()),
      '=$C1[$5]+C1+SUM(C1:C2)+C2[1]');
  });

  test('a partly moved cell range stays', () => {
    assertEqual(moveCellRefs('=SUM(C1[2]:C1[3])', move()), '=SUM(C1[2]:C1[3])');
  });

  test('a reference into the overwritten area becomes #REF!', () => {
    assertEqual(moveCellRefs('=C1[4]+$C1[$5]+C1[6]', move()), '=#REF!+#REF!+C1[6]');
  });

  test('a named reference takes the target column name, or C<n>', () => {
    assertEqual(moveCellRefs("='X'[1]*2", move({ dCol: 1, dRow: 0 })), "='Y'[1]*2");
    assertEqual(moveCellRefs("='X'[1]*2", move({ dCol: 2, dRow: 0 })), '=C3[1]*2');
    assertEqual(moveCellRefs("='X'[1]", move()), "='X'[4]");
  });

  test('leaves string literals alone', () => {
    assertEqual(moveCellRefs('=IF(C1[1]>0, "C1[1]", 0)', move()), '=IF(C1[4]>0, "C1[1]", 0)');
  });
});

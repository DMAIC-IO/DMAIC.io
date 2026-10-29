/**
 * Tests for DataGrid.sortByColumn in js/core/datagrid/datagrid.js.
 *
 * With a direction the sort is absolute (header menu, agent facade);
 * without one it toggles asc → desc → off (Shift+click on the header).
 *
 * Runs in the browser test runner — uses a detached <div> as the grid container.
 */

import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { DataGrid } from '../../js/core/datagrid/datagrid.js';

function newGrid() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const grid = new DataGrid(container);
  grid.setData([
    { id: 'col_x', name: 'X', type: 'numeric', values: [20, 10, 30], format: {} },
    { id: 'col_y', name: 'Y', type: 'text', values: ['b', 'a', 'c'], format: {} },
  ]);
  return { grid, dispose: () => container.remove() };
}

const xs = (grid) => grid.getColumn('col_x').values;
const ys = (grid) => grid.getColumn('col_y').values;

suite('DataGrid sortByColumn — absolute direction', () => {
  test('desc twice stays desc (no toggle)', () => {
    const { grid, dispose } = newGrid();
    assertEqual(grid.sortByColumn(0, 'desc'), true);
    assertEqual(grid.sortByColumn(0, 'desc'), false);
    assertDeepEqual(xs(grid), [30, 20, 10]);
    assertDeepEqual(ys(grid), ['c', 'b', 'a']);
    assertEqual(grid.sortCol, 0);
    assertEqual(grid.sortDir, 'desc');
    dispose();
  });

  test('asc after a Shift+click asc stays asc instead of toggling', () => {
    const { grid, dispose } = newGrid();
    grid.sortByColumn(0);                 // toggle: asc
    grid.sortByColumn(0, 'asc');
    assertDeepEqual(xs(grid), [10, 20, 30]);
    assertEqual(grid.sortDir, 'asc');
    dispose();
  });

  test('a direction on another column sorts by that column', () => {
    const { grid, dispose } = newGrid();
    grid.sortByColumn(0, 'asc');
    assertEqual(grid.sortByColumn(1, 'desc'), true);
    assertDeepEqual(ys(grid), ['c', 'b', 'a']);
    assertEqual(grid.sortCol, 1);
    dispose();
  });

  test('an unchanged order adds no undo entry', () => {
    const { grid, dispose } = newGrid();
    grid.sortByColumn(0, 'asc');          // [10, 20, 30]
    grid.sortByColumn(0, 'asc');          // no-op
    grid.undo();                          // undoes the FIRST sort
    assertDeepEqual(xs(grid), [20, 10, 30]);
    dispose();
  });

  test('invalid index returns false and changes nothing', () => {
    const { grid, dispose } = newGrid();
    assertEqual(grid.sortByColumn(5, 'asc'), false);
    assertDeepEqual(xs(grid), [20, 10, 30]);
    assertEqual(grid.sortCol, null);
    dispose();
  });
});

suite('DataGrid sortByColumn — toggle without direction (Shift+click)', () => {
  test('asc → desc → off; off keeps the rows', () => {
    const { grid, dispose } = newGrid();
    assertEqual(grid.sortByColumn(0), true);
    assertDeepEqual(xs(grid), [10, 20, 30]);
    assertEqual(grid.sortDir, 'asc');
    assertEqual(grid.sortByColumn(0), true);
    assertDeepEqual(xs(grid), [30, 20, 10]);
    assertEqual(grid.sortDir, 'desc');
    assertEqual(grid.sortByColumn(0), false);
    assertEqual(grid.sortCol, null);
    assertEqual(grid.sortDir, null);
    assertDeepEqual(xs(grid), [30, 20, 10]);
    dispose();
  });

  test('undo restores the order before the sort', () => {
    const { grid, dispose } = newGrid();
    grid.sortByColumn(0, 'desc');
    grid.undo();
    assertDeepEqual(xs(grid), [20, 10, 30]);
    assertDeepEqual(ys(grid), ['b', 'a', 'c']);
    assertEqual(grid.sortCol, null);
    dispose();
  });
});

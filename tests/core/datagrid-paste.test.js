/**
 * Tests for pasting into the DataGrid (importFromClipboard + copy/paste roundtrip).
 *
 * Regression: copying a 2×3 block whose first row holds a text or empty cell
 * and pasting it back dropped the first row — the paste guessed it was a header.
 *
 * Runs in the browser test runner — uses a detached <div> as the grid container.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { DataGrid } from '../../js/core/datagrid/datagrid.js';

function newGrid(columns) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const grid = new DataGrid(container);
  grid.setData(columns);
  return { grid, dispose: () => { grid.destroy?.(); container.remove(); } };
}

function select(grid, startCol, startRow, endCol, endRow) {
  grid.setSelection({ startCol, startRow, endCol, endRow, activeCol: startCol, activeRow: startRow });
}

/** Simulate Ctrl+C on the grid and return the clipboard text. */
function copy(grid) {
  let text = '';
  grid._onCopy({ preventDefault() {}, clipboardData: { setData: (_t, v) => { text = v; } } });
  return text;
}

/** Simulate Ctrl+V on the grid with the given clipboard text. */
function paste(grid, text) {
  grid._onPaste({ preventDefault() {}, clipboardData: { getData: () => text } });
}

suite('DataGrid paste — copy/paste roundtrip', () => {
  test('a block whose first row holds a text cell keeps all three rows', () => {
    const { grid, dispose } = newGrid([
      { id: 'a', name: 'Teil', type: 'text', values: ['A', 'B', 'C', null, null, null, null], format: {} },
      { id: 'b', name: 'Wert', type: 'numeric', values: [1, 2, 3, null, null, null, null], format: {} },
    ]);
    select(grid, 0, 0, 1, 2);
    const text = copy(grid);
    select(grid, 0, 4, 0, 4);
    paste(grid, text);
    assertEqual(grid.getColumn('a').values.slice(4, 7).join('|'), 'A|B|C');
    assertEqual(grid.getColumn('b').values.slice(4, 7).join('|'), '1|2|3');
    dispose();
  });

  test('a block whose first row holds an empty cell keeps all three rows', () => {
    const { grid, dispose } = newGrid([
      { id: 'a', name: 'X', type: 'numeric', values: [null, 2, 3, null, null, null, null], format: {} },
      { id: 'b', name: 'Y', type: 'numeric', values: [1, 2, 3, null, null, null, null], format: {} },
    ]);
    select(grid, 0, 0, 1, 2);
    const text = copy(grid);
    select(grid, 0, 4, 0, 4);
    paste(grid, text);
    assertEqual(grid.getColumn('b').values.slice(4, 7).join('|'), '1|2|3');
    assertEqual(grid.getColumn('a').values[5], 2);
    dispose();
  });

  test('an empty row inside the copied block stays in place', () => {
    const { grid, dispose } = newGrid([
      { id: 'a', name: 'X', type: 'numeric', values: [1, null, 3, null, null, null, null], format: {} },
      { id: 'b', name: 'Y', type: 'numeric', values: [4, null, 6, null, null, null, null], format: {} },
    ]);
    select(grid, 0, 0, 1, 2);
    const text = copy(grid);
    select(grid, 0, 4, 0, 4);
    paste(grid, text);
    assertEqual(grid.getColumn('a').values[4], 1);
    assertEqual(grid.getColumn('a').values[5], null);
    assertEqual(grid.getColumn('a').values[6], 3);
    dispose();
  });
});

suite('DataGrid paste — external data', () => {
  test('a header row of names is still taken as column names', () => {
    const { grid, dispose } = newGrid([
      { id: 'a', name: '', type: 'numeric', values: [null, null, null], format: {} },
    ]);
    select(grid, 0, 0, 0, 0);
    grid.importFromClipboard('Durchmesser\n1,5\n2,5\n');
    assertEqual(grid.getColumn('a').name, 'Durchmesser');
    assertEqual(grid.getColumn('a').values.slice(0, 2).join('|'), '1.5|2.5');
    dispose();
  });

  test('a first row mixing text and numbers is data, not a header', () => {
    const { grid, dispose } = newGrid([
      { id: 'a', name: '', type: 'text', values: [null, null, null], format: {} },
      { id: 'b', name: '', type: 'numeric', values: [null, null, null], format: {} },
    ]);
    select(grid, 0, 0, 0, 0);
    grid.importFromClipboard('A\t1\nB\t2');
    assertEqual(grid.getColumn('a').values.slice(0, 2).join('|'), 'A|B');
    assertEqual(grid.getColumn('a').name, '');
    dispose();
  });
});

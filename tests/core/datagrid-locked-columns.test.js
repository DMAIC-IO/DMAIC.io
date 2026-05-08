/**
 * Tests for column-lock mechanics in js/core/datagrid/datagrid.js.
 *
 * Locks come in two flavors:
 *   - 'soft': app may write (via setCellValue with { bypassLock: true }), user may not edit.
 *   - 'hard': nobody writes; column is also undeletable and its type cannot change.
 *
 * Runs in the browser test runner — uses a detached <div> as the grid container.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { DataGrid } from '../../js/core/datagrid/datagrid.js';

function newGrid() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const grid = new DataGrid(container);
  // Seed with two columns, three rows
  grid.setData([
    { id: 'col_a', name: 'Yield', type: 'numeric', values: [10, 20, 30], format: {} },
    { id: 'col_b', name: 'GroupID', type: 'numeric', values: [1, 1, 2], format: {} },
  ]);
  return { grid, container, dispose: () => container.remove() };
}

suite('DataGrid locks — schema & API', () => {
  test('new column has meta=null by default', () => {
    const { grid, dispose } = newGrid();
    const col = grid.getColumn('col_a');
    assertEqual(col.meta, null);
    dispose();
  });

  test('setColumnLock("soft") populates meta', () => {
    const { grid, dispose } = newGrid();
    grid.setColumnLock('col_b', { lock: 'soft', managedBy: 'doe-planner', reason: 'group-id' });
    const col = grid.getColumn('col_b');
    assertEqual(col.meta.lock, 'soft');
    assertEqual(col.meta.managedBy, 'doe-planner');
    assertEqual(col.meta.reason, 'group-id');
    dispose();
  });

  test('setColumnLock(null) clears meta', () => {
    const { grid, dispose } = newGrid();
    grid.setColumnLock('col_b', { lock: 'hard' });
    assertEqual(grid.getColumn('col_b').meta.lock, 'hard');
    grid.setColumnLock('col_b', null);
    assertEqual(grid.getColumn('col_b').meta, null);
    dispose();
  });

  test('lock survives setData → getData round-trip', () => {
    const { grid, dispose } = newGrid();
    grid.setColumnLock('col_b', { lock: 'hard', managedBy: 'doe-planner', reason: 'design-factor' });
    const snapshot = grid.getData();
    const grid2Container = document.createElement('div');
    document.body.appendChild(grid2Container);
    const grid2 = new DataGrid(grid2Container);
    grid2.setData(snapshot);
    const restored = grid2.getColumn(snapshot[1].id);
    assertEqual(restored.meta.lock, 'hard');
    assertEqual(restored.meta.reason, 'design-factor');
    grid2Container.remove();
    dispose();
  });
});

suite('DataGrid locks — setCellValue', () => {
  test('soft-locked column rejects write without bypassLock', () => {
    const { grid, dispose } = newGrid();
    grid.setColumnLock('col_a', { lock: 'soft' });
    grid.setCellValue('col_a', 0, 999);
    assertEqual(grid.getColumn('col_a').values[0], 10); // unchanged
    dispose();
  });

  test('soft-locked column accepts write with bypassLock=true', () => {
    const { grid, dispose } = newGrid();
    grid.setColumnLock('col_a', { lock: 'soft' });
    grid.setCellValue('col_a', 0, 999, { bypassLock: true });
    assertEqual(grid.getColumn('col_a').values[0], 999);
    dispose();
  });

  test('hard-locked column rejects write without bypassLock', () => {
    const { grid, dispose } = newGrid();
    grid.setColumnLock('col_a', { lock: 'hard' });
    grid.setCellValue('col_a', 0, 999);
    assertEqual(grid.getColumn('col_a').values[0], 10);
    dispose();
  });

  test('emits cell:edit-blocked event with lock + reason', () => {
    const { grid, dispose } = newGrid();
    grid.setColumnLock('col_a', { lock: 'soft', reason: 'replicate-aggregate' });
    let payload = null;
    grid.on('cell:edit-blocked', (p) => { payload = p; });
    grid.setCellValue('col_a', 0, 999);
    assertEqual(payload?.lock, 'soft');
    assertEqual(payload?.reason, 'replicate-aggregate');
    assertEqual(payload?.columnId, 'col_a');
    dispose();
  });
});

suite('DataGrid locks — column structural ops', () => {
  test('removeColumn rejects hard-locked column', () => {
    const { grid, dispose } = newGrid();
    grid.setColumnLock('col_a', { lock: 'hard' });
    grid.removeColumn('col_a');
    assertEqual(grid.getColumn('col_a').name, 'Yield'); // still there
    dispose();
  });

  test('removeColumn allows soft-locked column (user can detach helper)', () => {
    const { grid, dispose } = newGrid();
    grid.setColumnLock('col_a', { lock: 'soft' });
    grid.removeColumn('col_a');
    assertEqual(grid.getColumn('col_a'), null);
    dispose();
  });

  test('removeColumn with bypassLock clears even hard locks', () => {
    const { grid, dispose } = newGrid();
    grid.setColumnLock('col_a', { lock: 'hard' });
    grid.removeColumn('col_a', { bypassLock: true });
    assertEqual(grid.getColumn('col_a'), null);
    dispose();
  });

  test('_setColumnType rejected on any lock', () => {
    const { grid, dispose } = newGrid();
    grid.setColumnLock('col_a', { lock: 'soft' });
    grid._setColumnType(0, 'text');
    assertEqual(grid.getColumn('col_a').type, 'numeric'); // unchanged
    dispose();
  });
});

suite('DataGrid locks — paste & clear', () => {
  test('paste into locked column is blocked entirely', () => {
    const { grid, dispose } = newGrid();
    grid.setColumnLock('col_a', { lock: 'soft' });
    grid.setSelection({ startCol: 0, startRow: 0, endCol: 0, endRow: 0, activeCol: 0, activeRow: 0 });
    let blocked = null;
    grid.on('cell:edit-blocked', (p) => { blocked = p; });
    grid.importFromClipboard('111\n222\n333');
    assertEqual(grid.getColumn('col_a').values[0], 10); // not overwritten
    assertEqual(blocked?.action, 'paste');
    dispose();
  });

  test('clear-selection skips locked cells, emits block event', () => {
    const { grid, dispose } = newGrid();
    grid.setColumnLock('col_a', { lock: 'soft' });
    grid.setSelection({ startCol: 0, startRow: 0, endCol: 1, endRow: 1, activeCol: 0, activeRow: 0 });
    let blocked = false;
    grid.on('cell:edit-blocked', () => { blocked = true; });
    grid._clearSelection();
    // col_a (locked) values preserved
    assertEqual(grid.getColumn('col_a').values[0], 10);
    assertEqual(grid.getColumn('col_a').values[1], 20);
    // col_b (unlocked) cleared
    assertEqual(grid.getColumn('col_b').values[0], null);
    assertEqual(grid.getColumn('col_b').values[1], null);
    assertEqual(blocked, true);
    dispose();
  });
});

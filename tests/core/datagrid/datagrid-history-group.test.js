/**
 * DataGrid: eine Verlaufsgruppe ist ein Rückgängig-Schritt.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { DataGrid } from '../../../js/core/datagrid/datagrid.js';

function newGrid() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const grid = new DataGrid(container);
  grid.setData([{ id: 'col_a', name: 'Yield', type: 'numeric', values: [1, 2], format: {} }]);
  return { grid, dispose: () => { grid.destroy?.(); container.remove(); } };
}

const snapshot = (grid) => grid.columns.map(c => [c.name, [...c.values]]);

suite('DataGrid — Verlaufsgruppen', () => {
  test('group undo reverts all actions in reverse order', () => {
    const { grid, dispose } = newGrid();
    try {
      const before = snapshot(grid);
      grid.history.begin();
      const col = grid.addColumn();
      grid.setCellValue(col.id, 0, 7);
      grid.setCellValue('col_a', 1, 9);
      grid.history.end();
      const after = snapshot(grid);
      assertEqual(grid.history.peek()?.type, 'group');
      grid.undo();
      assertDeepEqual(snapshot(grid), before);
      assertEqual(grid.canUndo(), false, 'ein Schritt für die ganze Gruppe');
      grid.redo();
      assertDeepEqual(snapshot(grid), after);
      assertEqual(grid.canRedo(), false);
    } finally { dispose(); }
  });

  test('undo of a group emits one undo event', () => {
    const { grid, dispose } = newGrid();
    try {
      let undos = 0;
      grid.on('undo', () => { undos += 1; });
      grid.history.begin();
      grid.setCellValue('col_a', 0, 5);
      grid.setCellValue('col_a', 1, 6);
      grid.history.end();
      grid.undo();
      assertEqual(undos, 1);
      assertDeepEqual([...grid.getColumn('col_a').values], [1, 2]);
    } finally { dispose(); }
  });
});

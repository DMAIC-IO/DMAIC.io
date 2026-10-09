/**
 * Tests für DataGrid.importCSVText — EIN Parse-Pfad für Datei und Agent.
 * Braucht ein Dokument (DataGrid rendert), läuft daher nur im Browser-Runner.
 */
import { suite, test, beforeEach, assertEqual, assertDeepEqual } from '../test-utils.js';
import { DataGrid } from '../../js/core/datagrid/datagrid.js';

let host;
let grid;

suite('DataGrid.importCSVText', () => {
  beforeEach(() => {
    document.querySelectorAll('.grid-host').forEach((el) => el.remove());
    host = document.createElement('div');
    host.className = 'grid-host';
    document.body.appendChild(host);
    grid = new DataGrid(host, { rows: 5, cols: 2 });
  });

  test('imports a header row plus numeric data', () => {
    const out = grid.importCSVText('Länge;Breite\n1,5;2\n3;4\n', 'test.csv');
    assertEqual(out.columns, 2);
    assertEqual(out.rows, 2);
    assertEqual(grid.columns[0].name, 'Länge');
    assertDeepEqual(grid.columns[1].values.slice(0, 2), [2, 4]);
  });

  test('a purely numeric first row is data, not a header', () => {
    grid.importCSVText('1;2\n3;4\n', 'test.csv');
    assertEqual(grid.columns[0].name, '');
    assertEqual(grid.rowCount, 2);
  });

  test('the import is undoable — the same history path as the file import', () => {
    grid.importCSVText('A;B\n1;2\n', 'test.csv');
    grid.undo();
    assertEqual(grid.columns[0].name, '');
  });

  test('empty text changes nothing', () => {
    const before = grid.columns.length;
    const out = grid.importCSVText('   \n', 'test.csv');
    assertEqual(out.rows, 0);
    assertEqual(grid.columns.length, before);
  });
});

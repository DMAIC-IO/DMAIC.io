import { suite, test, assert, assertEqual, assertDeepEqual } from '../test-utils.js';
import { inferRole } from '../../js/core/datagrid/datagrid-roles.js';
import { readWorksheetState } from '../../js/modules/worksheet/worksheet-read.js';

const saved = () => ({
  sheets: [
    {
      id: 'sheet_1', name: 'Blatt 1',
      state: {
        rowCount: 3,
        columns: [
          { id: 'a', name: 'A', type: 'numeric', values: [1, 2, null], format: { decimals: 2, currencySymbol: '€' } },
          { id: 'b', name: 'B', type: 'text', values: ['x', 'y', 'z'], roleManual: true, role: 'factor' },
          { id: 'c', name: 'C', type: 'numeric', values: [null, 2, null], formulas: [null, '=A1*2', null], meta: { lock: 'hard' } },
        ],
      },
    },
    { id: 'sheet_2', name: 'Blatt 2', state: null },
  ],
});

suite('readWorksheetState', () => {
  test('ohne Optionen: Verzeichnis, rowCount, Deskriptor, keine values', () => {
    const r = readWorksheetState(saved());
    assertDeepEqual(r.sheets, [{ id: 'sheet_1', name: 'Blatt 1' }, { id: 'sheet_2', name: 'Blatt 2' }]);
    assertEqual(r.sheetId, 'sheet_1');
    assertEqual(r.rowCount, 3);
    assertEqual(r.rows.$bulk, true);
    assertEqual(r.rows.kind, 'table');
    assertEqual(r.rows.rowCount, 3);
    assert(r.columns.every(c => !('values' in c)), 'keine values');
  });

  test('Parität: Rolle, roleConfirmed, nur FORMAT_KEYS', () => {
    const r = readWorksheetState(saved());
    const [a, b] = r.columns;
    assertDeepEqual(a.format, { decimals: 2 });
    assertEqual(a.roleConfirmed, false);
    assertEqual(a.role, inferRole(saved().sheets[0].state.columns[0]));
    assertEqual(b.role, 'factor');
    assertEqual(b.roleConfirmed, true);
    assertEqual(a.unit, null);
  });

  test('columns: Reihenfolge, values, meta', () => {
    const r = readWorksheetState(saved(), { columns: ['c', 'a'] });
    assertDeepEqual(r.columns.map(c => c.id), ['c', 'a']);
    assertDeepEqual(r.columns[1].values, [1, 2, null]);
    assertDeepEqual(r.columns[0].meta, { lock: 'hard' });
  });

  test('columns + fields rows/formulas beziehen sich nur auf die Auswahl', () => {
    const a = readWorksheetState(saved(), { columns: ['a'], fields: ['rows', 'formulas'] });
    assertDeepEqual(a.rows, [[1], [2], [null]]);
    assertDeepEqual(a.formulas, []);
    const c = readWorksheetState(saved(), { columns: ['c'], fields: ['formulas'] });
    assertDeepEqual(c.formulas, [{ columnId: 'c', row: 1, formula: '=A1*2' }]);
  });

  test('unbekannte Spalte wirft unknown_column', () => {
    let err = null;
    try { readWorksheetState(saved(), { columns: ['x'] }); } catch (e) { err = e; }
    assert(err, 'wirft');
    assertEqual(err.code, 'unknown_column');
    assert(err.message.startsWith('unknown_column: x'), err.message);
  });

  test('columns kein Array wirft', () => {
    let err = null;
    try { readWorksheetState(saved(), { columns: 'a' }); } catch (e) { err = e; }
    assert(err && err.message.includes('columns must be an array of column ids'), 'Meldung');
  });

  test('Blatt ohne Stand: columns [], rowCount 0', () => {
    const r = readWorksheetState(saved(), { sheetId: 'sheet_2' });
    assertDeepEqual(r.columns, []);
    assertEqual(r.rowCount, 0);
    assertEqual(r.sheetId, 'sheet_2');
  });

  test('null: leere Lesefläche', () => {
    const r = readWorksheetState(null);
    assertDeepEqual(r.sheets, []);
    assertEqual(r.sheetId, null);
    assertEqual(r.rowCount, 0);
  });

  test('ohne fields rows baut keine Zeilen (kein Zugriff auf values[r])', () => {
    const n = 1000;
    let reads = 0;
    const counted = new Proxy(Array.from({ length: n }, (_, i) => i), {
      get(t, k, r) { if (typeof k === 'string' && /^\d+$/.test(k)) reads++; return Reflect.get(t, k, r); },
    });
    const big = { sheets: [{ id: 's', name: 'S', state: { rowCount: n, columns: [{ id: 'a', name: 'a', type: 'numeric', role: 'continuous', values: counted }] } }] };
    const r = readWorksheetState(big);
    assertEqual(r.rowCount, n);
    assertEqual(reads, 0);
    readWorksheetState(big, { fields: ['rows'] });
    assertEqual(reads, n);
  });

  test('ohne rowCount im Stand: Zeilenzahl aus der längsten Spalte', () => {
    const old = { sheets: [{ id: 's', name: 'S', state: { columns: [
      { id: 'a', name: 'A', type: 'numeric', values: [1, 2] },
      { id: 'b', name: 'B', type: 'numeric', values: [3, 4, 5] },
      { id: 'c', name: 'C', type: 'numeric' },
    ] } }] };
    const out = readWorksheetState(old, { columns: ['a', 'b', 'c'] });
    assertEqual(out.rowCount, 3);
    assertDeepEqual(out.columns.map(c => c.values), [[1, 2, null], [3, 4, 5], [null, null, null]]);
    const noCols = readWorksheetState({ sheets: [{ id: 's', name: 'S', state: { columns: [] } }] });
    assertEqual(noCols.rowCount, 0);
  });

  test('ein gesetztes rowCount gilt, auch wenn Spalten länger sind', () => {
    const st = { sheets: [{ id: 's', name: 'S', state: { rowCount: 1, columns: [{ id: 'a', name: 'A', type: 'numeric', values: [1, 2] }] } }] };
    assertEqual(readWorksheetState(st).rowCount, 1);
  });
});

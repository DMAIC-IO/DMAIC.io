/**
 * Tests for core/model.js — Feldart table().
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../test-utils.js';
import { defineModel, list, object, text, table, describeType, setFields, markTableChanged } from '../../js/core/model.js';
import { TableData } from '../../js/core/table-data.js';

const M = defineModel({ fields: { sheets: list(object({ id: text(), data: table() })) } });
const withTable = (data) => ({ sheets: [{ id: 's', data }] });

suite('table()', () => {
  test('Vorgabe ist eine leere TableData', () => {
    const t = TableData.empty();
    const m = M.fromJSON(withTable(t.toJSON()));
    assertEqual(m.sheets[0].data.rowCount, 0);
    const D = defineModel({ fields: { t: table() } });
    const d = new D();
    assertTrue(d.t instanceof TableData);
    assertEqual(d.t.rowCount, 0);
  });

  test('fromJSON liefert eine TableData', () => {
    const m = M.fromJSON(withTable({ rowCount: 2, columns: [[1, 'x']] }));
    assertTrue(m.sheets[0].data instanceof TableData);
    assertDeepEqual(m.sheets[0].data.columns, [[1, 'x']]);
  });

  test('ungültige Zelle wirft mit Spalte und Zeile', () => {
    assertThrows(() => M.fromJSON(withTable({ rowCount: 1, columns: [[{}]] })), /columns\[0\]\[0\]: invalid cell/);
  });

  test('zu kurze Spalte wirft ohne repair', () => {
    assertThrows(() => M.fromJSON(withTable({ rowCount: 2, columns: [[1]] })), /columns\[0\]/);
  });

  test('repair macht ungültige Zellen zu null und füllt auf', () => {
    const m = M.fromJSON(withTable({ rowCount: 2, columns: [[{}], [1, NaN]] }), { repair: true });
    assertDeepEqual(m.sheets[0].data.columns, [[null, null], [1, null]]);
  });

  test('toJSON liefert schlichte Arrays und lädt wieder', () => {
    const m = M.fromJSON(withTable({ rowCount: 2, columns: [[1, 'x'], [true, null]] }));
    const j = m.toJSON();
    assertTrue(!(j.sheets[0].data instanceof TableData));
    assertDeepEqual(j.sheets[0].data, { rowCount: 2, columns: [[1, 'x'], [true, null]] });
    const back = M.fromJSON(JSON.parse(JSON.stringify(j)));
    assertDeepEqual(back.toJSON(), j);
  });

  test('setFields mit derselben TableData behält die Identität', () => {
    const D = defineModel({ fields: { t: table() } });
    const d = new D();
    const t = TableData.fromJSON({ rowCount: 1, columns: [[1]] });
    setFields(d, { t });
    assertEqual(d.t, t);
  });

  test('setFields prüft eine bestehende TableData vollständig', () => {
    const D = defineModel({ fields: { t: table() } });
    const d = new D();
    const t = TableData.fromJSON({ rowCount: 1, columns: [[1]] });
    t.columns[0][0] = {};
    assertThrows(() => setFields(d, { t }), /invalid cell/);
  });

  test('markTableChanged erhöht t.rev und $tableRev, nicht in toJSON', () => {
    const D = defineModel({ fields: { t: table() } });
    const d = new D();
    assertEqual(d.$tableRev, 0);
    markTableChanged(d, d.t);
    assertEqual(d.t.rev, 1);
    assertEqual(d.$tableRev, 1);
    assertTrue(!('$tableRev' in d.toJSON()));
    assertTrue(!d.hasContent());
  });

  test('describeType ist table', () => {
    assertEqual(describeType(table()), 'table');
  });

  test('table() trägt bulk-Vorgaben', () => {
    const s = table();
    assertEqual(s.bulk, true);
    assertEqual(s.bulkKind, 'table');
  });
});

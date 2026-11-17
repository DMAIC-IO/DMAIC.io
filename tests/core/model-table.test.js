/**
 * Tests for core/model.js — Feldart table().
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../test-utils.js';
import { defineModel, list, object, text, number, command, table, describeType, setFields, markTableChanged, replaceFields, checkInvariantsAfter, cell, unchecked } from '../../js/core/model.js';
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

suite('table() Rückschreibpfade', () => {
  test('replaceFields behält TableData, auch verschachtelt', () => {
    const src = M.fromJSON(withTable({ rowCount: 1, columns: [[1]] }));
    const dst = new M();
    replaceFields(dst, src);
    const t = dst.sheets[0].data;
    assertTrue(t instanceof TableData);
    assertTrue(t !== src.sheets[0].data);
    assertDeepEqual(t.columns, [[1]]);
    const D = defineModel({ fields: { t: table() } });
    const a = new D(); const b = new D();
    setFields(a, { t: TableData.fromJSON({ rowCount: 1, columns: [[2]] }) });
    replaceFields(b, a);
    assertTrue(b.t instanceof TableData);
  });

  test('Invarianten-Rückfall lässt TableData stehen', () => {
    const D = defineModel({
      fields: { t: table(), n: number() },
      invariants: { small: { fields: ['t', 'n'], test() { return this.n < 5; } } },
      commands: { bad: command({ params: {}, run() { this.n = 9; this.t = TableData.empty(1); } }) },
    });
    const d = new D();
    assertThrows(() => d.bad({}), /small|n/);
    assertTrue(d.t instanceof TableData);
    assertThrows(() => checkInvariantsAfter(d, 't', () => { d.n = 9; d.t = TableData.empty(1); }), /small|n/);
    assertTrue(d.t instanceof TableData);
  });

  test('table({ default }) liefert eine TableData', () => {
    const D = defineModel({ fields: { t: table({ default: { rowCount: 1, columns: [[3]] } }) } });
    const d = new D();
    assertTrue(d.t instanceof TableData);
    assertDeepEqual(d.t.columns, [[3]]);
  });
});

suite('cell() und unchecked()', () => {
  const D = defineModel({
    fields: {},
    commands: {
      put: command({
        params: { values: list(cell()), raw: unchecked({ type: 'Array<{ to: string }>', optional: true }) },
        returns: list(cell()),
        run({ values }) { return values; },
      }),
    },
  });

  test('cell() nimmt endliche Zahl, Text, Wahrheitswert und null', () => {
    const d = new D();
    assertDeepEqual(d.put({ values: [1, 'x', true, null, -0.5] }), [1, 'x', true, null, -0.5]);
  });

  test('cell() lehnt Objekt, NaN, Unendlich und undefined ab', () => {
    const d = new D();
    assertThrows(() => d.put({ values: [{}] }), /values\[0\].*allowed: a number, text, true\/false or null/);
    assertThrows(() => d.put({ values: [NaN] }), /values\[0\]/);
    assertThrows(() => d.put({ values: [Infinity] }), /values\[0\]/);
    assertThrows(() => d.put({ values: [undefined] }), /values\[0\]/);
  });

  test('unchecked() reicht den Wert ungeprüft durch', () => {
    const d = new D();
    const raw = [{ to: 'x', anything: { deep: 1 } }];
    d.put({ values: [], raw });
    assertEqual(d.put({ values: [], raw: 7 }).length, 0);
  });

  test('describeType: cell und unchecked mit Typtext', () => {
    assertEqual(describeType(cell()), 'number|string|boolean|null');
    assertEqual(describeType(list(cell())), 'Array<number|string|boolean|null>');
    assertEqual(describeType(unchecked({ type: 'Array<{ to: string }>' })), 'Array<{ to: string }>');
    assertEqual(describeType(unchecked()), 'any');
  });

  test('Vorgabe beider ist null', () => {
    const F = defineModel({ fields: { c: cell(), u: unchecked() } });
    const f = new F();
    assertEqual(f.c, null);
    assertEqual(f.u, null);
  });
});

/**
 * Multivariate Regelkarte: Migration der Altform (domain/migrations.js) samt
 * Beispiel. Die Fälle des alten `fromJSON` stammen aus
 * `tests/modules/multivariate-control-chart.test.js`.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/multivariate-control-chart/domain/model.js';
import { from0 } from '../../../js/modules/multivariate-control-chart/domain/migrations.js';

const plain = (v) => JSON.parse(JSON.stringify(v));
/** Laden wie der Kern (`loadModule`): mit Reparatur. */
const load = (json) => State.fromJSON(json, { repair: true });

const WS = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f';
const col = (c) => ({ instanceId: WS, sheetId: 'sheet_1', columnId: c });

/** Instanz der Altprojekt-Fixture (Stand des Altmoduls, ohne `_schema`). */
const LEGACY = {
  columnRefs: [col('col_mvcc_druck'), col('col_mvcc_temp'), col('col_mvcc_dichte')],
  alpha: 0.01,
  baselineCount: 20,
  exampleWorksheetId: null,
};

/** Das Beispiel `spc-multivariate-t2` in der Altform (Stand vor der Umstellung). */
const EXAMPLE_OLD = {
  columnRefs: [
    { instanceId: '__source__', sheetId: 'sheet-spc-multi', columnId: 'c-x1' },
    { instanceId: '__source__', sheetId: 'sheet-spc-multi', columnId: 'c-x2' },
  ],
  alpha: 0.0027,
  sourceWorksheetFile: 'worksheets/spc-multivariate-correlated.json',
};

suite('multivariate-control-chart: Migration — Altprojekt', () => {
  test('Altfixture: Spalten, α und Phase I übernommen, Diagramm leer', () => {
    const m = load(LEGACY);
    assertDeepEqual(plain(m.columnRefs), LEGACY.columnRefs);
    assertEqual(m.alpha, 0.01);
    assertEqual(m.baselineCount, 20);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), {});
    assertEqual(m.hasContent(), true);
  });

  test('Fremdschlüssel entfallen', () => {
    const out = from0({ ...LEGACY, foo: 1, result: { n: 3 }, sourceWorksheetFile: 'x.json', errorMsg: 'x' });
    assertDeepEqual(Object.keys(out).sort(), ['alpha', 'baselineCount', 'columnRefs'], 'exampleWorksheetId null entfällt');
    const json = plain(load({ ...LEGACY, foo: 1, sourceWorksheetFile: 'x.json' }).toJSON());
    assertEqual('foo' in json, false);
    assertEqual('sourceWorksheetFile' in json, false);
  });

  test('Beispiel in Altform ergibt dasselbe wie die neue Datei', () => {
    const a = plain(load(EXAMPLE_OLD).toJSON());
    const b = plain(load({ _schema: { version: '1.0' }, columnRefs: EXAMPLE_OLD.columnRefs }).toJSON());
    assertDeepEqual(a, b);
    const m = load(EXAMPLE_OLD);
    assertEqual(m.alpha, 0.0027);
    assertEqual(m.baselineCount, null);
    assertDeepEqual(plain(m.columnRefs), EXAMPLE_OLD.columnRefs);
  });
});

suite('multivariate-control-chart: Migration — Fälle des alten fromJSON', () => {
  test('{}, null und undefined ergeben die Vorgaben', () => {
    for (const v of [{}, null, undefined]) {
      const m = load(v);
      assertDeepEqual(plain(m.columnRefs), [], String(v));
      assertEqual(m.alpha, 0.0027, String(v));
      assertEqual(m.baselineCount, null, String(v));
      assertEqual(m.exampleWorksheetId, null, String(v));
      assertEqual(m.hasContent(), false, String(v));
    }
  });

  test('Rundweg ist verlustfrei', () => {
    const m = load({ ...LEGACY, exampleWorksheetId: 'ws-7' });
    const r = load(plain(m.toJSON()));
    assertDeepEqual(plain(r.toJSON()), plain(m.toJSON()));
    assertEqual(r.baselineCount, 20);
    assertEqual(r.exampleWorksheetId, 'ws-7');
    const n = load(plain(load({ columnRefs: LEGACY.columnRefs, baselineCount: null }).toJSON()));
    assertEqual(n.baselineCount, null, 'null bleibt im Rundweg');
  });

  test('columnRefs keine Liste → []', () => {
    for (const v of ['nope', 5, { a: 1 }, null]) {
      assertDeepEqual(plain(load({ columnRefs: v }).columnRefs), [], String(v));
      assertDeepEqual(from0({ columnRefs: v }).columnRefs, [], String(v));
    }
  });

  test('ein ungültiger Eintrag fällt einzeln weg; vollständige werden Text', () => {
    const refs = [col('a'), {}, 'nope', null, { instanceId: 'i', sheetId: null, columnId: 'c' }, { instanceId: 1, sheetId: 2, columnId: 3 }];
    assertDeepEqual(from0({ columnRefs: refs }).columnRefs, [col('a'), { instanceId: '1', sheetId: '2', columnId: '3' }]);
    assertDeepEqual(plain(load({ columnRefs: refs }).columnRefs), [col('a'), { instanceId: '1', sheetId: '2', columnId: '3' }]);
  });

  test('Doppelte bleiben in der Migration; die Reparatur beim Laden behält das erste Vorkommen', () => {
    const refs = [col('druck'), col('temp'), col('druck'), col('dichte'), col('temp')];
    assertDeepEqual(from0({ columnRefs: refs }).columnRefs, refs, 'die Migration lässt sie stehen');
    assertDeepEqual(plain(load({ columnRefs: refs }).columnRefs), [col('druck'), col('temp'), col('dichte')]);
  });

  test('α wird übernommen, wenn endlich und 0 < α < 1', () => {
    assertEqual(load({ alpha: 0.05 }).alpha, 0.05);
    assertEqual(load({ alpha: 1e-12 }).alpha, 1e-12);
    assertEqual(load({ alpha: 0.999999 }).alpha, 0.999999);
  });

  test('α ≤ 0, ≥ 1, 0, nicht endlich oder Text → Vorgabe 0,0027', () => {
    for (const v of [-0.1, 0, 1, 1.5, Infinity, -Infinity, NaN, '0.01', 'abc', null, true]) {
      assertEqual(load({ alpha: v }).alpha, 0.0027, String(v));
      assertEqual('alpha' in from0({ alpha: v }), false, String(v));
    }
  });

  test('baselineCount: null oder fehlend bleibt null', () => {
    assertEqual(load({ baselineCount: null }).baselineCount, null);
    assertEqual(load({}).baselineCount, null);
    assertEqual(from0({}).baselineCount, null);
  });

  test('baselineCount wie parseInt: 20 bleibt, 2.7 → 2, \'12\' → 12', () => {
    assertEqual(load({ baselineCount: 20 }).baselineCount, 20);
    assertEqual(load({ baselineCount: 2.7 }).baselineCount, 2);
    assertEqual(load({ baselineCount: '12' }).baselineCount, 12);
    assertEqual(load({ baselineCount: 1 }).baselineCount, 1);
  });

  test('baselineCount unlesbar, 0 oder negativ → null', () => {
    for (const v of ['bad', 0, -3, '', NaN, true, 0.5]) {
      assertEqual(load({ baselineCount: v }).baselineCount, null, String(v));
    }
  });

  test('exampleWorksheetId, das kein Text ist, entfällt', () => {
    assertEqual(load({ exampleWorksheetId: 5 }).exampleWorksheetId, null);
    assertEqual('exampleWorksheetId' in from0({ exampleWorksheetId: 5 }), false);
    assertEqual(load({ exampleWorksheetId: 'ws-1' }).exampleWorksheetId, 'ws-1');
    assertEqual(load({}).exampleWorksheetId, null);
  });
});

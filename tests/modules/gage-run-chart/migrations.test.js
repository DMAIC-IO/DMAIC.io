/**
 * Messverlaufsdiagramm: Migration der Altform (domain/migrations.js), samt
 * Altprojekt-Fixture und Beispiel.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/gage-run-chart/domain/model.js';
import { from0 } from '../../../js/modules/gage-run-chart/domain/migrations.js';

const plain = (v) => JSON.parse(JSON.stringify(v));
const load = (json) => State.fromJSON(json);

const WS = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
const wsRef = (columnId) => ({ instanceId: WS, sheetId: 'sheet_1', columnId });

const GAGE_INFO = {
  name: 'Messschieber MS-07',
  date: '2026-06-07',
  reporter: 'M. Wasserthal',
  tolerance: '0,2 mm',
  misc: 'Altprojekt',
};
const EMPTY_INFO = { name: '', date: '', reporter: '', tolerance: '', misc: '' };

/** Instanz der Altprojekt-Fixture (Stand des Altmoduls, ohne `_schema`). */
const LEGACY = {
  columnRefs: {
    part: wsRef('col_grc_teil'),
    operator: wsRef('col_grc_pruefer'),
    measurement: wsRef('col_grc_d'),
  },
  refValue: '10,5',
  partsPerRow: 2,
  showOperatorMean: false,
  connectWithin: false,
  gageInfo: GAGE_INFO,
  exampleWorksheetId: null,
};

const srcRef = (columnId) => ({ instanceId: '__source__', sheetId: 'sheet-gage-run-attrib', columnId });
const EXAMPLE_INFO = {
  name: 'Sichtprüfplatz A',
  date: '2026-07-20',
  reporter: 'QS',
  tolerance: 'i.O. / n.i.O.',
  misc: 'Attributive Prüfung, 2 Wiederholungen je Prüfer',
};

/** Das Beispiel `msa-gage-run-chart-attributiv` in der Altform. */
const EXAMPLE_OLD = {
  columnRefs: { part: srcRef('c-part'), operator: srcRef('c-op'), measurement: srcRef('c-result') },
  refValue: '',
  partsPerRow: 7,
  showOperatorMean: false,
  connectWithin: true,
  gageInfo: EXAMPLE_INFO,
  sourceWorksheetFile: 'worksheets/msa-gage-run-attributiv.json',
};

suite('gage-run-chart: Migration — Altprojekt', () => {
  test('Altfixture: Spalten, Bezugswert 10,5, Streifen, Schalter, Kopfzeile', () => {
    const m = load(LEGACY);
    assertDeepEqual(plain(m.part), wsRef('col_grc_teil'));
    assertDeepEqual(plain(m.operator), wsRef('col_grc_pruefer'));
    assertDeepEqual(plain(m.measurement), wsRef('col_grc_d'));
    assertEqual(m.refValue, 10.5);
    assertEqual(m.partsPerRow, 2);
    assertEqual(m.showOperatorMean, false);
    assertEqual(m.connectWithin, false);
    assertDeepEqual(plain(m.gageInfo), GAGE_INFO);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.runStripEdits), {});
    assertEqual(m.hasContent(), true);
  });

  test('gespeichert: neue Form mit _schema, ohne columnRefs', () => {
    const json = plain(load(LEGACY).toJSON());
    assertDeepEqual(Object.keys(json).sort(), [
      '_schema', 'connectWithin', 'exampleWorksheetId', 'gageInfo', 'measurement', 'operator',
      'part', 'partsPerRow', 'refValue', 'runStripEdits', 'showOperatorMean',
    ]);
    assertEqual(json.refValue, 10.5);
  });

  test('Fremdschlüssel entfallen', () => {
    const out = from0({ ...LEGACY, foo: 1, result: { n: 3 }, sourceWorksheetFile: 'x.json' });
    for (const k of ['foo', 'result', 'sourceWorksheetFile', 'columnRefs']) assertEqual(k in out, false, k);
    const json = plain(load({ ...LEGACY, foo: 1, sourceWorksheetFile: 'x.json' }).toJSON());
    assertEqual('foo' in json, false);
    assertEqual('sourceWorksheetFile' in json, false);
    assertEqual('columnRefs' in json, false);
  });

  test('Beispiel in Altform ergibt dasselbe wie die neue Datei', () => {
    const a = plain(load(EXAMPLE_OLD).toJSON());
    const b = plain(load({
      _schema: { version: '1.0' },
      part: srcRef('c-part'),
      operator: srcRef('c-op'),
      measurement: srcRef('c-result'),
      showOperatorMean: false,
      gageInfo: EXAMPLE_INFO,
    }).toJSON());
    assertDeepEqual(a, b);
    const m = load(EXAMPLE_OLD);
    assertEqual(m.refValue, null);
    assertEqual(m.partsPerRow, 7);
    assertEqual(m.connectWithin, true);
  });
});

suite('gage-run-chart: Migration — Fälle des alten fromJSON', () => {
  test('{}, null und undefined ergeben die Vorgaben', () => {
    for (const v of [{}, null, undefined]) {
      const m = load(v);
      for (const k of ['part', 'operator', 'measurement', 'refValue', 'exampleWorksheetId']) {
        assertEqual(m[k], null, `${String(v)} ${k}`);
      }
      assertEqual(m.partsPerRow, 7, String(v));
      assertEqual(m.showOperatorMean, true, String(v));
      assertEqual(m.connectWithin, true, String(v));
      assertDeepEqual(plain(m.gageInfo), EMPTY_INFO, String(v));
      assertEqual(m.hasContent(), false, String(v));
    }
  });

  test('Rundweg ist verlustfrei', () => {
    const m = load({ ...LEGACY, exampleWorksheetId: 'ws-7' });
    const r = load(plain(m.toJSON()));
    assertDeepEqual(plain(r.toJSON()), plain(m.toJSON()));
    assertEqual(r.refValue, 10.5);
    assertEqual(r.exampleWorksheetId, 'ws-7');
  });

  test('Bezüge je Slot: vollständig wird Text, unvollständig oder kein Objekt → null', () => {
    for (const slot of ['part', 'operator', 'measurement']) {
      assertDeepEqual(from0({ columnRefs: { [slot]: { instanceId: 1, sheetId: 2, columnId: 3 } } })[slot],
        { instanceId: '1', sheetId: '2', columnId: '3' }, slot);
      for (const bad of [{}, 'nope', { instanceId: 'i' }, { instanceId: 'i', sheetId: 's' }, null, 5]) {
        assertEqual(load({ columnRefs: { [slot]: bad } })[slot], null, `${slot} ${JSON.stringify(bad)}`);
      }
    }
    assertEqual(load({ columnRefs: 'x' }).part, null, 'columnRefs kein Objekt');
  });

  test('refValue: Text über parseDecimalInput', () => {
    const cases = [['10,5', 10.5], ['20', 20], ['1.234,5', 1234.5], ['-0,5', -0.5]];
    for (const [s, v] of cases) assertEqual(load({ refValue: s }).refValue, v, s);
  });

  test('refValue: Text ohne endliche Zahl und Nicht-Text → null', () => {
    for (const s of ['', '-', '3,5x', 'Infinity', 20, NaN, true, null, {}]) {
      assertEqual(load({ refValue: s }).refValue, null, JSON.stringify(s));
    }
    assertEqual(load({}).refValue, null);
  });

  test('partsPerRow: 0/−1/„7“ → 7, 2,7 → 2, 25 → 20', () => {
    const cases = [[0, 7], [-1, 7], ['7', 7], [2.7, 2], [25, 20], [NaN, 7], [Infinity, 7], [1, 1], [20, 20]];
    for (const [v, want] of cases) assertEqual(load({ partsPerRow: v }).partsPerRow, want, String(v));
    assertEqual('partsPerRow' in from0({ partsPerRow: 0 }), false);
  });

  test('Schalter folgen !== false', () => {
    for (const k of ['showOperatorMean', 'connectWithin']) {
      assertEqual(load({ [k]: false })[k], false, k);
      for (const v of [true, undefined, null, 0, 'false']) assertEqual(load({ [k]: v })[k], true, `${k} ${String(v)}`);
    }
  });

  test('gageInfo: Fremdschlüssel entfallen, Nicht-Text wird leer', () => {
    const m = load({ gageInfo: { name: 'A', date: 5, reporter: null, extra: 'x', misc: 'M' } });
    assertDeepEqual(plain(m.gageInfo), { name: 'A', date: '', reporter: '', tolerance: '', misc: 'M' });
    assertDeepEqual(plain(load({ gageInfo: 'x' }).gageInfo), EMPTY_INFO);
  });

  test('exampleWorksheetId, das kein Text ist, entfällt', () => {
    assertEqual(load({ exampleWorksheetId: 5 }).exampleWorksheetId, null);
    assertEqual('exampleWorksheetId' in from0({ exampleWorksheetId: 5 }), false);
    assertEqual(load({ exampleWorksheetId: 'ws-1' }).exampleWorksheetId, 'ws-1');
  });
});

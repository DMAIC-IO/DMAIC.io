/**
 * Regelkarte seltener Ereignisse: Migration der Altform
 * (domain/migrations.js) samt Beispiel. Die Fälle des alten `fromJSON`
 * stammen aus dem Unit-Test der Altform (`tests/modules/rare-event-chart.test.js`).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/rare-event-chart/domain/model.js';
import { from0 } from '../../../js/modules/rare-event-chart/domain/migrations.js';

const plain = (v) => JSON.parse(JSON.stringify(v));
/** Laden wie der Kern (`loadModule`): mit Reparatur. */
const load = (json) => State.fromJSON(json, { repair: true });

const WS = '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d';
const COL = { instanceId: WS, sheetId: 'sheet_1', columnId: 'col_rec_tage' };

/** Instanz der Altprojekt-Fixture (Stand des Altmoduls, ohne `_schema`). */
export const LEGACY = { chartTypeId: 't', columnRef: COL, exampleWorksheetId: null };

const SRC_REF = { instanceId: '__source__', sheetId: 'sheet-spc-rare', columnId: 'c-tage' };
const FILE = 'worksheets/spc-rare-event-days.json';

/** Das Beispiel in der Altform (Stand vor der Umstellung). */
const EXAMPLE_OLD = { chartTypeId: 't', columnRef: SRC_REF, sourceWorksheetFile: FILE };
/** Das Beispiel in der neuen Form (wie `resources/examples/projects/`, ohne Dateiverweis). */
const EXAMPLE_NEW = { _schema: { version: '1.0' }, chartTypeId: 't', columnRef: SRC_REF };

suite('rare-event-chart: Migration — Altprojekt', () => {
  test('Altfixture: alle Felder übernommen, Diagramm leer', () => {
    const m = load(LEGACY);
    assertEqual(m.chartTypeId, 't');
    assertDeepEqual(plain(m.columnRef), COL);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), {});
    assertEqual(m.hasContent(), true);
  });

  test('die Altfixture lädt ohne Reparatur auch streng', () => {
    assertDeepEqual(plain(State.fromJSON(LEGACY).toJSON()), plain(load(LEGACY).toJSON()));
  });

  test('Fremdschlüssel entfallen', () => {
    const out = from0({ ...LEGACY, foo: 1, result: { n: 3 }, sourceWorksheetFile: 'x.json', pickableColumns: {} });
    assertDeepEqual(Object.keys(out).sort(), ['chartTypeId', 'columnRef'], 'exampleWorksheetId null entfällt');
    const json = plain(load({ ...LEGACY, foo: 1, sourceWorksheetFile: 'x.json' }).toJSON());
    for (const k of ['foo', 'sourceWorksheetFile', 'result']) assertEqual(k in json, false, k);
  });

  test('Beispiel in Altform ergibt dasselbe wie die neue Datei', () => {
    assertDeepEqual(plain(load(EXAMPLE_OLD).toJSON()), plain(load(EXAMPLE_NEW).toJSON()));
    const m = load(EXAMPLE_OLD);
    assertEqual(m.chartTypeId, 't');
    assertDeepEqual(plain(m.columnRef), SRC_REF);
  });
});

suite('rare-event-chart: Migration — Fälle des alten fromJSON', () => {
  test('{}, null und undefined ergeben die Vorgaben', () => {
    for (const v of [{}, null, undefined]) {
      const m = load(v);
      assertEqual(m.chartTypeId, 'g', String(v));
      assertEqual(m.columnRef, null, String(v));
      assertEqual(m.exampleWorksheetId, null, String(v));
      assertDeepEqual(plain(m.chart), {}, String(v));
      assertEqual(m.hasContent(), false, String(v));
    }
  });

  test('Rundweg ist verlustfrei', () => {
    const m = load({ ...LEGACY, exampleWorksheetId: 'ws-7' });
    const r = load(plain(m.toJSON()));
    assertDeepEqual(plain(r.toJSON()), plain(m.toJSON()));
    assertEqual(r.exampleWorksheetId, 'ws-7');
    assertEqual(r.chartTypeId, 't');
  });

  test('chartTypeId: t bleibt, alles andere wird g', () => {
    assertEqual(load({ chartTypeId: 't' }).chartTypeId, 't');
    assertEqual(load({ chartTypeId: 'g' }).chartTypeId, 'g');
    for (const v of ['p', 'invalid', 'T', 1, null, '']) assertEqual(load({ chartTypeId: v }).chartTypeId, 'g', String(v));
  });

  test('columnRef: vollständig übernommen, Werte als Text', () => {
    assertDeepEqual(plain(load({ columnRef: COL }).columnRef), COL);
    assertDeepEqual(plain(load({ columnRef: { instanceId: 1, sheetId: 2, columnId: 3 } }).columnRef),
      { instanceId: '1', sheetId: '2', columnId: '3' });
  });

  test('columnRef kein Objekt, unvollständig oder mit leerem Text → null', () => {
    for (const v of ['nope', 5, [], { instanceId: 'i', sheetId: 's' }, { instanceId: 'i', sheetId: null, columnId: 'c' },
      { instanceId: '', sheetId: 's', columnId: 'c' }, { instanceId: 'i', sheetId: 's', columnId: '' }]) {
      assertEqual(load({ columnRef: v }).columnRef, null, JSON.stringify(v));
    }
  });

  test('exampleWorksheetId: Text bleibt, sonst entfällt es', () => {
    assertEqual(load({ exampleWorksheetId: 'ws-1' }).exampleWorksheetId, 'ws-1');
    for (const v of [5, {}, true]) {
      assertEqual(load({ exampleWorksheetId: v }).exampleWorksheetId, null, String(v));
      assertEqual('exampleWorksheetId' in from0({ exampleWorksheetId: v }), false, String(v));
    }
    assertEqual(load({}).exampleWorksheetId, null);
  });
});

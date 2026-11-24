/**
 * Verteilungstest: Migration der Altform (domain/migrations.js), samt
 * Golden-Fixtures der Exporte und der vier geteilten Beispiele.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/distribution-fit/domain/model.js';
import { from0 } from '../../../js/modules/distribution-fit/domain/migrations.js';

const plain = (v) => JSON.parse(JSON.stringify(v));
const load = (json) => State.fromJSON(json);

const WS = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';

/** Instanz der Altprojekt-Fixture (Stand des Altmoduls, ohne `_schema`). */
const LEGACY = {
  columnRef: { instanceId: WS, sheetId: 'sheet_1', columnId: 'col_df_f' },
  dataType: 'discrete',
  exampleWorksheetId: null,
};

/** Die vier geteilten Beispiele in der Altform (ohne `sourceWorksheetFile`). */
const EXAMPLES_OLD = {
  'distfit-normal': { sheetId: 'sheet-dist-normal', columnId: 'c-messwert' },
  'distfit-exponential': { sheetId: 'sheet-dist-exponential', columnId: 'c-wartezeit' },
  'distfit-weibull': { sheetId: 'sheet-dist-weibull', columnId: 'c-lebensdauer' },
  'distfit-lognormal': { sheetId: 'sheet-dist-lognormal', columnId: 'c-zykluszeit' },
};

const FIXTURES = new URL('../../fixtures/exports/', import.meta.url);

/** @param {string} file @returns {Promise<any>} */
async function fetchJSON(file) {
  const res = await fetch(new URL(file, FIXTURES), { cache: 'no-cache' });
  return res.json();
}

suite('distribution-fit: Migration — Altprojekt', () => {
  test('Altfixture: Spalte und Datentyp übernommen, Diagramm leer', () => {
    const m = load(LEGACY);
    assertDeepEqual(plain(m.columnRef), LEGACY.columnRef);
    assertEqual(m.dataType, 'discrete');
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), {});
    assertEqual(m.hasContent(), true);
  });

  test('Fremdschlüssel entfallen', () => {
    const out = from0({ ...LEGACY, foo: 1, _result: { x: 1 }, sourceWorksheetFile: 'x.json', errorMsg: 'x' });
    for (const k of ['foo', '_result', 'sourceWorksheetFile', 'errorMsg']) assertEqual(k in out, false, k);
    const json = plain(load({ ...LEGACY, foo: 1, sourceWorksheetFile: 'x.json' }).toJSON());
    assertEqual('foo' in json, false);
    assertEqual('sourceWorksheetFile' in json, false);
  });

  for (const [id, { sheetId, columnId }] of Object.entries(EXAMPLES_OLD)) {
    test(`Beispiel ${id}: Altform ergibt dasselbe wie die neue Datei`, () => {
      const columnRef = { instanceId: '__source__', sheetId, columnId };
      const a = plain(load({ columnRef, dataType: 'continuous', sourceWorksheetFile: 'w.json' }).toJSON());
      const b = plain(load({ _schema: { version: '1.0' }, columnRef, dataType: 'continuous' }).toJSON());
      assertDeepEqual(a, b);
      assertEqual(load({ columnRef, dataType: 'continuous' }).dataType, 'continuous');
    });
  }
});

suite('distribution-fit: Migration — Fälle des alten fromJSON', () => {
  test('{}, null und undefined ergeben die Vorgaben', () => {
    for (const v of [{}, null, undefined]) {
      const m = load(v);
      assertEqual(m.columnRef, null, String(v));
      assertEqual(m.dataType, 'auto', String(v));
      assertEqual(m.exampleWorksheetId, null, String(v));
      assertEqual(m.hasContent(), false, String(v));
    }
  });

  test('columnRef: vollständig wird Text, unvollständig oder kein Objekt → null', () => {
    assertDeepEqual(plain(load({ columnRef: { instanceId: 'inst1', sheetId: 'sheet1', columnId: 'col1' } }).columnRef),
      { instanceId: 'inst1', sheetId: 'sheet1', columnId: 'col1' });
    assertDeepEqual(from0({ columnRef: { instanceId: 1, sheetId: 2, columnId: 3 } }).columnRef,
      { instanceId: '1', sheetId: '2', columnId: '3' });
    assertEqual(load({ columnRef: { instanceId: 'inst1' } }).columnRef, null);
    assertEqual(load({ columnRef: 'invalid' }).columnRef, null);
    assertEqual(load({ columnRef: 42 }).columnRef, null);
    assertEqual(load({ columnRef: { instanceId: '', sheetId: 's', columnId: 'c' } }).columnRef, null);
  });

  test('dataType: gültig bleibt, unbekannt → auto', () => {
    assertEqual(load({ dataType: 'continuous' }).dataType, 'continuous');
    assertEqual(load({ dataType: 'discrete' }).dataType, 'discrete');
    assertEqual(load({ dataType: 'auto' }).dataType, 'auto');
    for (const v of ['invalid', 'normal', '', null, 3]) {
      assertEqual('dataType' in from0({ dataType: v }), false, String(v));
      assertEqual(load({ dataType: v }).dataType, 'auto', String(v));
    }
  });

  test('exampleWorksheetId: Text bleibt, sonst null', () => {
    assertEqual(load({ exampleWorksheetId: 'ws-123' }).exampleWorksheetId, 'ws-123');
    assertEqual(load({ exampleWorksheetId: null }).exampleWorksheetId, null);
    assertEqual(load({ exampleWorksheetId: 42 }).exampleWorksheetId, null);
    assertEqual('exampleWorksheetId' in from0({ exampleWorksheetId: 42 }), false);
  });

  test('Rundreise: toJSON/fromJSON behält Spalte und Datentyp', () => {
    const m = load(LEGACY);
    const back = State.fromJSON(plain(m.toJSON()));
    assertDeepEqual(plain(back.columnRef), LEGACY.columnRef);
    assertEqual(back.dataType, 'discrete');
    assertEqual(plain(m.toJSON())._schema.version, '1.0');
  });
});

suite('distribution-fit: Migration — Golden-Fixtures', () => {
  test('v0.2.0_single_project: Instanz v2-distfit', async () => {
    const json = await fetchJSON('v0.2.0_single_project.json');
    const m = State.fromJSON(json.moduleStates['v2-distfit']);
    assertDeepEqual(plain(m.columnRef), { instanceId: 'v2-worksheet', sheetId: 'vs-sh-1', columnId: 'vc-width' });
    assertEqual(m.dataType, 'continuous');
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), {});
  });

  test('v0.3.0_single_project: Instanz inst-dist', async () => {
    const json = await fetchJSON('v0.3.0_single_project.json');
    const m = State.fromJSON(json.moduleStates['inst-dist']);
    assertDeepEqual(plain(m.columnRef), { instanceId: 'inst-worksheet', sheetId: 'sheet-1', columnId: 'col-time' });
    assertEqual(m.dataType, 'continuous');
    assertEqual(m.hasContent(), true);
  });
});

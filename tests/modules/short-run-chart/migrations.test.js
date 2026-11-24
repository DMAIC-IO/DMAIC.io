/**
 * Kurzserien-Regelkarte (Z-MR): Migration der Altform
 * (domain/migrations.js) samt Beispiel. Die Fälle des alten `fromJSON`
 * stammen aus dem Unit-Test der Altform.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/short-run-chart/domain/model.js';
import { from0 } from '../../../js/modules/short-run-chart/domain/migrations.js';

const plain = (v) => JSON.parse(JSON.stringify(v));
/** Laden wie der Kern (`loadModule`): mit Reparatur. */
const load = (json) => State.fromJSON(json, { repair: true });

const WS = '6b7c8d9e-0f1a-4b2c-9d3e-4f5a6b7c8d9e';
const MASS = { instanceId: WS, sheetId: 'sheet_1', columnId: 'col_src_mass' };
const TEIL = { instanceId: WS, sheetId: 'sheet_1', columnId: 'col_src_teil' };

/** Instanz der Altprojekt-Fixture (Stand des Altmoduls, ohne `_schema`). */
export const LEGACY = { valuesRef: MASS, groupsRef: TEIL, exampleWorksheetId: null };

const SRC_VALUES = { instanceId: '__source__', sheetId: 'sheet-spc-short', columnId: 'c-messwert' };
const SRC_GROUPS = { instanceId: '__source__', sheetId: 'sheet-spc-short', columnId: 'c-setup' };
const FILE = 'worksheets/spc-short-run-setups.json';

/** Das Beispiel in der Altform (Stand vor der Umstellung). */
const EXAMPLE_OLD = { valuesRef: SRC_VALUES, groupsRef: SRC_GROUPS, sourceWorksheetFile: FILE };
/** Das Beispiel in der neuen Form (ohne Dateiverweis). */
const EXAMPLE_NEW = { _schema: { version: '1.0' }, valuesRef: SRC_VALUES, groupsRef: SRC_GROUPS };

suite('short-run-chart: Migration — Altprojekt', () => {
  test('Altfixture: beide Bezüge übernommen, Teilkarten leer', () => {
    const m = load(LEGACY);
    assertDeepEqual(plain(m.valuesRef), MASS);
    assertDeepEqual(plain(m.groupsRef), TEIL);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.charts), {});
    assertEqual(m.hasContent(), true);
  });

  test('die Altfixture lädt ohne Reparatur auch streng', () => {
    assertDeepEqual(plain(State.fromJSON(LEGACY).toJSON()), plain(load(LEGACY).toJSON()));
  });

  test('Fremdschlüssel entfallen', () => {
    const out = from0({ ...LEGACY, foo: 1, result: { n: 3 }, sourceWorksheetFile: 'x.json', pickableColumns: {}, chartEdits: {} });
    assertDeepEqual(Object.keys(out).sort(), ['groupsRef', 'valuesRef'], 'exampleWorksheetId null entfällt');
    const json = plain(load({ ...LEGACY, foo: 1, sourceWorksheetFile: 'x.json' }).toJSON());
    for (const k of ['foo', 'sourceWorksheetFile', 'result']) assertEqual(k in json, false, k);
  });

  test('Beispiel in Altform ergibt dasselbe wie die neue Datei', () => {
    assertDeepEqual(plain(load(EXAMPLE_OLD).toJSON()), plain(load(EXAMPLE_NEW).toJSON()));
    const m = load(EXAMPLE_OLD);
    assertDeepEqual(plain(m.valuesRef), SRC_VALUES);
    assertDeepEqual(plain(m.groupsRef), SRC_GROUPS);
  });
});

suite('short-run-chart: Migration — Fälle des alten fromJSON', () => {
  test('{}, null und undefined ergeben die Vorgaben', () => {
    for (const v of [{}, null, undefined]) {
      const m = load(v);
      assertEqual(m.valuesRef, null, String(v));
      assertEqual(m.groupsRef, null, String(v));
      assertEqual(m.exampleWorksheetId, null, String(v));
      assertDeepEqual(plain(m.charts), {}, String(v));
      assertEqual(m.hasContent(), false, String(v));
    }
  });

  test('Rundweg ist verlustfrei (gesetzte und leere Bezüge)', () => {
    for (const s of [{ ...LEGACY, exampleWorksheetId: 'ws-7' }, { valuesRef: null, groupsRef: null }, { groupsRef: TEIL }]) {
      const m = load(s);
      const r = load(plain(m.toJSON()));
      assertDeepEqual(plain(r.toJSON()), plain(m.toJSON()), JSON.stringify(s));
    }
    assertEqual(load(plain(load({ ...LEGACY, exampleWorksheetId: 'ws-7' }).toJSON())).exampleWorksheetId, 'ws-7');
  });

  test('Bezüge: je für sich übernommen, Werte als Text', () => {
    assertDeepEqual(plain(load({ valuesRef: MASS }).valuesRef), MASS);
    assertEqual(load({ valuesRef: MASS }).groupsRef, null);
    assertDeepEqual(plain(load({ groupsRef: TEIL }).groupsRef), TEIL);
    assertEqual(load({ groupsRef: TEIL }).valuesRef, null);
    const num = { instanceId: 1, sheetId: 2, columnId: 3 };
    for (const k of ['valuesRef', 'groupsRef']) {
      assertDeepEqual(plain(load({ [k]: num })[k]), { instanceId: '1', sheetId: '2', columnId: '3' }, k);
    }
  });

  test('Bezug kein Objekt, unvollständig oder mit leerem Text → null', () => {
    const bad = ['nope', 5, [], { instanceId: 'i', sheetId: 's' }, { instanceId: 'i', sheetId: null, columnId: 'c' },
      { instanceId: '', sheetId: 's', columnId: 'c' }, { instanceId: 'i', sheetId: 's', columnId: '' }];
    for (const k of ['valuesRef', 'groupsRef']) {
      for (const v of bad) assertEqual(load({ ...LEGACY, [k]: v })[k], null, `${k} ${JSON.stringify(v)}`);
    }
    assertDeepEqual(plain(load({ ...LEGACY, valuesRef: 'nope' }).groupsRef), TEIL, 'der andere Bezug bleibt');
  });

  test('exampleWorksheetId: Text bleibt, sonst entfällt es; Altstand ohne das Feld', () => {
    assertEqual(load({ exampleWorksheetId: 'ws-1' }).exampleWorksheetId, 'ws-1');
    for (const v of [5, {}, true]) {
      assertEqual(load({ exampleWorksheetId: v }).exampleWorksheetId, null, String(v));
      assertEqual('exampleWorksheetId' in from0({ exampleWorksheetId: v }), false, String(v));
    }
    assertEqual(load({ valuesRef: MASS, groupsRef: TEIL }).exampleWorksheetId, null);
  });
});

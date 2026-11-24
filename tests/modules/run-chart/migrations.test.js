/**
 * Verlaufsdiagramm: Migration der Altform (domain/migrations.js), samt
 * Vorbelegung aus dem Diagrammvorschlag und dem Beispiel.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/run-chart/domain/model.js';
import { from0 } from '../../../js/modules/run-chart/domain/migrations.js';
import { buildPrefill } from '../../../js/modules/chart-suggestion/domain/prefill.js';

const plain = (v) => JSON.parse(JSON.stringify(v));
const load = (json) => State.fromJSON(json);

const WS = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';

/** Instanz der Altprojekt-Fixture (Stand des Altmoduls, ohne `_schema`). */
const LEGACY = {
  columnRef: { instanceId: WS, sheetId: 'sheet_1', columnId: 'col_rc_d' },
  alpha: 0.1,
  exampleWorksheetId: null,
};

/** Das Beispiel `spc-run-chart-shift` in der Altform. */
const EXAMPLE_OLD = {
  columnRef: { instanceId: '__source__', sheetId: 'sheet-imr-shift', columnId: 'c-value' },
  alpha: 0.05,
  sourceWorksheetFile: 'shared/worksheets/spc-imr-shift.json',
};

suite('run-chart: Migration — Altprojekt', () => {
  test('Altfixture: Spalte und α übernommen, Diagramm leer', () => {
    const m = load(LEGACY);
    assertDeepEqual(plain(m.columnRef), LEGACY.columnRef);
    assertEqual(m.alpha, 0.1);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), {});
    assertEqual(m.hasContent(), true);
  });

  test('Fremdschlüssel entfallen', () => {
    const out = from0({ ...LEGACY, foo: 1, result: { n: 3 }, sourceWorksheetFile: 'x.json' });
    for (const k of ['foo', 'result', 'sourceWorksheetFile']) assertEqual(k in out, false, k);
    const json = plain(load({ ...LEGACY, foo: 1, sourceWorksheetFile: 'x.json' }).toJSON());
    assertEqual('foo' in json, false);
    assertEqual('sourceWorksheetFile' in json, false);
  });

  test('Beispiel in Altform ergibt dasselbe wie die neue Datei', () => {
    const a = plain(load(EXAMPLE_OLD).toJSON());
    const b = plain(load({ _schema: { version: '1.0' }, columnRef: EXAMPLE_OLD.columnRef }).toJSON());
    assertDeepEqual(a, b);
    assertEqual(load(EXAMPLE_OLD).alpha, 0.05);
    assertDeepEqual(plain(load(EXAMPLE_OLD).columnRef), EXAMPLE_OLD.columnRef);
  });
});

suite('run-chart: Migration — Vorbelegung aus dem Diagrammvorschlag', () => {
  test('buildPrefill(run-chart) → columnRef gesetzt, α auf der Vorgabe', () => {
    const cols = [{ id: 'a', name: 'a', role: 'continuous', type: 'numeric', values: [1, 2, 3, 4], roleConfirmed: false }];
    const p = buildPrefill('run-chart', cols, 'ws', 's');
    assertEqual(p.target, 'run-chart');
    const m = load(p.state);
    assertDeepEqual(plain(m.columnRef), { instanceId: 'ws', sheetId: 's', columnId: 'a' });
    assertEqual(m.alpha, 0.05);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), {});
  });
});

suite('run-chart: Migration — Fälle des alten fromJSON', () => {
  test('{}, null und undefined ergeben die Vorgaben', () => {
    for (const v of [{}, null, undefined]) {
      const m = load(v);
      assertEqual(m.columnRef, null, String(v));
      assertEqual(m.alpha, 0.05, String(v));
      assertEqual(m.exampleWorksheetId, null, String(v));
      assertEqual(m.hasContent(), false, String(v));
    }
  });

  test('Rundweg ist verlustfrei', () => {
    const m = load({ columnRef: { instanceId: 'i3', sheetId: 's3', columnId: 'c3' }, alpha: 0.025, exampleWorksheetId: 'ws-7' });
    const r = load(plain(m.toJSON()));
    assertDeepEqual(plain(r.toJSON()), plain(m.toJSON()));
    assertEqual(r.alpha, 0.025);
    assertEqual(r.exampleWorksheetId, 'ws-7');
  });

  test('ungültiges α (Text, NaN, fehlend) → 0,05', () => {
    assertEqual(load({ alpha: 'x' }).alpha, 0.05);
    assertEqual(load({ alpha: '0.1' }).alpha, 0.05);
    assertEqual(load({ alpha: NaN }).alpha, 0.05);
    assertEqual(load({}).alpha, 0.05);
  });

  test('endliches α in (0, 1) bleibt unverändert', () => {
    assertEqual(load({ alpha: 0.001 }).alpha, 0.001);
    assertEqual(load({ alpha: 0.2 }).alpha, 0.2);
  });

  test('α außerhalb von (0, 1) fällt auf 0,05', () => {
    for (const a of [0, 1, 1.5, -0.1, Infinity]) {
      assertEqual(load({ alpha: a }).alpha, 0.05, String(a));
      assertEqual('alpha' in from0({ alpha: a }), false, String(a));
    }
  });

  test('columnRef: vollständig wird Text, unvollständig oder kein Objekt → null', () => {
    assertDeepEqual(from0({ columnRef: { instanceId: 1, sheetId: 2, columnId: 3 } }).columnRef,
      { instanceId: '1', sheetId: '2', columnId: '3' });
    assertEqual(load({ columnRef: {} }).columnRef, null);
    assertEqual(load({ columnRef: 'nope' }).columnRef, null);
    assertEqual(load({ columnRef: { instanceId: 'i' } }).columnRef, null);
  });

  test('exampleWorksheetId, das kein Text ist, entfällt', () => {
    assertEqual(load({ exampleWorksheetId: 5 }).exampleWorksheetId, null);
    assertEqual('exampleWorksheetId' in from0({ exampleWorksheetId: 5 }), false);
    assertEqual(load({ exampleWorksheetId: 'ws-1' }).exampleWorksheetId, 'ws-1');
  });
});

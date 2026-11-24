/**
 * Transformierte I-MR-Karte: Migration der Altform (domain/migrations.js),
 * samt Vorbelegung aus dem Diagrammvorschlag und dem Beispiel. Die Fälle des
 * alten `fromJSON` stammen aus `tests/modules/transformed-imr-chart.test.js`.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/transformed-imr-chart/domain/model.js';
import { from0 } from '../../../js/modules/transformed-imr-chart/domain/migrations.js';
import { buildPrefill } from '../../../js/modules/chart-suggestion/domain/prefill.js';

const plain = (v) => JSON.parse(JSON.stringify(v));
const load = (json) => State.fromJSON(json);

const WS = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';

/** Instanz der Altprojekt-Fixture (Stand des Altmoduls, ohne `_schema`). */
const LEGACY = {
  columnRef: { instanceId: WS, sheetId: 'sheet_1', columnId: 'col_timr_s' },
  lambdaMode: 'manual',
  lambdaManual: 0.25,
  exampleWorksheetId: null,
};

/** Das Beispiel `spc-transformed-imr` in der Altform (Stand vor der Umstellung). */
const EXAMPLE_OLD = {
  columnRef: { instanceId: '__source__', sheetId: 'sheet-spc-trans', columnId: 'c-standzeit' },
  lambdaMode: 'auto',
  sourceWorksheetFile: 'worksheets/spc-transformed-lognormal.json',
};

suite('transformed-imr-chart: Migration — Altprojekt', () => {
  test('Altfixture: Spalte, Modus und λ übernommen, Diagramm leer', () => {
    const m = load(LEGACY);
    assertDeepEqual(plain(m.columnRef), LEGACY.columnRef);
    assertEqual(m.lambdaMode, 'manual');
    assertEqual(m.lambdaManual, 0.25);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), {});
    assertEqual(m.hasContent(), true);
  });

  test('Fremdschlüssel entfallen', () => {
    const out = from0({ ...LEGACY, foo: 1, result: { n: 3 }, sourceWorksheetFile: 'x.json', errorMsg: 'x' });
    for (const k of ['foo', 'result', 'sourceWorksheetFile', 'errorMsg']) assertEqual(k in out, false, k);
    const json = plain(load({ ...LEGACY, foo: 1, sourceWorksheetFile: 'x.json' }).toJSON());
    assertEqual('foo' in json, false);
    assertEqual('sourceWorksheetFile' in json, false);
  });

  test('Beispiel in Altform ergibt dasselbe wie die neue Datei', () => {
    const a = plain(load(EXAMPLE_OLD).toJSON());
    const b = plain(load({ _schema: { version: '1.0' }, columnRef: EXAMPLE_OLD.columnRef }).toJSON());
    assertDeepEqual(a, b);
    const m = load(EXAMPLE_OLD);
    assertEqual(m.lambdaMode, 'auto');
    assertEqual(m.lambdaManual, 0);
    assertDeepEqual(plain(m.columnRef), EXAMPLE_OLD.columnRef);
  });
});

suite('transformed-imr-chart: Migration — Auto-λ der Altform', () => {
  test('Modus auto mit gespeichertem 0 (Altfehler nach dem Beispiel): bleibt 0, nichts geraten', () => {
    const m = load({ ...EXAMPLE_OLD, lambdaManual: 0 });
    assertEqual(m.lambdaMode, 'auto');
    assertEqual(m.lambdaManual, 0);
  });

  test('Modus auto mit gespiegeltem λ: wird unverändert übernommen', () => {
    const m = load({ columnRef: LEGACY.columnRef, lambdaMode: 'auto', lambdaManual: 0.85 });
    assertEqual(m.lambdaMode, 'auto');
    assertEqual(m.lambdaManual, 0.85);
  });
});

suite('transformed-imr-chart: Migration — Vorbelegung aus dem Diagrammvorschlag', () => {
  test('buildPrefill(transformed-imr-chart) → columnRef gesetzt, Modus auto, λ 0', () => {
    const cols = [{ id: 'a', name: 'a', role: 'continuous', type: 'numeric', values: [1, 2, 3, 4, 5], roleConfirmed: false }];
    const p = buildPrefill('transformed-imr-chart', cols, 'ws', 's');
    assertEqual(p.target, 'transformed-imr-chart');
    assertDeepEqual(Object.keys(p.state).sort(), ['columnRef', 'lambdaMode'], 'Form der Vorbelegung');
    const m = load(p.state);
    assertDeepEqual(plain(m.columnRef), { instanceId: 'ws', sheetId: 's', columnId: 'a' });
    assertEqual(m.lambdaMode, 'auto');
    assertEqual(m.lambdaManual, 0);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), {});
  });
});

suite('transformed-imr-chart: Migration — Fälle des alten fromJSON', () => {
  test('{}, null und undefined ergeben die Vorgaben', () => {
    for (const v of [{}, null, undefined]) {
      const m = load(v);
      assertEqual(m.columnRef, null, String(v));
      assertEqual(m.lambdaMode, 'auto', String(v));
      assertEqual(m.lambdaManual, 0, String(v));
      assertEqual(m.exampleWorksheetId, null, String(v));
      assertEqual(m.hasContent(), false, String(v));
    }
  });

  test('Rundweg ist verlustfrei', () => {
    const m = load({ columnRef: { instanceId: 'i3', sheetId: 's3', columnId: 'c3' }, lambdaMode: 'manual', lambdaManual: -1.5, exampleWorksheetId: 'ws-7' });
    const r = load(plain(m.toJSON()));
    assertDeepEqual(plain(r.toJSON()), plain(m.toJSON()));
    assertEqual(r.lambdaMode, 'manual');
    assertEqual(r.lambdaManual, -1.5);
    assertEqual(r.exampleWorksheetId, 'ws-7');
  });

  test('ungültiger Modus → auto', () => {
    for (const v of ['bogus', 'MANUAL', '', 1, null]) {
      assertEqual(load({ lambdaMode: v }).lambdaMode, 'auto', String(v));
    }
    assertEqual(load({ lambdaMode: 'auto' }).lambdaMode, 'auto');
  });

  test('lambdaManual nicht endlich, NaN oder Text → 0', () => {
    for (const v of [Infinity, -Infinity, NaN, '0.5', 'abc', null, true]) {
      assertEqual(load({ lambdaMode: 'manual', lambdaManual: v }).lambdaManual, 0, String(v));
      assertEqual('lambdaManual' in from0({ lambdaManual: v }), false, String(v));
    }
  });

  test('negatives und gebrochenes λ bleibt verbatim', () => {
    assertEqual(load({ lambdaMode: 'manual', lambdaManual: -2.3 }).lambdaManual, -2.3);
    assertEqual(load({ lambdaMode: 'manual', lambdaManual: 0.123456 }).lambdaManual, 0.123456);
  });

  test('columnRef: vollständig wird Text, unvollständig oder kein Objekt → null', () => {
    assertDeepEqual(from0({ columnRef: { instanceId: 1, sheetId: 2, columnId: 3 } }).columnRef,
      { instanceId: '1', sheetId: '2', columnId: '3' });
    assertEqual(load({ columnRef: {} }).columnRef, null);
    assertEqual(load({ columnRef: 'nope' }).columnRef, null);
    assertEqual(load({ columnRef: { instanceId: 'i' } }).columnRef, null);
    assertEqual(load({ columnRef: { instanceId: 'i', sheetId: null, columnId: 'c' } }).columnRef, null);
  });

  test('exampleWorksheetId, das kein Text ist, entfällt', () => {
    assertEqual(load({ exampleWorksheetId: 5 }).exampleWorksheetId, null);
    assertEqual('exampleWorksheetId' in from0({ exampleWorksheetId: 5 }), false);
    assertEqual(load({ exampleWorksheetId: 'ws-1' }).exampleWorksheetId, 'ws-1');
  });
});

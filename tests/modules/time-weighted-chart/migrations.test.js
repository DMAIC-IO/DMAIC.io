/**
 * Zeitgewichtete Regelkarten: Migration der Altform (domain/migrations.js)
 * samt Beispielen. Die Fälle des alten `fromJSON` stammen aus
 * `tests/modules/time-weighted-chart.test.js`.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/time-weighted-chart/domain/model.js';
import { from0 } from '../../../js/modules/time-weighted-chart/domain/migrations.js';

const plain = (v) => JSON.parse(JSON.stringify(v));
/** Laden wie der Kern (`loadModule`): mit Reparatur. */
const load = (json) => State.fromJSON(json, { repair: true });

const WS = '4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b';
const COL = { instanceId: WS, sheetId: 'sheet_1', columnId: 'col_twc_durchmesser' };
const DEFAULT_PARAMS = { ewma: { lambda: 0.2, L: 3 }, cusum: { kSigma: 0.5, hSigma: 4 } };

/** Instanz der Altprojekt-Fixture (Stand des Altmoduls, ohne `_schema`). */
const LEGACY = {
  chartTypeId: 'cusum',
  columnRef: COL,
  sigmaMethod: 'sd',
  baselineCount: 20,
  targetOverride: 25,
  sigmaOverride: null,
  lambda: 0.1,
  L: 2.7,
  kSigma: 0.5,
  hSigma: 5,
  exampleWorksheetId: null,
};

const SRC_REF = { instanceId: '__source__', sheetId: 'sheet-spc-drift', columnId: 'c-wert' };
const FILE = 'worksheets/spc-time-weighted-drift.json';

/** Die Beispiele in der Altform (Stand vor der Umstellung). */
const EXAMPLE_EWMA_OLD = { chartTypeId: 'ewma', columnRef: SRC_REF, lambda: 0.2, L: 3, sourceWorksheetFile: FILE };
const EXAMPLE_CUSUM_OLD = { chartTypeId: 'cusum', columnRef: SRC_REF, baselineCount: 30, kSigma: 0.5, hSigma: 4, sourceWorksheetFile: FILE };

/** Die Beispiele in der neuen Form (Vorgaben weggelassen). */
const EXAMPLE_EWMA_NEW = { _schema: { version: '1.0' }, columnRef: SRC_REF };
const EXAMPLE_CUSUM_NEW = { _schema: { version: '1.0' }, chartTypeId: 'cusum', columnRef: SRC_REF, baselineCount: 30 };

suite('time-weighted-chart: Migration — Altprojekt', () => {
  test('Altfixture: alle Felder übernommen, beide Parametersätze unter params, Diagramme leer', () => {
    const m = load(LEGACY);
    assertEqual(m.chartTypeId, 'cusum');
    assertDeepEqual(plain(m.columnRef), COL);
    assertEqual(m.sigmaMethod, 'sd');
    assertEqual(m.baselineCount, 20);
    assertEqual(m.targetOverride, 25);
    assertEqual(m.sigmaOverride, null);
    assertDeepEqual(plain(m.params), { ewma: { lambda: 0.1, L: 2.7 }, cusum: { kSigma: 0.5, hSigma: 5 } });
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.charts), {});
    assertEqual(m.hasContent(), true);
  });

  test('die Altfixture lädt ohne Reparatur auch streng', () => {
    assertDeepEqual(plain(State.fromJSON(LEGACY).toJSON()), plain(load(LEGACY).toJSON()));
  });

  test('flache Parameter stehen nicht neben params; Fremdschlüssel entfallen', () => {
    const out = from0({ ...LEGACY, foo: 1, result: { n: 3 }, sourceWorksheetFile: 'x.json', pickableColumns: {} });
    assertDeepEqual(Object.keys(out).sort(),
      ['baselineCount', 'chartTypeId', 'columnRef', 'params', 'sigmaMethod', 'sigmaOverride', 'targetOverride'],
      'exampleWorksheetId null entfällt');
    const json = plain(load({ ...LEGACY, foo: 1, sourceWorksheetFile: 'x.json' }).toJSON());
    for (const k of ['lambda', 'L', 'kSigma', 'hSigma', 'foo', 'sourceWorksheetFile']) assertEqual(k in json, false, k);
    assertDeepEqual(Object.keys(json.params), ['ewma', 'cusum']);
  });

  test('beide Parametersätze werden übernommen, auch die des nicht gewählten Typs', () => {
    const e = load({ ...LEGACY, chartTypeId: 'ewma', lambda: 0.35, L: 2.5, kSigma: 0.7, hSigma: 6 });
    assertDeepEqual(plain(e.params), { ewma: { lambda: 0.35, L: 2.5 }, cusum: { kSigma: 0.7, hSigma: 6 } });
    const c = load({ ...LEGACY, chartTypeId: 'cusum', lambda: 0.35, L: 2.5, kSigma: 0.7, hSigma: 6 });
    assertDeepEqual(plain(c.params), plain(e.params));
  });

  test('ein ungültiger Parameter fällt einzeln auf die Vorgabe, die übrigen bleiben', () => {
    assertDeepEqual(plain(load({ lambda: 0.1, L: -1, kSigma: 0.7, hSigma: 'x' }).params),
      { ewma: { lambda: 0.1, L: 3 }, cusum: { kSigma: 0.7, hSigma: 4 } });
  });

  test('Beispiele in Altform ergeben dasselbe wie die neuen Dateien', () => {
    for (const [old, neu] of [[EXAMPLE_EWMA_OLD, EXAMPLE_EWMA_NEW], [EXAMPLE_CUSUM_OLD, EXAMPLE_CUSUM_NEW]]) {
      assertDeepEqual(plain(load(old).toJSON()), plain(load(neu).toJSON()), old.chartTypeId);
    }
    const c = load(EXAMPLE_CUSUM_OLD);
    assertEqual(c.chartTypeId, 'cusum');
    assertEqual(c.baselineCount, 30);
    assertDeepEqual(plain(c.params), DEFAULT_PARAMS);
    assertDeepEqual(plain(c.columnRef), SRC_REF);
  });
});

suite('time-weighted-chart: Migration — Fälle des alten fromJSON', () => {
  test('{}, null und undefined ergeben die Vorgaben', () => {
    for (const v of [{}, null, undefined]) {
      const m = load(v);
      assertEqual(m.chartTypeId, 'ewma', String(v));
      assertEqual(m.columnRef, null, String(v));
      assertEqual(m.sigmaMethod, 'mr', String(v));
      assertEqual(m.baselineCount, null, String(v));
      assertEqual(m.targetOverride, null, String(v));
      assertEqual(m.sigmaOverride, null, String(v));
      assertDeepEqual(plain(m.params), DEFAULT_PARAMS, String(v));
      assertEqual(m.exampleWorksheetId, null, String(v));
      assertEqual(m.hasContent(), false, String(v));
    }
  });

  test('Rundweg ist verlustfrei', () => {
    const m = load({ ...LEGACY, exampleWorksheetId: 'ws-7', sigmaOverride: 0.05 });
    const r = load(plain(m.toJSON()));
    assertDeepEqual(plain(r.toJSON()), plain(m.toJSON()));
    assertEqual(r.exampleWorksheetId, 'ws-7');
    assertEqual(r.sigmaOverride, 0.05);
  });

  test('chartTypeId: cusum bleibt, alles andere wird ewma', () => {
    assertEqual(load({ chartTypeId: 'cusum' }).chartTypeId, 'cusum');
    for (const v of ['shewhart', 'CUSUM', 1, null, '']) assertEqual(load({ chartTypeId: v }).chartTypeId, 'ewma', String(v));
  });

  test('sigmaMethod: sd bleibt, alles andere wird mr', () => {
    assertEqual(load({ sigmaMethod: 'sd' }).sigmaMethod, 'sd');
    for (const v of ['range', 'SD', 1, null]) assertEqual(load({ sigmaMethod: v }).sigmaMethod, 'mr', String(v));
  });

  test('columnRef: vollständig übernommen, Werte als Text', () => {
    assertDeepEqual(plain(load({ columnRef: COL }).columnRef), COL);
    assertDeepEqual(plain(load({ columnRef: { instanceId: 1, sheetId: 2, columnId: 3 } }).columnRef),
      { instanceId: '1', sheetId: '2', columnId: '3' });
  });

  test('columnRef kein Objekt oder unvollständig → null', () => {
    for (const v of ['nope', 5, [], { instanceId: 'i', sheetId: 's' }, { instanceId: 'i', sheetId: null, columnId: 'c' },
      { instanceId: '', sheetId: 's', columnId: 'c' }]) {
      assertEqual(load({ columnRef: v }).columnRef, null, JSON.stringify(v));
    }
  });

  test('baselineCount: null, fehlend, nicht endlich oder Text → null', () => {
    for (const v of [null, undefined, NaN, Infinity, -Infinity, '12', 'abc', true]) {
      assertEqual(load({ baselineCount: v }).baselineCount, null, String(v));
      assertEqual(from0({ baselineCount: v }).baselineCount, null, String(v));
    }
  });

  test('baselineCount: ganze Zahl ab 1 bleibt; Bruchzahl ≥ 1 abgerundet (2,7 → 2, 2,5 → 2)', () => {
    assertEqual(load({ baselineCount: 20 }).baselineCount, 20);
    assertEqual(load({ baselineCount: 1 }).baselineCount, 1);
    assertEqual(load({ baselineCount: 2.7 }).baselineCount, 2);
    assertEqual(load({ baselineCount: 2.5 }).baselineCount, 2);
  });

  test('baselineCount: 0, negativ und 0 < x < 1 → null (alle Werte; A14)', () => {
    for (const v of [0, -3, 0.5, 0.999]) assertEqual(load({ baselineCount: v }).baselineCount, null, String(v));
  });

  test('targetOverride: endlich bleibt (auch 0 und negativ), sonst null', () => {
    assertEqual(load({ targetOverride: 25 }).targetOverride, 25);
    assertEqual(load({ targetOverride: 0 }).targetOverride, 0);
    assertEqual(load({ targetOverride: -4.5 }).targetOverride, -4.5);
    for (const v of [NaN, Infinity, '25', null]) assertEqual(load({ targetOverride: v }).targetOverride, null, String(v));
  });

  test('sigmaOverride: endlich ≥ 0 bleibt (auch 0), negativ und nicht endlich → null', () => {
    assertEqual(load({ sigmaOverride: 0.05 }).sigmaOverride, 0.05);
    assertEqual(load({ sigmaOverride: 0 }).sigmaOverride, 0);
    for (const v of [-1, -0.001, NaN, Infinity, '0.1']) assertEqual(load({ sigmaOverride: v }).sigmaOverride, null, String(v));
  });

  test('λ: 0 < λ ≤ 1 bleibt, sonst 0,2', () => {
    assertEqual(load({ lambda: 0.05 }).params.ewma.lambda, 0.05);
    assertEqual(load({ lambda: 1 }).params.ewma.lambda, 1);
    for (const v of [1.5, 0, -0.1, NaN, Infinity, '0.3', null]) {
      assertEqual(load({ lambda: v }).params.ewma.lambda, 0.2, String(v));
    }
  });

  test('L, k, h: endlich > 0 bleibt, sonst die Vorgabe 3, 0,5, 4', () => {
    assertEqual(load({ L: 2.7 }).params.ewma.L, 2.7);
    assertEqual(load({ kSigma: 0.7 }).params.cusum.kSigma, 0.7);
    assertEqual(load({ hSigma: 5 }).params.cusum.hSigma, 5);
    for (const v of [0, -1, NaN, Infinity, '0.3', null]) {
      assertEqual(load({ L: v }).params.ewma.L, 3, `L ${v}`);
      assertEqual(load({ kSigma: v }).params.cusum.kSigma, 0.5, `k ${v}`);
      assertEqual(load({ hSigma: v }).params.cusum.hSigma, 4, `h ${v}`);
    }
  });

  test('exampleWorksheetId: Text bleibt, sonst entfällt es', () => {
    assertEqual(load({ exampleWorksheetId: 'ws-1' }).exampleWorksheetId, 'ws-1');
    assertEqual(load({ exampleWorksheetId: 5 }).exampleWorksheetId, null);
    assertEqual('exampleWorksheetId' in from0({ exampleWorksheetId: 5 }), false);
    assertEqual(load({}).exampleWorksheetId, null);
  });
});

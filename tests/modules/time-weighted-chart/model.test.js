/**
 * Zeitgewichtete Regelkarten: Model (domain/model.js) — Schema, Vorgaben,
 * Schreiben über `instance.set` (`setFields`), Invariante und Ableitungen.
 */
import { suite, test, assert, assertEqual, assertDeepEqual, assertThrows, assertDeepClose } from '../../test-utils.js';
import { State, CHART_TYPE_IDS, SIGMA_METHODS, CHART_KEYS } from '../../../js/modules/time-weighted-chart/domain/model.js';
import { CHART_TYPES, engineRuns } from '../../../js/modules/time-weighted-chart/domain/analyze.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { setFields } from '../../../js/core/model.js';
import controlChart from '../../../js/widgets/control-chart/schema.js';
import { sheetSource } from '../../helpers/sheet-source.js';
import { DURCHMESSER, WERT, LEGACY_RESULT, LEGACY_EWMA_RESULT, EXAMPLE_EWMA_RESULT, EXAMPLE_CUSUM_RESULT } from './analyze.test.js';

const plain = (v) => JSON.parse(JSON.stringify(v));
const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
/** Übersetzer-Stub: zeigt Schlüssel und Parameter. */
const T = (k, p) => (p ? `«${k}:${JSON.stringify(p)}»` : `«${k}»`);

const SHEET = { d: DURCHMESSER, w: WERT, konst: [5, 5, 5, 5], kurz: [1, 2], txt: ['1,5', 2, 3, 4] };
const SRC = sheetSource(SHEET, { names: { d: 'Durchmesser', w: 'Wert' } });

/** Stand der Altprojekt-Fixture (nach der Migration). */
const legacy = () => State.fromJSON({
  chartTypeId: 'cusum', columnRef: ref('d'), sigmaMethod: 'sd', baselineCount: 20, targetOverride: 25,
  sigmaOverride: null, lambda: 0.1, L: 2.7, kSigma: 0.5, hSigma: 5, exampleWorksheetId: null,
});

/** @param {any} m @param {string[]} [names] */
const derived = (m, names) => evaluateDerived(m, SRC, names, T);
const PARAMS = { ewma: { lambda: 0.2, L: 3 }, cusum: { kSigma: 0.5, hSigma: 4 } };
const withParams = (o) => ({ ewma: { ...PARAMS.ewma, ...o.ewma }, cusum: { ...PARAMS.cusum, ...o.cusum } });

suite('time-weighted-chart: Model — Schema und Vorgaben', () => {
  test('Kartentyp und σ-Methode: Literale gleich CHART_TYPE_IDS, SIGMA_METHODS und dem Register', () => {
    assertDeepEqual([...State.schema.fields.chartTypeId.values], [...CHART_TYPE_IDS]);
    assertDeepEqual([...State.schema.fields.sigmaMethod.values], [...SIGMA_METHODS]);
    assertDeepEqual(Object.keys(CHART_TYPES), [...CHART_TYPE_IDS]);
    assertDeepEqual([...CHART_TYPE_IDS], ['ewma', 'cusum']);
    assertDeepEqual([...SIGMA_METHODS], ['mr', 'sd']);
  });

  test('params: je Typ die Parameter des Registers CHART_TYPES (Regel M6)', () => {
    const p = State.schema.fields.params;
    assertEqual(p.kind, 'object');
    assertDeepEqual(Object.keys(p.shape), Object.keys(CHART_TYPES));
    for (const [type, def] of Object.entries(CHART_TYPES)) {
      assertDeepEqual(Object.keys(p.shape[type].shape), [...def.params], type);
    }
  });

  test('Spaltenfeld: numerisch ab drei Werten, nullbar', () => {
    const c = State.schema.fields.columnRef;
    assertEqual(c.kind, 'columnRef');
    assertDeepEqual([...c.types], ['numeric']);
    assertEqual(c.minCount, 3);
    assertEqual(c.nullable, true);
  });

  test('Zahlenfelder: Bereiche wie PARAM_SPEC der Altform', () => {
    const f = State.schema.fields;
    assertEqual(f.baselineCount.integer, true);
    assertEqual(f.baselineCount.min, 1);
    assertEqual(f.baselineCount.nullable, true);
    assertEqual(f.targetOverride.nullable, true);
    assertEqual(f.sigmaOverride.min, 0);
    assertEqual(f.sigmaOverride.nullable, true);
    const e = f.params.shape.ewma.shape;
    const c = f.params.shape.cusum.shape;
    assertEqual(e.lambda.exclusiveMin, 0);
    assertEqual(e.lambda.max, 1);
    for (const s of [e.L, c.kSigma, c.hSigma]) assertEqual(s.exclusiveMin, 0);
  });

  test('Ansicht: Beispielblatt und Editor-Einstellungen je Teilkarte', () => {
    assertDeepEqual(Object.keys(State.schema.view).sort(), ['charts', 'exampleWorksheetId']);
    const charts = State.schema.view.charts;
    assertEqual(charts.kind, 'map');
    assertEqual(charts.value.kind, controlChart.edits().kind);
    assertDeepEqual(Object.keys(State.schema.fields),
      ['chartTypeId', 'columnRef', 'sigmaMethod', 'baselineCount', 'targetOverride', 'sigmaOverride', 'params']);
    assertDeepEqual([...CHART_KEYS], ['ewma', 'cusum_plus', 'cusum_minus']);
  });

  test('Vorgaben und kein Inhalt', () => {
    const m = new State();
    assertEqual(m.chartTypeId, 'ewma');
    assertEqual(m.columnRef, null);
    assertEqual(m.sigmaMethod, 'mr');
    assertEqual(m.baselineCount, null);
    assertEqual(m.targetOverride, null);
    assertEqual(m.sigmaOverride, null);
    assertDeepEqual(plain(m.params), PARAMS);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.charts), {});
    assertEqual(m.hasContent(), false);
  });

  test('hasContent: jede Abweichung im Inhalt zählt (A7), Ansichtsfelder nicht', () => {
    const cases = [
      { columnRef: ref('w') }, { chartTypeId: 'cusum' }, { sigmaMethod: 'sd' }, { baselineCount: 20 },
      { targetOverride: 0 }, { sigmaOverride: 0.1 }, { params: withParams({ ewma: { lambda: 0.1 } }) },
      { params: withParams({ cusum: { hSigma: 5 } }) },
    ];
    for (const c of cases) {
      const m = new State();
      setFields(m, c);
      assertEqual(m.hasContent(), true, JSON.stringify(c));
    }
    const v = new State();
    v.exampleWorksheetId = 'x';
    v.charts = { ewma: { title: 'T' } };
    assertEqual(v.hasContent(), false);
  });
});

suite('time-weighted-chart: Model — instance.set', () => {
  test('params: ganzes Feld angenommen (beide Typen)', () => {
    const m = new State();
    const next = { ewma: { lambda: 1, L: 2.7 }, cusum: { kSigma: 0.7, hSigma: 5 } };
    assertDeepEqual(plain(setFields(m, { params: next })), { params: next });
    assertDeepEqual(plain(m.params), next);
  });

  test('params: Teilobjekt und Pfad abgelehnt, Stand unverändert', () => {
    const m = new State();
    assertThrows(() => setFields(m, { params: { ewma: { lambda: 0.3, L: 3 } } }), /missing key "cusum"/);
    assertThrows(() => setFields(m, { params: { ewma: { lambda: 0.3 }, cusum: PARAMS.cusum } }), /L/);
    assertThrows(() => setFields(m, { 'params.ewma.lambda': 0.3 }), /unknown field/);
    assertDeepEqual(plain(m.params), PARAMS);
  });

  test('params: λ 0 und 1,5 abgelehnt, 1 angenommen; L, k, h 0 abgelehnt; Text abgelehnt', () => {
    const m = new State();
    const bad = [
      { ewma: { lambda: 0 } }, { ewma: { lambda: 1.5 } }, { ewma: { lambda: -0.1 } },
      { ewma: { L: 0 } }, { cusum: { kSigma: 0 } }, { cusum: { hSigma: 0 } }, { cusum: { hSigma: -1 } },
      { ewma: { lambda: 'abc' } }, { cusum: { kSigma: 'abc' } }, { ewma: { lambda: null } },
    ];
    for (const b of bad) {
      assertThrows(() => setFields(m, { params: withParams(b) }), undefined, JSON.stringify(b));
      assertDeepEqual(plain(m.params), PARAMS, JSON.stringify(b));
    }
    setFields(m, { params: withParams({ ewma: { lambda: 1 } }) });
    assertEqual(m.params.ewma.lambda, 1);
  });

  test('params: Zahl als Text normalisiert der Kern zur Zahl', () => {
    const m = new State();
    setFields(m, { params: withParams({ ewma: { lambda: '0.5' }, cusum: { hSigma: '5' } }) });
    assertEqual(m.params.ewma.lambda, 0.5);
    assertEqual(m.params.cusum.hSigma, 5);
  });

  test('baselineCount: 0, 2,5, negativ und Text abgelehnt; 20 und null angenommen', () => {
    const m = new State();
    for (const v of [0, 2.5, -1, 'abc']) {
      assertThrows(() => setFields(m, { baselineCount: v }), undefined, String(v));
      assertEqual(m.baselineCount, null, String(v));
    }
    setFields(m, { baselineCount: 20 });
    assertEqual(m.baselineCount, 20);
    setFields(m, { baselineCount: null });
    assertEqual(m.baselineCount, null);
  });

  test('sigmaOverride: −1 abgelehnt, 0 und null angenommen; targetOverride jede Zahl', () => {
    const m = new State();
    assertThrows(() => setFields(m, { sigmaOverride: -1 }));
    assertEqual(m.sigmaOverride, null);
    setFields(m, { sigmaOverride: 0 });
    assertEqual(m.sigmaOverride, 0);
    setFields(m, { sigmaOverride: null, targetOverride: -3.5 });
    assertEqual(m.sigmaOverride, null);
    assertEqual(m.targetOverride, -3.5);
    assertThrows(() => setFields(m, { targetOverride: 'abc' }));
    assertEqual(m.targetOverride, -3.5);
  });

  test('chartTypeId und sigmaMethod: fremder Wert abgelehnt', () => {
    const m = new State();
    assertThrows(() => setFields(m, { chartTypeId: 'shewhart' }));
    assertThrows(() => setFields(m, { sigmaMethod: 'range' }));
    assertEqual(m.chartTypeId, 'ewma');
    assertEqual(m.sigmaMethod, 'mr');
    setFields(m, { chartTypeId: 'cusum', sigmaMethod: 'sd' });
    assertEqual(m.chartTypeId, 'cusum');
    assertEqual(m.sigmaMethod, 'sd');
  });

  test('der Typwechsel räumt nichts auf: Parameter beider Typen bleiben', () => {
    const m = legacy();
    setFields(m, { chartTypeId: 'ewma' });
    assertDeepEqual(plain(m.params), { ewma: { lambda: 0.1, L: 2.7 }, cusum: { kSigma: 0.5, hSigma: 5 } });
  });

  test('columnRef setzen und mit null leeren', () => {
    const m = new State();
    setFields(m, { columnRef: ref('w') });
    assertDeepEqual(plain(m.columnRef), ref('w'));
    setFields(m, { columnRef: null });
    assertEqual(m.columnRef, null);
  });
});

suite('time-weighted-chart: Model — Invariante chartKeys', () => {
  test('fremder Schlüssel abgelehnt mit invariant chartKeys, Stand unverändert', () => {
    const m = new State();
    m.charts = { ewma: { title: 'E' }, cusum_plus: { title: 'P' }, cusum_minus: { title: 'M' } };
    let err = null;
    try { m.charts = { ewma: { title: 'E' }, cusum: { title: 'alt' } }; } catch (e) { err = e; }
    assert(err, 'abgelehnt');
    assertEqual(err.invariant, 'chartKeys');
    assertDeepEqual(Object.keys(m.charts), ['ewma', 'cusum_plus', 'cusum_minus']);
  });

  test('Reparatur beim Laden verwirft fremde Schlüssel, auch streng (nur Ansichtsfeld)', () => {
    const json = { _schema: { version: '1.0' }, charts: { ewma: { title: 'a' }, cusum: { title: 'b' }, 'cusum#2': {} } };
    assertDeepEqual(plain(State.fromJSON(json, { repair: true }).charts), { ewma: { title: 'a' } });
    assertDeepEqual(plain(State.fromJSON(json).charts), { ewma: { title: 'a' } });
  });
});

suite('time-weighted-chart: Model — Ableitungen', () => {
  test('result: Altprojekt (CUSUM) und nach Wechsel auf EWMA gleich den Literalen', () => {
    assertDeepClose(derived(legacy(), ['result']).result, LEGACY_RESULT);
    const m = legacy();
    setFields(m, { chartTypeId: 'ewma' });
    assertDeepClose(derived(m, ['result']).result, LEGACY_EWMA_RESULT);
  });

  test('result: Beispiele gleich den Literalen', () => {
    const e = new State();
    setFields(e, { columnRef: ref('w') });
    assertDeepClose(derived(e, ['result']).result, EXAMPLE_EWMA_RESULT);
    const c = new State();
    setFields(c, { columnRef: ref('w'), chartTypeId: 'cusum', baselineCount: 30 });
    assertDeepClose(derived(c, ['result']).result, EXAMPLE_CUSUM_RESULT);
  });

  test('result: null ohne Spalte, bei gelöschter Spalte, unter drei Zahlen, σ = 0; der Bezug bleibt', () => {
    assertEqual(derived(new State(), ['result']).result, null);
    for (const col of ['gone', 'kurz', 'konst']) {
      const m = legacy();
      setFields(m, { columnRef: ref(col), sigmaOverride: null });
      const d = derived(m, ['result', 'points']);
      assertEqual(d.result, null, col);
      assertDeepEqual(d.points, [], col);
      assertDeepEqual(plain(m.columnRef), ref(col), 'der Bezug bleibt');
    }
  });

  test('Text „1,5“ zählt nicht', () => {
    const m = new State();
    setFields(m, { columnRef: ref('txt') });
    assertEqual(derived(m, ['result']).result.n, 3);
  });

  test('points: je Typ die Zeilenform, leer ohne Ergebnis; Massenableitung', () => {
    const c = derived(legacy(), ['points']).points;
    assertEqual(c.length, 40);
    assertDeepEqual(Object.keys(c[0]), ['cPlus', 'cMinus', 'signalHigh', 'signalLow']);
    const m = legacy();
    setFields(m, { chartTypeId: 'ewma' });
    const e = derived(m, ['points']).points;
    assertDeepEqual(Object.keys(e[0]), ['ewma', 'ucl', 'lcl', 'signal']);
    assertDeepEqual(derived(new State(), ['points']).points, []);
    assertDeepEqual([...State.schema.derivedBulk], ['points']);
  });

  test('activeParams je Typ (Pfade), activeColumnSlots', () => {
    const base = ['chartTypeId', 'sigmaMethod', 'baselineCount', 'targetOverride', 'sigmaOverride'];
    assertDeepEqual(derived(new State(), ['activeParams']).activeParams, [...base, 'params.ewma.lambda', 'params.ewma.L']);
    assertDeepEqual(derived(legacy(), ['activeParams']).activeParams, [...base, 'params.cusum.kSigma', 'params.cusum.hSigma']);
    assertDeepEqual(derived(legacy(), ['activeColumnSlots']).activeColumnSlots, ['columnRef']);
  });

  test('alle Ableitungen zusammen rufen die Engine einmal', () => {
    const m = legacy();
    setFields(m, { targetOverride: 25.001 });
    const n = engineRuns();
    const d = evaluateDerived(m, SRC, undefined, T);
    assertDeepEqual(Object.keys(d).sort(), ['activeColumnSlots', 'activeParams', 'points', 'result']);
    assertEqual(engineRuns(), n + 1);
    evaluateDerived(m, SRC, undefined, T);
    assertEqual(engineRuns(), n + 1, 'erneutes Lesen rechnet nicht');
    setFields(m, { params: withParams({ ewma: { lambda: 0.4 }, cusum: { hSigma: 5 } }) });
    evaluateDerived(m, SRC, undefined, T);
    assertEqual(engineRuns(), n + 1, 'Parameter des anderen Typs rechnen nicht neu');
  });

  test('alle Ableitungen ohne Wurf, auch ohne Übersetzer', () => {
    const d = evaluateDerived(legacy(), SRC);
    assert(d.result && !('error' in d.result), 'result ohne Fehler');
  });
});

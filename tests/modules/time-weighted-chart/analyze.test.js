/**
 * Zeitgewichtete Regelkarten: die Rechnung (domain/analyze.js) gegen die
 * Altrechnung. Die Literale haben die Form von `read().result` des Altmoduls
 * (`_agentResult`) und sind mit der unveränderten Engine gerechnet: das
 * Altprojekt (CUSUM, `sd`, Phase I 20, Ziel 25, h 5; nach Wechsel EWMA λ 0,1,
 * L 2,7; KPIs wie im E2E „Legacy project“ aus Task 0) und die Beispiele
 * `spc-time-weighted-ewma` und `spc-time-weighted-cusum` (§1 der Spec).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import {
  MIN_VALUES, CHART_TYPES, inputValues, inputsOf, analyze, analyzeWith, resultOf, pointsOf, errorOf, engineRuns,
} from '../../../js/modules/time-weighted-chart/domain/analyze.js';
import { computeEWMA, computeCUSUM, estimateSigma } from '../../../js/engines/time-weighted-chart-engine.js';

const plain = (v) => JSON.parse(JSON.stringify(v));

/** Spalte „Durchmesser“ der Altprojekt-Fixture (n = 40, ab Wert 25 um +0,075 verschoben). */
export const DURCHMESSER = [
  25.021, 24.983, 24.945, 24.988, 25.024, 24.956, 25.011, 25.003, 25.004, 25.004,
  25.005, 25.07, 25.035, 24.968, 24.912, 24.998, 25.011, 25.054, 24.938, 24.895,
  24.969, 24.973, 25.04, 24.96, 25.074, 25.109, 25.07, 24.999, 25.104, 25.057,
  25.066, 25.012, 25.099, 25.042, 24.997, 25.103, 25.11, 25.031, 25.054, 25.188,
];

/** Spalte „Wert“ des Arbeitsblatts `spc-time-weighted-drift` (n = 60). */
export const WERT = [
  10.0434, 9.99, 9.9997, 10.0357, 9.9768, 9.9781, 10.1046, 9.8829, 10.0684, 9.9163,
  9.9148, 10.0616, 10.0442, 10.0831, 9.8886, 9.8916, 10.1142, 10.1861, 9.9499, 9.9237,
  9.9646, 9.8735, 10.1799, 9.8636, 10.0277, 9.817, 10.0498, 9.9902, 10.1842, 10.0051,
  10.0696, 10.2617, 10.0471, 10.025, 9.9808, 10.2415, 10.1487, 10.0556, 9.9877, 10.0486,
  10.0731, 10.0247, 10.0937, 10.0633, 10.065, 10.1229, 10.1464, 10.0462, 10.1951, 10.16,
  10.1899, 10.0016, 10.307, 10.2058, 10.1431, 10.155, 10.0851, 10.1271, 10.2986, 10.1113,
];

/** `read().result` der Altform für das Altprojekt (CUSUM). */
export const LEGACY_RESULT = {
  chartType: 'cusum', n: 40, target: 25, sigma: 0.04464464958807632,
  k: 0.02232232479403816, h: 0.2232232479403816,
  signalsHigh: [28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39], signalsLow: [],
};

/** `read().result` der Altform für das Altprojekt nach Wechsel auf EWMA. */
export const LEGACY_EWMA_RESULT = {
  chartType: 'ewma', n: 40, target: 25, sigma: 0.04464464958807632, lambda: 0.1, L: 2.7,
  cl: 25, sigmaSteady: 0.010242185048642601, signals: [30, 32, 33, 34, 35, 36, 37, 38, 39],
};

/** `read().result` der Altform für das Beispiel `spc-time-weighted-ewma`. */
export const EXAMPLE_EWMA_RESULT = {
  chartType: 'ewma', n: 60, target: 10.058175000000004, sigma: 0.09649146532035095, lambda: 0.2, L: 3,
  cl: 10.058175000000004, sigmaSteady: 0.03216382177345032, signals: [25, 53, 58, 59],
};

/** `read().result` der Altform für das Beispiel `spc-time-weighted-cusum`. */
export const EXAMPLE_CUSUM_RESULT = {
  chartType: 'cusum', n: 60, target: 10.000310000000002, sigma: 0.11002384446074835,
  k: 0.055011922230374176, h: 0.4400953778429934,
  signalsHigh: [36, 37, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59], signalsLow: [],
};

const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
/** Spaltenleser wie `sourceColumns` über ein Wörterbuch Spalten-Id → Werte. */
const reader = (cols) => ({ values: (r) => cols[r.columnId] ?? null });
const COLS = reader({ d: DURCHMESSER, w: WERT });

const PARAMS = (o = {}) => ({
  ewma: { lambda: 0.2, L: 3, ...o.ewma },
  cusum: { kSigma: 0.5, hSigma: 4, ...o.cusum },
});
/** Stand des Models mit Vorgaben; `over` überschreibt. */
const model = (over = {}) => ({
  chartTypeId: 'ewma', columnRef: null, sigmaMethod: 'mr', baselineCount: null,
  targetOverride: null, sigmaOverride: null, params: PARAMS(), ...over,
});

const LEGACY_MODEL = model({
  chartTypeId: 'cusum', columnRef: ref('d'), sigmaMethod: 'sd', baselineCount: 20, targetOverride: 25,
  params: PARAMS({ ewma: { lambda: 0.1, L: 2.7 }, cusum: { hSigma: 5 } }),
});
const EX_EWMA_MODEL = model({ columnRef: ref('w') });
const EX_CUSUM_MODEL = model({ chartTypeId: 'cusum', columnRef: ref('w'), baselineCount: 30 });

const run = (m, read = COLS) => analyze(inputsOf(inputValues(m, read), m));

/** Führt `fn` aus, ohne dass `console.warn` die Ausgabe füllt; liefert die Zahl der Warnungen. */
function quiet(fn) {
  const orig = console.warn;
  let warned = 0;
  console.warn = () => { warned += 1; };
  try { return { value: fn(), warned }; } finally { console.warn = orig; }
}

suite('time-weighted-chart: Konstanten', () => {
  test('ab drei Zahlen', () => {
    assertEqual(MIN_VALUES, 3);
  });

  test('CHART_TYPES: je Typ die Parameternamen und die Engine', () => {
    assertDeepEqual(Object.keys(CHART_TYPES), ['ewma', 'cusum']);
    assertDeepEqual([...CHART_TYPES.ewma.params], ['lambda', 'L']);
    assertDeepEqual([...CHART_TYPES.cusum.params], ['kSigma', 'hSigma']);
    assertTrue(CHART_TYPES.ewma.engine === computeEWMA);
    assertTrue(CHART_TYPES.cusum.engine === computeCUSUM);
    assertTrue(Object.isFrozen(CHART_TYPES) && Object.isFrozen(CHART_TYPES.ewma.params));
  });
});

suite('time-weighted-chart: inputValues', () => {
  test('ohne Bezug null', () => {
    assertEqual(inputValues(model(), COLS), null);
  });

  test('nicht lesbare Spalte (gelöscht) → null', () => {
    assertEqual(inputValues(model({ columnRef: ref('gone') }), COLS), null);
  });

  test('nur echte Zahlen: Text „2,5“, null, NaN, undefined fallen heraus', () => {
    const read = reader({ a: [1, '2,5', 3, null, 5, NaN, undefined, 7, '8'] });
    assertDeepEqual(inputValues(model({ columnRef: ref('a') }), read), [1, 3, 5, 7]);
  });

  test('Reihenfolge der Spalte bleibt', () => {
    const v = inputValues(LEGACY_MODEL, COLS);
    assertEqual(v.length, 40);
    assertEqual(v[24], 25.074);
  });
});

suite('time-weighted-chart: inputsOf', () => {
  test('unter drei Werten oder ohne Werte null', () => {
    assertEqual(inputsOf(null, model()), null);
    assertEqual(inputsOf([], model()), null);
    assertEqual(inputsOf([1, 2], model()), null);
    assertTrue(inputsOf([1, 2, 4], model()) !== null);
  });

  test('Phase I: erste baselineCount Werte für Ziel und σ', () => {
    const i = inputsOf(DURCHMESSER, model({ baselineCount: 20, sigmaMethod: 'sd' }));
    const p1 = DURCHMESSER.slice(0, 20);
    assertEqual(i.target, p1.reduce((s, x) => s + x, 0) / 20);
    assertEqual(i.sigma, estimateSigma(p1, 'sd'));
  });

  test('Phase I leer oder ≥ n wie alle Werte', () => {
    const all = inputsOf(WERT, model());
    for (const bc of [60, 61, 1000]) {
      const i = inputsOf(WERT, model({ baselineCount: bc }));
      assertEqual(i.target, all.target, String(bc));
      assertEqual(i.sigma, all.sigma, String(bc));
    }
  });

  test('Ziel: Vorgabe statt Mittel, auch 0', () => {
    assertEqual(inputsOf(WERT, model({ targetOverride: 10 })).target, 10);
    assertEqual(inputsOf(WERT, model({ targetOverride: 0 })).target, 0);
  });

  test('σ: Vorgabe über 0 statt Schätzung; 0 wie leer', () => {
    const est = inputsOf(WERT, model()).sigma;
    assertEqual(inputsOf(WERT, model({ sigmaOverride: 0.5 })).sigma, 0.5);
    assertEqual(inputsOf(WERT, model({ sigmaOverride: 0 })).sigma, est);
    assertEqual(est, estimateSigma(WERT, 'mr'));
    assertEqual(inputsOf(WERT, model({ sigmaMethod: 'sd' })).sigma, estimateSigma(WERT, 'sd'));
  });

  test('σ nicht größer 0 (konstante Werte) → null', () => {
    assertEqual(inputsOf([5, 5, 5, 5], model()), null);
    assertEqual(inputsOf([5, 5, 5, 5], model({ sigmaMethod: 'sd' })), null);
  });

  test('Parameter des gewählten Typs als p1, p2', () => {
    const e = inputsOf(WERT, LEGACY_MODEL);
    assertEqual(e.type, 'cusum');
    assertDeepEqual([e.p1, e.p2], [0.5, 5]);
    const w = inputsOf(WERT, { ...LEGACY_MODEL, chartTypeId: 'ewma' });
    assertEqual(w.type, 'ewma');
    assertDeepEqual([w.p1, w.p2], [0.1, 2.7]);
  });
});

suite('time-weighted-chart: analyze', () => {
  test('inputs null → null (keine Ausgabe, kein Fehler), die Engine läuft nicht', () => {
    const n = engineRuns();
    assertEqual(analyze(null), null);
    assertEqual(analyzeWith(computeEWMA, null), null);
    assertEqual(engineRuns(), n);
  });

  test('Ergebnis: Status, Typ, Rohergebnis, n, Ziel, σ', () => {
    const a = run(LEGACY_MODEL);
    assertEqual(a.status, 'ok');
    assertEqual(a.type, 'cusum');
    assertEqual(a.n, 40);
    assertEqual(a.target, 25);
    assertEqual(a.fit.cPlus.length, 40);
  });

  test('gestubbte Engine bekommt Werte, Ziel, σ und die Parameter des Typs', () => {
    let seen = null;
    const engine = (...args) => { seen = args; return computeCUSUM(...args); };
    const inputs = inputsOf(inputValues(LEGACY_MODEL, COLS), LEGACY_MODEL);
    analyzeWith(engine, inputs);
    assertEqual(seen[0].length, 40);
    assertDeepEqual(seen.slice(1), [25, estimateSigma(DURCHMESSER.slice(0, 20), 'sd'), 0.5, 5]);
  });

  test('fremder Wurf (gestubbte Engine) → errCompute mit Warnung', () => {
    const engine = () => { throw new Error('boom'); };
    const { value, warned } = quiet(() => analyzeWith(engine, inputsOf(WERT, model())));
    assertDeepEqual(value, { status: 'error', reason: 'errCompute' });
    assertEqual(warned, 1, 'Ursache per console.warn');
  });

  test('nicht endliche Werte der EWMA (gestubbte Engine) → errCompute mit Warnung', () => {
    const inputs = inputsOf(WERT, model());
    const real = computeEWMA(WERT, inputs.target, inputs.sigma, 0.2, 3);
    const nan = (list) => list.map((v, i) => (i === 3 ? NaN : v));
    for (const patch of [{ values: nan(real.values) }, { ucl: nan(real.ucl) }, { lcl: real.lcl.map(() => -Infinity) },
      { sigma: nan(real.sigma) }, { cl: Infinity }, { sigmaSteady: NaN }]) {
      const { value, warned } = quiet(() => analyzeWith(() => ({ ...real, ...patch }), inputs));
      assertDeepEqual(value, { status: 'error', reason: 'errCompute' }, Object.keys(patch)[0]);
      assertEqual(warned, 1);
    }
  });

  test('nicht endliche Werte der CUSUM (gestubbte Engine) → errCompute mit Warnung', () => {
    const inputs = inputsOf(WERT, model({ chartTypeId: 'cusum' }));
    const real = computeCUSUM(WERT, inputs.target, inputs.sigma, 0.5, 4);
    for (const patch of [{ cPlus: [NaN, ...real.cPlus.slice(1)] }, { cMinus: real.cMinus.map(() => Infinity) },
      { h: Infinity }, { k: NaN }]) {
      const { value, warned } = quiet(() => analyzeWith(() => ({ ...real, ...patch }), inputs));
      assertDeepEqual(value, { status: 'error', reason: 'errCompute' }, Object.keys(patch)[0]);
      assertEqual(warned, 1);
    }
  });

  test('T7: Werte um 1,7·10³⁰⁸ ohne Ziel → Überlauf → errCompute (EWMA und CUSUM, mr und sd)', () => {
    const big = [1.7e308, 1.75e308, 1.72e308, 1.71e308, 1.74e308, 1.73e308];
    const read = reader({ big });
    for (const chartTypeId of ['ewma', 'cusum']) {
      for (const sigmaMethod of ['mr', 'sd']) {
        const m = model({ chartTypeId, sigmaMethod, columnRef: ref('big') });
        const { value } = quiet(() => analyzeWith(CHART_TYPES[chartTypeId].engine, inputsOf(inputValues(m, read), m)));
        assertDeepEqual(value, { status: 'error', reason: 'errCompute' }, `${chartTypeId}/${sigmaMethod}`);
        assertEqual(resultOf(value, m), null);
        assertDeepEqual(pointsOf(value), []);
      }
    }
  });

  test('Ränder aus Sonde (g) bleiben endlich: λ = 1e-12, σ-Vorgabe 1e-300', () => {
    const tiny = run({ ...LEGACY_MODEL, chartTypeId: 'ewma', params: PARAMS({ ewma: { lambda: 1e-12, L: 2.7 } }) });
    assertEqual(tiny.status, 'ok');
    assertEqual(tiny.fit.signals.length, 1);
    const ewma = run({ ...LEGACY_MODEL, chartTypeId: 'ewma', sigmaOverride: 1e-300 });
    assertEqual(ewma.status, 'ok');
    assertEqual(ewma.fit.signals.length, 40);
    const cusum = run({ ...LEGACY_MODEL, sigmaOverride: 1e-300 });
    assertEqual(cusum.status, 'ok');
    assertEqual(cusum.fit.signalsHi.length + cusum.fit.signalsLo.length, 60);
  });
});

suite('time-weighted-chart: Merker', () => {
  test('gleiche Eingabe → dasselbe Objekt, die Engine läuft nicht', () => {
    const a = run(LEGACY_MODEL);
    const n = engineRuns();
    const b = run(LEGACY_MODEL, reader({ d: [...DURCHMESSER] }));
    assertTrue(a === b, 'dasselbe Objekt');
    resultOf(b, LEGACY_MODEL); pointsOf(b); errorOf(b);
    assertEqual(engineRuns(), n, 'Ergebnis, Punkte und Grund rufen die Engine nicht');
  });

  test('Parameter des anderen Typs ändern → keine neue Rechnung', () => {
    const a = run(LEGACY_MODEL);
    const n = engineRuns();
    const b = run({ ...LEGACY_MODEL, params: PARAMS({ ewma: { lambda: 0.3, L: 2 }, cusum: { hSigma: 5 } }) });
    assertTrue(a === b);
    assertEqual(engineRuns(), n);
  });

  test('σ-Schätzmethode bei σ-Vorgabe > 0 → keine neue Rechnung', () => {
    const m = { ...LEGACY_MODEL, sigmaOverride: 0.05 };
    const a = run(m);
    const n = engineRuns();
    assertTrue(run({ ...m, sigmaMethod: 'mr' }) === a);
    assertEqual(engineRuns(), n);
  });

  test('Phase-I-Länge ≥ n statt leer → keine neue Rechnung', () => {
    const a = run(EX_EWMA_MODEL);
    const n = engineRuns();
    assertTrue(run({ ...EX_EWMA_MODEL, baselineCount: 60 }) === a);
    assertTrue(run({ ...EX_EWMA_MODEL, baselineCount: 99 }) === a);
    assertEqual(engineRuns(), n);
  });

  test('je wirksame Änderung genau eine neue Rechnung', () => {
    run(LEGACY_MODEL);
    let n = engineRuns();
    const steps = [
      { ...LEGACY_MODEL, chartTypeId: 'ewma' },
      { ...LEGACY_MODEL, chartTypeId: 'ewma', params: PARAMS({ ewma: { lambda: 0.3, L: 2.7 } }) },
      { ...LEGACY_MODEL, targetOverride: 25.01 },
      { ...LEGACY_MODEL, sigmaOverride: 0.05 },
      { ...LEGACY_MODEL, baselineCount: 25 },
      { ...LEGACY_MODEL, params: PARAMS({ cusum: { hSigma: 4 } }) },
      { ...LEGACY_MODEL, columnRef: ref('w') },
    ];
    for (const m of steps) {
      run(m);
      assertEqual(engineRuns(), n + 1, JSON.stringify(m.params));
      n = engineRuns();
    }
  });

  test('andere Zahl in der Spalte → neue Rechnung', () => {
    run(LEGACY_MODEL);
    const n = engineRuns();
    const d = [...DURCHMESSER];
    d[39] = 25.2;
    run(LEGACY_MODEL, reader({ d }));
    assertEqual(engineRuns(), n + 1);
  });

  test('der Merker hält auch Fehler und null', () => {
    const big = reader({ big: [1.7e308, 1.75e308, 1.72e308] });
    const m = model({ columnRef: ref('big') });
    const { value: e } = quiet(() => run(m, big));
    const n = engineRuns();
    assertTrue(run(m, big) === e, 'derselbe Fehler');
    assertEqual(engineRuns(), n);
    assertEqual(run(model()), null);
    assertEqual(run(model()), null);
    assertEqual(engineRuns(), n);
  });
});

suite('time-weighted-chart: resultOf gleich der Altform', () => {
  test('Altprojekt (CUSUM, sd, Phase I 20, Ziel 25, h 5)', () => {
    assertDeepEqual(resultOf(run(LEGACY_MODEL), LEGACY_MODEL), LEGACY_RESULT);
  });

  test('Altprojekt nach Wechsel auf EWMA (λ 0,1, L 2,7)', () => {
    const m = { ...LEGACY_MODEL, chartTypeId: 'ewma' };
    assertDeepEqual(resultOf(run(m), m), LEGACY_EWMA_RESULT);
  });

  test('Beispiel EWMA (alle Werte Phase I, mr)', () => {
    assertDeepEqual(resultOf(run(EX_EWMA_MODEL), EX_EWMA_MODEL), EXAMPLE_EWMA_RESULT);
  });

  test('Beispiel CUSUM (Phase I 30, mr)', () => {
    assertDeepEqual(resultOf(run(EX_CUSUM_MODEL), EX_CUSUM_MODEL), EXAMPLE_CUSUM_RESULT);
  });

  test('gegengerechnet wie `_runAnalysis` der Altform (Engine direkt)', () => {
    const p1 = DURCHMESSER.slice(0, 20);
    const r = computeCUSUM(DURCHMESSER, 25, estimateSigma(p1, 'sd'), 0.5, 5);
    assertDeepEqual([r.h, r.k, r.signalsHi, r.signalsLo], [LEGACY_RESULT.h, LEGACY_RESULT.k, LEGACY_RESULT.signalsHigh, []]);
    const mean = WERT.reduce((s, x) => s + x, 0) / WERT.length;
    const e = computeEWMA(WERT, mean, estimateSigma(WERT, 'mr'), 0.2, 3);
    assertDeepEqual([e.cl, e.sigmaSteady, e.signals], [EXAMPLE_EWMA_RESULT.cl, EXAMPLE_EWMA_RESULT.sigmaSteady, EXAMPLE_EWMA_RESULT.signals]);
  });

  test('KPI-Literale aus Task 0 (vier Stellen)', () => {
    const c = resultOf(run(LEGACY_MODEL), LEGACY_MODEL);
    assertDeepEqual([c.target, c.sigma, c.h, c.k].map((v) => v.toFixed(4)), ['25.0000', '0.0446', '0.2232', '0.0223']);
    assertEqual(c.signalsHigh.length + c.signalsLow.length, 12);
    const m = { ...LEGACY_MODEL, chartTypeId: 'ewma' };
    const e = resultOf(run(m), m);
    assertDeepEqual([e.target.toFixed(4), e.sigmaSteady.toFixed(4), e.signals.length], ['25.0000', '0.0102', 9]);
  });

  test('ohne Funktionen: übersteht JSON unverändert', () => {
    const r = resultOf(run(LEGACY_MODEL), LEGACY_MODEL);
    assertDeepEqual(plain(r), r);
  });

  test('null ohne Ergebnis oder bei Fehler', () => {
    assertEqual(resultOf(null, LEGACY_MODEL), null);
    assertEqual(resultOf({ status: 'error', reason: 'errCompute' }, LEGACY_MODEL), null);
  });
});

suite('time-weighted-chart: pointsOf', () => {
  test('EWMA: je Wert { ewma, ucl, lcl, signal }', () => {
    const a = run(EX_EWMA_MODEL);
    const p = pointsOf(a);
    assertEqual(p.length, 60);
    assertDeepEqual(Object.keys(p[0]), ['ewma', 'ucl', 'lcl', 'signal']);
    assertDeepEqual(p.flatMap((r, i) => (r.signal ? [i] : [])), [25, 53, 58, 59]);
    assertEqual(p[25].ewma, a.fit.values[25]);
    assertEqual(p[0].ucl, a.fit.ucl[0]);
  });

  test('CUSUM: je Wert { cPlus, cMinus, signalHigh, signalLow }', () => {
    const a = run(LEGACY_MODEL);
    const p = pointsOf(a);
    assertEqual(p.length, 40);
    assertDeepEqual(Object.keys(p[0]), ['cPlus', 'cMinus', 'signalHigh', 'signalLow']);
    assertDeepEqual(p.flatMap((r, i) => (r.signalHigh ? [i] : [])), LEGACY_RESULT.signalsHigh);
    assertEqual(p.filter((r) => r.signalLow).length, 0);
    assertEqual(p[39].cPlus, a.fit.cPlus[39]);
  });

  test('leer ohne Ergebnis oder bei Fehler', () => {
    assertDeepEqual(pointsOf(null), []);
    assertDeepEqual(pointsOf({ status: 'error', reason: 'errCompute' }), []);
  });
});

suite('time-weighted-chart: errorOf', () => {
  test('Grund als Schlüssel, null mit Ergebnis oder ohne Ausgabe', () => {
    assertEqual(errorOf(null), null);
    assertEqual(errorOf(run(LEGACY_MODEL)), null);
    assertEqual(errorOf({ status: 'error', reason: 'errCompute' }), 'errCompute');
  });

  test('Fehlerobjekt eines computed zählt als errCompute', () => {
    assertEqual(errorOf({ error: 'boom' }), 'errCompute');
  });
});

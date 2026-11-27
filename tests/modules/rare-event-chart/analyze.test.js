/**
 * Regelkarte seltener Ereignisse: die Rechnung (domain/analyze.js) gegen die
 * Altrechnung. Die Literale haben die Form von `read().result` des Altmoduls
 * (`_agentResult`) und sind mit der unveränderten Engine gerechnet: das
 * Altprojekt (t-Karte mit zwei Lücken; KPIs wie im E2E „Legacy project“ am
 * Altmodul), das Beispiel `spc-rare-event-t-chart` und die
 * CSV-Spalte „Counts“ (g) aus `test_data_rare_event.csv`.
 */
import { suite, test, assertEqual, assertDeepEqual, assertDeepClose, assertTrue, assertAlmostEqual } from '../../test-utils.js';
import {
  MIN_VALUES, ENGINES, inputValues, inputsOf, analyze, analyzeWith, plottedOf, signalIndices, resultOf, pointsOf,
  errorOf, engineRuns,
} from '../../../js/modules/rare-event-chart/domain/analyze.js';
import { computeGChart, computeTChart } from '../../../js/engines/rare-event-chart-engine.js';

const plain = (v) => JSON.parse(JSON.stringify(v));

/** Spalte „Tage“ der Altprojekt-Fixture (n = 20, 0 in Zeile 8, −4 in Zeile 13, langer Abstand in Zeile 16). */
export const TAGE = [
  18.4, 42.7, 9.6, 27.3, 35.1, 12.8, 51.2, 0, 22.5, 31.9,
  15.4, 46.8, -4, 28.6, 19.7, 612.5, 24.1, 38.3, 11.2, 33.6,
];

/** Spalte „TageSeitLetztem“ des Arbeitsblatts `spc-rare-event-days` (n = 25). */
export const TAGE_SEIT = [
  11.6921, 41.4018, 3.2852, 249.9181, 10.2135, 7.0512, 4.6458, 1.8973, 14.238, 35.9576,
  14.8728, 5.0957, 24.9812, 32.2817, 64.412, 14.9008, 40.216, 7.3493, 61.4168, 28.4459,
  28.5454, 46.1187, 9.5312, 35.235, 25.4252,
];

/** Spalte „Counts“ aus `test_data_rare_event.csv` (zwei leere Zellen am Ende). */
export const COUNTS = [5, 10, 8, 12, 7, 9, null, null];

/** `read().result` der Altform für das Altprojekt (t-Karte). */
export const LEGACY_RESULT = {
  chartType: 't', n: 18,
  cl: 33.54606888146074, ucl: 395.4172500824992, lcl: 0.000010651005254878462, sigma: 0.8705846747856095,
  transformed: true,
  plotted: { cl: 2.6533182420538868, ucl: 5.265072266410716, lcl: 0.041564217697058314, sigma: 0.8705846747856095 },
  signals: [15],
};

/** `read().result` der Altform für das Beispiel `spc-rare-event-t-chart`. */
export const EXAMPLE_RESULT = {
  chartType: 't', n: 25,
  cl: 21.580685914084842, ucl: 245.17518091977732, lcl: 0.00013526450683029717, sigma: 0.7543747362561878,
  transformed: true,
  plotted: { cl: 2.347327457576581, ucl: 4.610451666345144, lcl: 0.08420324880801777, sigma: 0.7543747362561878 },
  signals: [3],
};

/** `read().result` der Altform für die Spalte „Counts“ (g-Karte). */
export const COUNTS_RESULT = {
  chartType: 'g', n: 6,
  cl: 8.5, ucl: 35.458301133417145, lcl: 0, sigma: 8.986100377805714,
  transformed: false,
  plotted: { cl: 8.5, ucl: 35.458301133417145, lcl: 0, sigma: 8.986100377805714 },
  signals: [],
};

const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
/** Spaltenleser wie `sourceColumns` über ein Wörterbuch Spalten-Id → Werte. */
const reader = (cols) => ({ values: (r) => cols[r.columnId] ?? null });
const COLS = reader({ tage: TAGE, seit: TAGE_SEIT, counts: COUNTS });

/** Stand des Models mit Vorgaben; `over` überschreibt. */
const model = (over = {}) => ({ chartTypeId: 'g', columnRef: null, ...over });

const LEGACY_MODEL = model({ chartTypeId: 't', columnRef: ref('tage') });
const EXAMPLE_MODEL = model({ chartTypeId: 't', columnRef: ref('seit') });
const COUNTS_MODEL = model({ columnRef: ref('counts') });

const run = (m, read = COLS) => analyze(inputsOf(inputValues(m, read), m));

/** Führt `fn` aus, ohne dass `console.warn` die Ausgabe füllt; liefert die Zahl der Warnungen. */
function quiet(fn) {
  const orig = console.warn;
  let warned = 0;
  console.warn = () => { warned += 1; };
  try { return { value: fn(), warned }; } finally { console.warn = orig; }
}

suite('rare-event-chart: Konstanten', () => {
  test('ab zwei Werten; je Typ die Engine', () => {
    assertEqual(MIN_VALUES, 2);
    assertDeepEqual(Object.keys(ENGINES), ['g', 't']);
    assertTrue(ENGINES.g === computeGChart && ENGINES.t === computeTChart);
    assertTrue(Object.isFrozen(ENGINES));
  });
});

suite('rare-event-chart: inputValues', () => {
  test('ohne Bezug null', () => {
    assertEqual(inputValues(model(), COLS), null);
  });

  test('nicht lesbare Spalte (gelöscht) → null', () => {
    assertEqual(inputValues(model({ columnRef: ref('gone') }), COLS), null);
  });

  test('nur echte Zahlen: Text „2,5“, null, NaN, undefined fallen heraus; 0 und negative bleiben', () => {
    const read = reader({ a: [1, '2,5', 3, null, 0, NaN, undefined, -4, '8'] });
    assertDeepEqual(inputValues(model({ columnRef: ref('a') }), read), [1, 3, 0, -4]);
  });

  test('Reihenfolge der Spalte bleibt', () => {
    const v = inputValues(LEGACY_MODEL, COLS);
    assertEqual(v.length, 20);
    assertEqual(v[15], 612.5);
    assertDeepEqual(inputValues(COUNTS_MODEL, COLS), [5, 10, 8, 12, 7, 9]);
  });
});

suite('rare-event-chart: inputsOf', () => {
  test('ohne Werte null', () => {
    assertEqual(inputsOf(null, model()), null);
    assertEqual(inputsOf([], model()), null);
  });

  test('g: unter zwei Werten null; 0 zählt mit', () => {
    assertEqual(inputsOf([5], model()), null);
    assertDeepEqual(inputsOf([0, 0], model()), { type: 'g', values: [0, 0] });
  });

  test('t: unter zwei positiven Werten null', () => {
    const t = model({ chartTypeId: 't' });
    assertEqual(inputsOf([5], t), null);
    assertEqual(inputsOf([5, 0, -1], t), null);
    assertDeepEqual(inputsOf([5, 0, -1, 12], t), { type: 't', values: [5, 0, -1, 12] });
  });

  test('t: 0 und negative Werte bleiben in der Liste (Lücken)', () => {
    const i = inputsOf(TAGE, LEGACY_MODEL);
    assertEqual(i.values.length, 20);
    assertEqual(i.values[7], 0);
    assertEqual(i.values[12], -4);
  });
});

suite('rare-event-chart: analyze', () => {
  test('inputs null → null (keine Ausgabe, kein Fehler), die Engine läuft nicht', () => {
    const n = engineRuns();
    assertEqual(analyze(null), null);
    assertEqual(analyzeWith(computeGChart, null), null);
    assertEqual(engineRuns(), n);
  });

  test('Ergebnis: Status, Typ, n (t: nur die positiven), Rohergebnis', () => {
    const a = run(LEGACY_MODEL);
    assertEqual(a.status, 'ok');
    assertEqual(a.type, 't');
    assertEqual(a.n, 18);
    assertEqual(a.fit.transformed.length, 20);
    const g = run(COUNTS_MODEL);
    assertEqual(g.type, 'g');
    assertEqual(g.n, 6);
  });

  test('die Engine bekommt die gefilterten Werte unverändert', () => {
    let seen = null;
    const engine = (v) => { seen = v; return computeTChart(v); };
    analyzeWith(engine, inputsOf(inputValues(LEGACY_MODEL, COLS), LEGACY_MODEL));
    assertDeepEqual(seen, TAGE);
  });

  test('Wurf der Engine (gestubbt) → errCompute mit Warnung', () => {
    const engine = () => { throw new Error('boom'); };
    const { value, warned } = quiet(() => analyzeWith(engine, inputsOf(TAGE, LEGACY_MODEL)));
    assertDeepEqual(value, { status: 'error', reason: 'errCompute' });
    assertEqual(warned, 1, 'Ursache per console.warn');
  });

  test('nicht endliche gezeichnete Werte (gestubbte Engine) → errCompute mit Warnung', () => {
    const tIn = inputsOf(TAGE, LEGACY_MODEL);
    const t = computeTChart(TAGE);
    const gIn = inputsOf([5, 10, 8], model());
    const g = computeGChart([5, 10, 8]);
    const cases = [
      [tIn, { ...t, transformed: t.transformed.map((v, i) => (i === 3 ? NaN : v)) }, 'transformed NaN'],
      [tIn, { ...t, ucl: Infinity }, 'ucl'],
      [tIn, { ...t, cl: NaN }, 'cl'],
      [tIn, { ...t, lcl: -Infinity }, 'lcl'],
      [tIn, { ...t, sigma: Infinity }, 'sigma'],
      [gIn, { ...g, values: [5, Infinity, 8] }, 'g values'],
      [gIn, { ...g, ucl: Infinity, sigma: Infinity }, 'g ucl'],
      [gIn, null, 'kein Ergebnis'],
    ];
    for (const [inputs, fit, name] of cases) {
      const { value, warned } = quiet(() => analyzeWith(() => fit, inputs));
      assertDeepEqual(value, { status: 'error', reason: 'errCompute' }, name);
      assertEqual(warned, 1, name);
    }
  });

  test('nicht endliche Werte nur auf der Originalskala der t-Karte sind kein Fehler', () => {
    const tIn = inputsOf(TAGE, LEGACY_MODEL);
    const t = computeTChart(TAGE);
    const a = analyzeWith(() => ({ ...t, uclOriginal: Infinity, clOriginal: NaN }), tIn);
    assertEqual(a.status, 'ok');
    const r = resultOf(a);
    assertEqual(r.ucl, null);
    assertEqual(r.cl, null);
    assertDeepClose(r.plotted.ucl, LEGACY_RESULT.plotted.ucl);
  });

  test('T4: g-Karte mit Werten um 1e200 (ḡ(ḡ + 1) läuft über) → errCompute', () => {
    const m = model({ columnRef: ref('big') });
    const read = reader({ big: [1e200, 2e200, 1.5e200, 3e200, 2.5e200] });
    const { value, warned } = quiet(() => analyzeWith(computeGChart, inputsOf(inputValues(m, read), m)));
    assertDeepEqual(value, { status: 'error', reason: 'errCompute' });
    assertEqual(warned, 1);
    assertEqual(resultOf(value), null);
    assertDeepEqual(pointsOf(value), []);
  });

  test('T4: g-Karte mit Werten um 1,7·10³⁰⁸ (Summe läuft über) → errCompute', () => {
    const m = model({ columnRef: ref('big') });
    const read = reader({ big: [1.7e308, 1.75e308, 1.72e308, 1.71e308, 1.74e308] });
    const { value } = quiet(() => analyzeWith(computeGChart, inputsOf(inputValues(m, read), m)));
    assertDeepEqual(value, { status: 'error', reason: 'errCompute' });
  });

  test('t-Karte mit einem Wert um 1e308: gezeichnet endlich, UCL der Originalskala null (kein Fehler)', () => {
    const a = analyzeWith(computeTChart, inputsOf([10, 20, 1e308, 15, 30], model({ chartTypeId: 't' })));
    assertEqual(a.status, 'ok');
    const r = resultOf(a);
    assertEqual(r.ucl, null);
    assertTrue(Number.isFinite(r.cl) && Number.isFinite(r.sigma));
    assertTrue(Object.values(r.plotted).every(Number.isFinite));
  });

  test('Ränder: g nur Nullen, t mit genau zwei positiven Werten', () => {
    const z = analyzeWith(computeGChart, inputsOf([0, 0, 0, 0, 0], model()));
    assertDeepEqual(resultOf(z), {
      chartType: 'g', n: 5, cl: 0, ucl: 0, lcl: 0, sigma: 0, transformed: false,
      plotted: { cl: 0, ucl: 0, lcl: 0, sigma: 0 }, signals: [],
    });
    const two = resultOf(analyzeWith(computeTChart, inputsOf([5, 0, -1, 12], model({ chartTypeId: 't' }))));
    assertEqual(two.n, 2);
    assertEqual(two.sigma, 0);
    assertEqual(two.cl.toFixed(3), '7.954');
    assertEqual(two.ucl, two.cl);
    assertEqual(two.lcl, two.cl);
    assertDeepEqual(two.signals, [0, 3], 'beide Punkte sind Signale');
  });
});

suite('rare-event-chart: Merker', () => {
  test('gleiche Eingabe → dasselbe Objekt, die Engine läuft nicht', () => {
    const a = run(LEGACY_MODEL);
    const n = engineRuns();
    const b = run(LEGACY_MODEL, reader({ tage: [...TAGE] }));
    assertTrue(a === b, 'dasselbe Objekt');
    resultOf(b); pointsOf(b); errorOf(b); signalIndices(b); plottedOf(b);
    assertEqual(engineRuns(), n, 'Ergebnis, Punkte, Signale und Grund rufen die Engine nicht');
  });

  test('je wirksame Änderung genau eine neue Rechnung (Typ, Spalte, Wert)', () => {
    run(LEGACY_MODEL);
    let n = engineRuns();
    const changed = [...TAGE];
    changed[0] = 18.5;
    const steps = [
      [{ ...LEGACY_MODEL, chartTypeId: 'g' }, COLS],
      [LEGACY_MODEL, COLS],
      [EXAMPLE_MODEL, COLS],
      [LEGACY_MODEL, COLS],
      [LEGACY_MODEL, reader({ tage: changed })],
    ];
    for (const [m, read] of steps) {
      run(m, read);
      assertEqual(engineRuns(), n + 1, `${m.chartTypeId} ${m.columnRef.columnId}`);
      n = engineRuns();
    }
  });

  test('der Merker hält auch Fehler und null', () => {
    const big = reader({ big: [1e200, 2e200, 3e200] });
    const m = model({ columnRef: ref('big') });
    const { value: e } = quiet(() => run(m, big));
    const n = engineRuns();
    assertTrue(run(m, big) === e, 'derselbe Fehler');
    assertEqual(engineRuns(), n);
    assertEqual(run(model()), null);
    assertEqual(run(model()), null);
    assertEqual(engineRuns(), n);
  });

  test('die Eingabe wird kopiert: spätere Änderung an der Liste täuscht den Merker nicht', () => {
    const values = [...TAGE];
    const a = analyze({ type: 't', values });
    values[0] = 99;
    const n = engineRuns();
    const b = analyze({ type: 't', values });
    assertTrue(a !== b);
    assertEqual(engineRuns(), n + 1);
  });
});

suite('rare-event-chart: signalIndices', () => {
  test('strikt außerhalb der gezeichneten Grenzen; Lücken übersprungen', () => {
    const fit = { values: [1, 5, 10, 0, 11], cl: 5, ucl: 10, lcl: 1, sigma: 1 };
    assertDeepEqual(signalIndices({ status: 'ok', type: 'g', n: 5, fit }), [3, 4], 'auf der Grenze kein Signal');
    const tfit = { values: [], transformed: [null, 0.5, null, 3, 2], cl: 2, ucl: 2.5, lcl: 1, sigma: 0.5 };
    assertDeepEqual(signalIndices({ status: 'ok', type: 't', n: 3, fit: tfit }), [1, 3]);
  });

  test('Altprojekt: Index 15 (612,5 Tage), Lücken an 7 und 12 zählen nicht', () => {
    assertDeepEqual(signalIndices(run(LEGACY_MODEL)), [15]);
  });

  test('leer ohne Ergebnis oder bei Fehler', () => {
    assertDeepEqual(signalIndices(null), []);
    assertDeepEqual(signalIndices({ status: 'error', reason: 'errCompute' }), []);
  });
});

suite('rare-event-chart: plottedOf', () => {
  test('g die Zählwerte, t die transformierten Werte mit null an den Lücken', () => {
    const g = plottedOf(run(COUNTS_MODEL));
    assertDeepEqual(g.values, [5, 10, 8, 12, 7, 9]);
    assertDeepClose([g.cl, g.ucl, g.lcl, g.sigma], [8.5, COUNTS_RESULT.ucl, 0, COUNTS_RESULT.sigma]);
    const t = plottedOf(run(LEGACY_MODEL));
    assertEqual(t.values.length, 20);
    assertEqual(t.values[7], null);
    assertEqual(t.values[12], null);
    assertAlmostEqual(t.values[0], Math.pow(18.4, 1 / 3.6), 1e-12);
    assertDeepClose([t.cl, t.ucl, t.lcl, t.sigma], Object.values(LEGACY_RESULT.plotted));
  });

  test('null ohne Ergebnis oder bei Fehler', () => {
    assertEqual(plottedOf(null), null);
    assertEqual(plottedOf({ status: 'error', reason: 'errCompute' }), null);
  });
});

suite('rare-event-chart: resultOf gleich der Altform', () => {
  test('Altprojekt (t-Karte mit zwei Lücken)', () => {
    assertDeepClose(resultOf(run(LEGACY_MODEL)), LEGACY_RESULT);
  });

  test('Beispiel spc-rare-event-t-chart', () => {
    assertDeepClose(resultOf(run(EXAMPLE_MODEL)), EXAMPLE_RESULT);
  });

  test('CSV-Spalte „Counts“ (g-Karte)', () => {
    assertDeepClose(resultOf(run(COUNTS_MODEL)), COUNTS_RESULT);
  });

  test('Literale der Altform (KPIs drei Stellen, Diagramm-Beschriftung)', () => {
    const l = resultOf(run(LEGACY_MODEL));
    assertDeepEqual([l.cl, l.sigma, l.ucl, l.lcl].map((v) => v.toFixed(3)), ['33.546', '0.871', '395.417', '0.000']);
    assertDeepEqual([l.plotted.ucl.toFixed(3), l.plotted.cl.toFixed(3), l.plotted.lcl.toPrecision(3)], ['5.265', '2.653', '0.0416']);
    const e = resultOf(run(EXAMPLE_MODEL));
    assertDeepEqual([e.cl, e.ucl, e.sigma].map((v) => v.toFixed(3)), ['21.581', '245.175', '0.754']);
    const c = resultOf(run(COUNTS_MODEL));
    assertDeepEqual([c.cl, c.ucl, c.lcl].map((v) => v.toFixed(3)), ['8.500', '35.458', '0.000']);
  });

  test('gegengerechnet wie `_runAnalysis` der Altform (Engine direkt)', () => {
    const r = computeTChart(TAGE);
    assertDeepClose([r.clOriginal, r.uclOriginal, r.lclOriginal, r.sigma, r.cl, r.ucl, r.lcl],
      [LEGACY_RESULT.cl, LEGACY_RESULT.ucl, LEGACY_RESULT.lcl, LEGACY_RESULT.sigma,
        LEGACY_RESULT.plotted.cl, LEGACY_RESULT.plotted.ucl, LEGACY_RESULT.plotted.lcl]);
    const g = computeGChart([5, 10, 8, 12, 7, 9]);
    assertDeepClose([g.cl, g.ucl, g.lcl, g.sigma], [COUNTS_RESULT.cl, COUNTS_RESULT.ucl, 0, COUNTS_RESULT.sigma]);
  });

  test('ohne Funktionen: übersteht JSON unverändert', () => {
    const r = resultOf(run(LEGACY_MODEL));
    assertDeepEqual(plain(r), r);
  });

  test('null ohne Ergebnis oder bei Fehler', () => {
    assertEqual(resultOf(null), null);
    assertEqual(resultOf({ status: 'error', reason: 'errCompute' }), null);
  });
});

suite('rare-event-chart: Grenzen von Hand (aus dem Test der Altform)', () => {
  test('g-Karte: CL/UCL/LCL nach Benneyan', () => {
    const counts = [5, 12, 3, 8, 15, 7, 10, 9, 6, 11];
    const r = resultOf(run(model({ columnRef: ref('c') }), reader({ c: counts })));
    const gBar = 8.6;
    const sigma = Math.sqrt(gBar * (gBar + 1));
    assertAlmostEqual(r.cl, gBar, 1e-9, 'cl');
    assertAlmostEqual(r.sigma, sigma, 1e-9, 'sigma');
    assertAlmostEqual(r.ucl, gBar + 3 * sigma, 1e-9, 'ucl');
    assertAlmostEqual(r.lcl, 0, 1e-9, 'lcl');
  });

  test('t-Karte: y = t^(1/3,6) und I-MR-Grenzen', () => {
    const times = [10, 20, 5, 30, 15, 25];
    const r = resultOf(run(model({ chartTypeId: 't', columnRef: ref('c') }), reader({ c: times })));
    const y = times.map((t) => Math.pow(t, 1 / 3.6));
    const yBar = y.reduce((a, b) => a + b, 0) / y.length;
    let mrSum = 0;
    for (let i = 1; i < y.length; i++) mrSum += Math.abs(y[i] - y[i - 1]);
    const sigma = mrSum / (y.length - 1) / 1.128;
    assertAlmostEqual(r.plotted.cl, yBar, 1e-9, 'cl (transformiert)');
    assertAlmostEqual(r.sigma, sigma, 1e-9, 'sigma');
    assertAlmostEqual(r.plotted.ucl, yBar + 3 * sigma, 1e-9, 'ucl (transformiert)');
    assertAlmostEqual(r.plotted.lcl, Math.max(0, yBar - 3 * sigma), 1e-9, 'lcl (transformiert)');
    assertAlmostEqual(r.cl, Math.pow(yBar, 3.6), 1e-6, 'cl (Originalskala)');
  });
});

suite('rare-event-chart: pointsOf', () => {
  test('t: je Platz { value, signal }, null an den Lücken', () => {
    const a = run(LEGACY_MODEL);
    const p = pointsOf(a);
    assertEqual(p.length, 20);
    assertDeepEqual(Object.keys(p[0]), ['value', 'signal']);
    assertDeepEqual(p.flatMap((r, i) => (r.value === null ? [i] : [])), [7, 12]);
    assertDeepEqual(p.flatMap((r, i) => (r.signal ? [i] : [])), [15]);
    assertEqual(p[15].value, a.fit.transformed[15]);
  });

  test('g: die Zählwerte', () => {
    assertDeepEqual(pointsOf(run(COUNTS_MODEL)).map((r) => r.value), [5, 10, 8, 12, 7, 9]);
  });

  test('leer ohne Ergebnis oder bei Fehler', () => {
    assertDeepEqual(pointsOf(null), []);
    assertDeepEqual(pointsOf({ status: 'error', reason: 'errCompute' }), []);
  });
});

suite('rare-event-chart: errorOf', () => {
  test('Grund als Schlüssel, null mit Ergebnis oder ohne Ausgabe', () => {
    assertEqual(errorOf(null), null);
    assertEqual(errorOf(run(LEGACY_MODEL)), null);
    assertEqual(errorOf({ status: 'error', reason: 'errCompute' }), 'errCompute');
  });

  test('Fehlerobjekt eines computed zählt als errCompute', () => {
    assertEqual(errorOf({ error: 'boom' }), 'errCompute');
  });
});

/**
 * Multivariate Regelkarte: die Rechnung (domain/analyze.js) gegen die
 * Altrechnung. Die Literale haben die Form von `read().result` des Altmoduls
 * (`_agentResult`) für die Altprojekt-Fixture (α = 0,01, Phase I = 20; KPIs
 * wie im E2E „Legacy project“ aus Task 0) und das Beispiel
 * `spc-multivariate-t2` (α = 0,0027, alle Zeilen; Sonde (b)).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import {
  MIN_VARIABLES, ENGINE_ERROR_CODES, inputRows, baselineEndOf, optionsOf, analyze, analyzeWith,
  resultOf, pointsOf, errorOf, engineRuns,
} from '../../../js/modules/multivariate-control-chart/domain/analyze.js';
import { messageOf } from '../../../js/modules/multivariate-control-chart/domain/format.js';
import { computeHotellingT2 } from '../../../js/engines/multivariate-chart-engine.js';

const plain = (v) => JSON.parse(JSON.stringify(v));

/** Spalten der Altprojekt-Fixture (n = 30; Zeile 25, Index 24, bricht den Zusammenhang). */
const DRUCK = [
  5.07, 5.05, 5.02, 5.11, 5.1, 4.85, 5.03, 5.1, 5.06, 5.1, 5.06, 4.8, 4.79, 4.81, 4.98,
  4.83, 4.99, 5.05, 4.56, 5.28, 4.99, 5.23, 5.31, 5.38, 5.35, 4.72, 4.95, 4.82, 4.81, 4.65,
];
const TEMP = [
  180.4, 182.2, 180.4, 180.7, 179.4, 178.5, 179.8, 182.1, 180.1, 182.3, 184.4, 178.7, 174.4, 177, 177.8,
  176.1, 181.5, 183.4, 170.6, 185.4, 180.7, 184, 187, 184.7, 174, 173.6, 178.7, 173.6, 175.8, 172,
];
const DICHTE = [
  1.207, 1.21, 1.21, 1.214, 1.192, 1.183, 1.191, 1.204, 1.213, 1.228, 1.2, 1.198, 1.174, 1.184, 1.179,
  1.179, 1.206, 1.199, 1.166, 1.218, 1.203, 1.213, 1.233, 1.225, 1.215, 1.176, 1.193, 1.182, 1.173, 1.163,
];

/** Spalten des Beispiels `spc-multivariate-t2` (n = 40). */
const X1 = [
  9.443, 9.4997, 9.9555, 10.0867, 9.7519, 9.67, 10.0307, 9.0826, 11.8523, 10.8144,
  9.4757, 9.1637, 9.8257, 11.7311, 10.7309, 9.9616, 11.6278, 10.8584, 12.8445, 9.6387,
  10.2156, 11.0843, 9.839, 10.9086, 10.5786, 10.1041, 9.885, 9.1481, 11.581, 11.5,
  8.8, 11.3882, 9.3073, 10.0255, 10.2312, 10.4696, 9.7404, 9.6072, 9.721, 10.2589,
];
const X2 = [
  17.8709, 19.1593, 20.2643, 19.8516, 18.4807, 20.2459, 19.0573, 18.7571, 23.701, 21.8733,
  18.0973, 17.7089, 20.0591, 22.7193, 19.3088, 21.1978, 23.5493, 20.5041, 24.4945, 19.4812,
  23.182, 22.2895, 17.525, 21.3701, 23.0546, 21.2058, 18.6837, 20.7732, 22.6193, 17,
  23.5, 20.6831, 18.6879, 19.9861, 21.1606, 20.6288, 18.9269, 19.2184, 18.2083, 20.9376,
];

/** `read().result` der Altform für die Altprojekt-Fixture. */
const LEGACY_RESULT = {
  n: 30, p: 3, m: 20, cl: 3.3529411764705883, ucl: 18.254249708826574,
  mean: [4.982000000000001, 179.76, 1.1977499999999999],
  covariance: [
    [0.026216842105263177, 0.5011368421052635, 0.0021136842105263175],
    [0.5011368421052635, 12.086736842105273, 0.046352631578947395],
    [0.0021136842105263175, 0.046352631578947395, 0.0002674605263157896],
  ],
  signals: [24],
};

/** `read().result` der Altform für das Beispiel. */
const EXAMPLE_RESULT = {
  n: 40, p: 2, m: 40, cl: 2.0526315789473686, ucl: 14.598254418877096,
  mean: [10.260962500000002, 20.400564999999997],
  covariance: [[0.807552591121795, 0.9953267166025642], [0.9953267166025642, 3.764149381307691]],
  signals: [],
};

const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
/** Spaltenleser wie `sourceColumns` über ein Wörterbuch Spalten-Id → Werte. */
const reader = (cols) => ({ values: (r) => cols[r.columnId] ?? null });
const COLS = reader({ druck: DRUCK, temp: TEMP, dichte: DICHTE, x1: X1, x2: X2 });

const LEGACY_MODEL = { columnRefs: [ref('druck'), ref('temp'), ref('dichte')], alpha: 0.01, baselineCount: 20 };
const EXAMPLE_MODEL = { columnRefs: [ref('x1'), ref('x2')], alpha: 0.0027, baselineCount: null };
const run = (model, read = COLS) => analyze(inputRows(model, read), optionsOf(model));

/** Führt `fn` aus, ohne dass `console.warn` die Ausgabe füllt; liefert die Zahl der Warnungen. */
function quiet(fn) {
  const orig = console.warn;
  let warned = 0;
  console.warn = () => { warned += 1; };
  try { return { value: fn(), warned }; } finally { console.warn = orig; }
}

suite('multivariate-control-chart: Konstanten', () => {
  test('ab zwei Variablen', () => {
    assertEqual(MIN_VARIABLES, 2);
  });

  test('ENGINE_ERROR_CODES: jeder Wurf der Engine trägt einen Code der Liste', () => {
    const codeOf = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };
    const thrown = [
      codeOf(() => computeHotellingT2([[1, 2], [1, 3], [1, 4]])),
      codeOf(() => computeHotellingT2([[1, 2]])),
      codeOf(() => computeHotellingT2([[1], [2], [3]])),
      codeOf(() => computeHotellingT2([[1, 2], [3, 4, 5], [6, 7]])),
      codeOf(() => computeHotellingT2([[1, 2], [3, 5]])),
    ];
    assertDeepEqual(thrown, ['singular', 'tooFewObservations', 'tooFewVariables', 'rowLengthMismatch', 'baselineTooSmall']);
    assertDeepEqual([...ENGINE_ERROR_CODES], thrown);
  });
});

suite('multivariate-control-chart: inputRows, baselineEndOf', () => {
  test('unter zwei Bezügen null', () => {
    assertEqual(inputRows({ columnRefs: [] }, COLS), null);
    assertEqual(inputRows({ columnRefs: [ref('druck')] }, COLS), null);
  });

  test('eine nicht lesbare Spalte → null, keine Rechnung über die übrigen', () => {
    assertEqual(inputRows({ columnRefs: [ref('druck'), ref('gone'), ref('temp')] }, COLS), null);
  });

  test('nur Zeilen mit echten Zahlen in jeder Spalte (Text „2,5“, null, NaN nicht)', () => {
    const read = reader({ a: [1, '2,5', 3, null, 5, NaN, 7], b: [10, 20, 30, 40, 50, 60, 70] });
    assertDeepEqual(inputRows({ columnRefs: [ref('a'), ref('b')] }, read), [[1, 10], [3, 30], [5, 50], [7, 70]]);
  });

  test('die kürzeste Spalte zählt', () => {
    const read = reader({ a: [1, 2, 3, 4, 5], b: [10, 20, 30] });
    assertDeepEqual(inputRows({ columnRefs: [ref('a'), ref('b')] }, read), [[1, 10], [2, 20], [3, 30]]);
  });

  test('Spalten in der Reihenfolge der Bezüge', () => {
    const rows = inputRows(LEGACY_MODEL, COLS);
    assertEqual(rows.length, 30);
    assertDeepEqual(rows[24], [5.35, 174, 1.215]);
  });

  test('baselineEndOf: nur über p, sonst undefined (alle Zeilen)', () => {
    assertEqual(baselineEndOf(LEGACY_MODEL), 20);
    assertEqual(baselineEndOf({ ...LEGACY_MODEL, baselineCount: 3 }), undefined, 'gleich p');
    assertEqual(baselineEndOf({ ...LEGACY_MODEL, baselineCount: 1 }), undefined);
    assertEqual(baselineEndOf({ ...LEGACY_MODEL, baselineCount: 4 }), 4);
    assertEqual(baselineEndOf({ ...LEGACY_MODEL, baselineCount: null }), undefined);
  });

  test('optionsOf: α, wirksame Phase-I-Länge, p', () => {
    assertDeepEqual(optionsOf(LEGACY_MODEL), { alpha: 0.01, baselineEnd: 20, p: 3 });
    assertDeepEqual(optionsOf(EXAMPLE_MODEL), { alpha: 0.0027, baselineEnd: undefined, p: 2 });
  });
});

suite('multivariate-control-chart: analyze', () => {
  test('rows null → null (keine Ausgabe, kein Fehler)', () => {
    assertEqual(analyze(null, { alpha: 0.0027, baselineEnd: undefined, p: 1 }), null);
  });

  test('nicht mehr Zeilen als Variablen → errTooFewRows mit p, vor der Engine', () => {
    const n = engineRuns();
    assertDeepEqual(analyze([[1, 2], [3, 4]], { alpha: 0.0027, baselineEnd: undefined, p: 2 }),
      { status: 'error', reason: 'errTooFewRows', p: 2 });
    assertDeepEqual(analyze([], { alpha: 0.0027, baselineEnd: undefined, p: 3 }),
      { status: 'error', reason: 'errTooFewRows', p: 3 });
    assertEqual(engineRuns(), n, 'die Engine läuft nicht');
  });

  test('konstante Spalte → err_singular', () => {
    const rows = [[1, 5], [2, 5], [3, 5], [4, 5]];
    assertDeepEqual(analyze(rows, { alpha: 0.0027, baselineEnd: undefined, p: 2 }), { status: 'error', reason: 'err_singular' });
  });

  test('doppelter Bezug (Altstand) → err_singular', () => {
    const m = { columnRefs: [ref('druck'), ref('temp'), ref('druck')], alpha: 0.01, baselineCount: 20 };
    assertDeepEqual(run(m), { status: 'error', reason: 'err_singular' });
  });

  test('jeder Code der Engine wird err_<code>', () => {
    for (const code of ENGINE_ERROR_CODES) {
      const engine = () => { throw Object.assign(new Error('x'), { code }); };
      assertDeepEqual(analyzeWith(engine, [[1, 2], [3, 4], [5, 7]], { alpha: 0.0027, baselineEnd: undefined, p: 2 }),
        { status: 'error', reason: `err_${code}` }, code);
    }
  });

  test('fremder Wurf (gestubbte Engine) → errCompute mit Warnung', () => {
    const engine = () => { throw new Error('boom'); };
    const { value, warned } = quiet(() => analyzeWith(engine, [[1, 2], [3, 4], [5, 7]], { alpha: 0.0027, baselineEnd: undefined, p: 2 }));
    assertDeepEqual(value, { status: 'error', reason: 'errCompute' });
    assertEqual(warned, 1, 'Ursache per console.warn');
  });

  test('nicht endliche UCL, CL oder T² (gestubbte Engine) → errCompute mit Warnung', () => {
    const rows = [[1, 2], [3, 4], [5, 7]];
    const real = computeHotellingT2(rows);
    for (const patch of [{ ucl: Infinity }, { ucl: NaN }, { cl: -Infinity }, { t2: [1, NaN, 2] }, { t2: [1, Infinity, 2] }]) {
      const engine = () => ({ ...real, ...patch });
      const { value, warned } = quiet(() => analyzeWith(engine, rows, { alpha: 0.0027, baselineEnd: undefined, p: 2 }));
      assertDeepEqual(value, { status: 'error', reason: 'errCompute' }, JSON.stringify(Object.keys(patch)));
      assertEqual(warned, 1);
    }
  });

  test('gestubbte Engine bekommt α und Phase-I-Länge', () => {
    let seen = null;
    const engine = (rows, opts) => { seen = opts; return computeHotellingT2(rows, opts); };
    analyzeWith(engine, inputRows(LEGACY_MODEL, COLS), optionsOf(LEGACY_MODEL));
    assertDeepEqual(seen, { alpha: 0.01, baselineEnd: 20 });
  });

  test('extremes α bleibt endlich (Sonde (g))', () => {
    const small = run({ ...EXAMPLE_MODEL, alpha: 1e-12 });
    assertEqual(small.status, 'ok');
    assertEqual(small.fit.ucl.toFixed(3), '131.171');
    const large = run({ ...EXAMPLE_MODEL, alpha: 0.999999 });
    assertEqual(large.status, 'ok');
    assertEqual(large.fit.signals.length, 40);
  });

  test('Altprojekt: Rohergebnis der Engine mit n', () => {
    const a = run(LEGACY_MODEL);
    assertEqual(a.status, 'ok');
    assertEqual(a.n, 30);
    assertEqual(a.fit.m, 20);
    assertEqual(a.fit.t2.length, 30);
    assertEqual(a.fit.t2[24].toFixed(2), '74.33');
  });
});

suite('multivariate-control-chart: Merker', () => {
  test('gleiche Eingabe → dasselbe Objekt, die Engine läuft nicht', () => {
    const a = run(LEGACY_MODEL);
    const n = engineRuns();
    const b = analyze(inputRows(LEGACY_MODEL, COLS).map((r) => [...r]), optionsOf(LEGACY_MODEL));
    assertTrue(a === b, 'dasselbe Objekt');
    resultOf(b); pointsOf(b); errorOf(b);
    assertEqual(engineRuns(), n, 'Ergebnis, Punkte und Grund rufen die Engine nicht');
  });

  test('andere Zahl → neue Rechnung', () => {
    run(LEGACY_MODEL);
    const n = engineRuns();
    const rows = inputRows(LEGACY_MODEL, COLS);
    rows[0][1] = 180.5;
    analyze(rows, optionsOf(LEGACY_MODEL));
    assertEqual(engineRuns(), n + 1);
  });

  test('anderes α oder andere wirksame Phase-I-Länge → neue Rechnung', () => {
    run(LEGACY_MODEL);
    const n = engineRuns();
    run({ ...LEGACY_MODEL, alpha: 0.05 });
    assertEqual(engineRuns(), n + 1);
    run({ ...LEGACY_MODEL, alpha: 0.05, baselineCount: 25 });
    assertEqual(engineRuns(), n + 2);
    run({ ...LEGACY_MODEL, alpha: 0.05, baselineCount: null });
    assertEqual(engineRuns(), n + 3);
  });

  test('Phase-I-Länge innerhalb 1 … p: baselineEnd bleibt, keine neue Rechnung', () => {
    run({ ...LEGACY_MODEL, baselineCount: null });
    const n = engineRuns();
    run({ ...LEGACY_MODEL, baselineCount: 2 });
    run({ ...LEGACY_MODEL, baselineCount: 3 });
    assertEqual(engineRuns(), n);
  });

  test('der Merker hält auch Fehler und null', () => {
    const opts = { alpha: 0.0027, baselineEnd: undefined, p: 2 };
    const rows = [[1, 5], [2, 5], [3, 5], [4, 5]];
    const e = analyze(rows, opts);
    const n = engineRuns();
    assertTrue(analyze(rows.map((r) => [...r]), opts) === e);
    assertEqual(engineRuns(), n);
    assertEqual(analyze(null, opts), null);
    assertEqual(analyze(null, opts), null);
    const few = analyze([[1, 2]], opts);
    assertTrue(analyze([[1, 2]], opts) === few);
  });

  test('gleiche Zeilen, anderes p → neue Antwort', () => {
    const a = analyze([[1, 2], [3, 4]], { alpha: 0.0027, baselineEnd: undefined, p: 2 });
    const b = analyze([[1, 2], [3, 4]], { alpha: 0.0027, baselineEnd: undefined, p: 3 });
    assertEqual(a.p, 2);
    assertEqual(b.p, 3);
  });
});

suite('multivariate-control-chart: resultOf gleich der Altform', () => {
  test('Altprojekt (α = 0,01, Phase I = 20)', () => {
    assertDeepEqual(resultOf(run(LEGACY_MODEL)), LEGACY_RESULT);
  });

  test('Beispiel (α = 0,0027, alle Zeilen)', () => {
    assertDeepEqual(resultOf(run(EXAMPLE_MODEL)), EXAMPLE_RESULT);
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

suite('multivariate-control-chart: pointsOf', () => {
  test('je vollständiger Zeile eine Zeile, Signal markiert', () => {
    const p = pointsOf(run(LEGACY_MODEL));
    assertEqual(p.length, 30);
    assertDeepEqual(Object.keys(p[0]), ['t2', 'signal']);
    assertEqual(p[24].signal, true);
    assertEqual(p.filter((r) => r.signal).length, 1);
    assertEqual(p[24].t2.toFixed(2), '74.33');
  });

  test('Beispiel: kein Signal, Beobachtungen 30 und 31 unter der Grenze', () => {
    const p = pointsOf(run(EXAMPLE_MODEL));
    assertEqual(p.length, 40);
    assertEqual(p.filter((r) => r.signal).length, 0);
    assertEqual(p[29].t2.toFixed(2), '11.47');
    assertEqual(p[30].t2.toFixed(2), '12.11');
  });

  test('leer ohne Ergebnis oder bei Fehler', () => {
    assertDeepEqual(pointsOf(null), []);
    assertDeepEqual(pointsOf({ status: 'error', reason: 'err_singular' }), []);
  });
});

suite('multivariate-control-chart: errorOf und messageOf', () => {
  const T = (k, p) => (p ? `«${k}:${JSON.stringify(p)}»` : `«${k}»`);

  test('Grund als Schlüssel, null mit Ergebnis oder ohne Ausgabe', () => {
    assertEqual(errorOf(null), null);
    assertEqual(errorOf(run(LEGACY_MODEL)), null);
    assertEqual(errorOf({ status: 'error', reason: 'err_singular' }), 'err_singular');
    assertEqual(errorOf({ status: 'error', reason: 'errTooFewRows', p: 3 }), 'errTooFewRows');
  });

  test('Fehlerobjekt eines computed zählt als errCompute', () => {
    assertEqual(errorOf({ error: 'boom' }), 'errCompute');
    assertEqual(messageOf({ error: 'boom' }, T), '«errCompute»');
  });

  test('Text zum Grund; errTooFewRows setzt p ein; ohne Grund null', () => {
    assertEqual(messageOf({ status: 'error', reason: 'errTooFewRows', p: 3 }, T), '«errTooFewRows:{"p":3}»');
    assertEqual(messageOf({ status: 'error', reason: 'err_singular' }, T), '«err_singular»');
    assertEqual(messageOf(run(LEGACY_MODEL), T), null);
    assertEqual(messageOf(null, T), null);
  });
});

/**
 * Kurzserien-Regelkarte (Z-MR): die Rechnung (domain/analyze.js) gegen die
 * Altrechnung. Die Literale haben die Form von `read().result` des Altmoduls
 * (`_agentResult`) und sind mit der unveränderten Engine gerechnet: das
 * Altprojekt (drei Teile, eines mit nur einem Wert, ein Ausreißer), das
 * Beispiel `spc-short-run-zmr` und `test_data_short_run.csv`.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import {
  MIN_PAIRS, inputPairs, inputsOf, analyze, analyzeWith, stageBoundariesOf, resultOf, pointsOf, skippedOf,
  errorOf, engineRuns,
} from '../../../js/modules/short-run-chart/domain/analyze.js';
import { computeZMR } from '../../../js/engines/short-run-chart-engine.js';

const plain = (v) => JSON.parse(JSON.stringify(v));
const rep = (g, n) => Array(n).fill(g);

/** Spalten „Teil“ und „Mass“ der Altprojekt-Fixture (n = 20, Ausreißer 25,40 in Zeile 17). */
export const TEIL = [...rep('A', 9), ...rep('B', 10), 'C'];
export const MASS = [
  10.02, 9.98, 10.01, 10.03, 9.99, 10.00, 10.02, 9.97, 10.01,
  25.04, 24.98, 25.01, 24.97, 25.03, 25.00, 24.99, 25.40, 25.02, 24.98,
  7.50,
];

/** Spalten „Setup“ und „Messwert“ des Arbeitsblatts `spc-short-run-setups` (n = 24). */
export const SETUP = [...rep('S1', 8), ...rep('S2', 8), ...rep('S3', 8)];
export const MESSWERT = [
  10.0111, 9.9897, 10.0091, 10.0067, 10.0251, 9.9943, 10.0251, 10.0946,
  24.959, 24.965, 25.0404, 24.9539, 24.964, 24.9321, 25.037, 25.0329,
  7.5503, 7.375, 7.4981, 7.5581, 7.5165, 7.4624, 7.4675, 7.6009,
];

/** Spalten „Part“ und „Value“ aus `test_data_short_run.csv` (A 8, B 8 mit Ausreißer 100,0, C 1). */
export const PART = [...rep('A', 8), ...rep('B', 8), 'C'];
export const VALUE = [
  10.1, 10.3, 10.2, 10.4, 10.0, 10.5, 9.9, 10.2,
  20.2, 20.5, 20.1, 100.0, 20.0, 20.3, 20.7, 20.4,
  15.5,
];

/** `read().result` der Altform für das Altprojekt. */
export const LEGACY_RESULT = {
  n: 20, skipped: 1,
  groups: [
    { group: 'A', count: 9, mean: 10.003333333333334, sigma: 0.02770390070921927, mrBar: 0.031249999999999334 },
    { group: 'B', count: 10, mean: 25.042, sigma: 0.10441292356186031, mrBar: 0.11777777777777843 },
    { group: 'C', count: 1, mean: 7.5, sigma: 0, mrBar: 0 },
  ],
  z: { cl: 0, ucl: 3, lcl: -3 },
  mr: { cl: 1.0541889970208544, ucl: 3.4440354532671313, lcl: 0 },
  signalsZ: [16],
  signalsMR: [16, 17],
};

/** `read().result` der Altform für das Beispiel `spc-short-run-zmr`. */
export const EXAMPLE_RESULT = {
  n: 24, skipped: 0,
  groups: [
    { group: 'S1', count: 8, mean: 10.0194625, sigma: 0.02440476190476195, mrBar: 0.027528571428571475 },
    { group: 'S2', count: 8, mean: 24.985537500000003, sigma: 0.040387537993920884, mrBar: 0.045557142857142754 },
    { group: 'S3', count: 8, mean: 7.5036000000000005, sigma: 0.07505065856129688, mrBar: 0.08465714285714286 },
  ],
  z: { cl: 0, ucl: 3, lcl: -3 },
  mr: { cl: 1.2162752542850255, ucl: 3.973571255749178, lcl: 0 },
  signalsZ: [7],
  signalsMR: [],
};

/** `read().result` der Altform für `test_data_short_run.csv`. */
export const CSV_RESULT = {
  n: 17, skipped: 1,
  groups: [
    { group: 'A', count: 8, mean: 10.200000000000001, sigma: 0.29128672745694056, mrBar: 0.3285714285714289 },
    { group: 'B', count: 8, mean: 30.275000000000002, sigma: 20.466058763931112, mrBar: 23.085714285714293 },
    { group: 'C', count: 1, mean: 15.5, sigma: 0, mrBar: 0 },
  ],
  z: { cl: 0, ucl: 3, lcl: -3 },
  mr: { cl: 1.0479240408415835, ucl: 3.4235678414294535, lcl: 0 },
  signalsZ: [11],
  signalsMR: [11, 12],
};

const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
/** Spaltenleser wie `sourceColumns` über ein Wörterbuch Spalten-Id → Werte. */
const reader = (cols) => ({ values: (r) => cols[r.columnId] ?? null });
const COLS = reader({ teil: TEIL, mass: MASS, setup: SETUP, messwert: MESSWERT, part: PART, value: VALUE });

/** Stand des Models mit Vorgaben; `over` überschreibt. */
const model = (over = {}) => ({ valuesRef: null, groupsRef: null, ...over });

const LEGACY_MODEL = model({ valuesRef: ref('mass'), groupsRef: ref('teil') });
const EXAMPLE_MODEL = model({ valuesRef: ref('messwert'), groupsRef: ref('setup') });
const CSV_MODEL = model({ valuesRef: ref('value'), groupsRef: ref('part') });

const run = (m, read = COLS) => analyze(inputsOf(inputPairs(m, read)));
const pairs = (values, groups) => ({ values, groups });

/** Führt `fn` aus, ohne dass `console.warn` die Ausgabe füllt; liefert die Zahl der Warnungen. */
function quiet(fn) {
  const orig = console.warn;
  let warned = 0;
  console.warn = () => { warned += 1; };
  try { return { value: fn(), warned }; } finally { console.warn = orig; }
}

suite('short-run-chart: Konstanten', () => {
  test('ab vier Paaren', () => {
    assertEqual(MIN_PAIRS, 4);
  });
});

suite('short-run-chart: inputPairs', () => {
  test('ohne einen der beiden Bezüge null', () => {
    assertEqual(inputPairs(model(), COLS), null);
    assertEqual(inputPairs(model({ valuesRef: ref('mass') }), COLS), null);
    assertEqual(inputPairs(model({ groupsRef: ref('teil') }), COLS), null);
  });

  test('nicht lesbare Spalte (gelöscht) → null, je Spalte', () => {
    assertEqual(inputPairs(model({ valuesRef: ref('gone'), groupsRef: ref('teil') }), COLS), null);
    assertEqual(inputPairs(model({ valuesRef: ref('mass'), groupsRef: ref('gone') }), COLS), null);
  });

  test('paarweise: Text „2,5“, null, NaN, undefined bei den Werten und null/„“ bei den Teilen fallen heraus', () => {
    const read = reader({
      v: [1, '2,5', 3, null, NaN, undefined, 7, 8, 9, 0, -4],
      g: ['A', 'A', null, 'A', 'B', 'B', '', undefined, 'B', 'B', 'C'],
    });
    assertDeepEqual(inputPairs(model({ valuesRef: ref('v'), groupsRef: ref('g') }), read),
      pairs([1, 9, 0, -4], ['A', 'B', 'B', 'C']));
  });

  test('die kürzere Spalte begrenzt (beide Richtungen)', () => {
    const read = reader({ v: [1, 2, 3, 4, 5], g: ['A', 'A', 'B'], gl: ['A', 'A', 'B', 'B', 'B', 'C', 'C'] });
    assertDeepEqual(inputPairs(model({ valuesRef: ref('v'), groupsRef: ref('g') }), read), pairs([1, 2, 3], ['A', 'A', 'B']));
    assertDeepEqual(inputPairs(model({ valuesRef: ref('v'), groupsRef: ref('gl') }), read).groups, ['A', 'A', 'B', 'B', 'B']);
  });

  test('Teile als Zahl bleiben Zahlen (die Engine macht Text daraus)', () => {
    const read = reader({ v: [1, 2, 3, 4], g: [1, 1, 2, 2] });
    assertDeepEqual(inputPairs(model({ valuesRef: ref('v'), groupsRef: ref('g') }), read).groups, [1, 1, 2, 2]);
  });

  test('Altprojekt: alle 20 Paare in Datenfolge', () => {
    assertDeepEqual(inputPairs(LEGACY_MODEL, COLS), pairs(MASS, TEIL));
  });
});

suite('short-run-chart: inputsOf', () => {
  test('ohne Paare oder unter vier Paaren null', () => {
    assertEqual(inputsOf(null), null);
    assertEqual(inputsOf(pairs([], [])), null);
    assertEqual(inputsOf(pairs([1, 2, 3], ['A', 'A', 'B'])), null);
  });

  test('ab vier Paaren die Paare selbst', () => {
    const p = pairs([1, 2, 3, 4], ['A', 'A', 'B', 'B']);
    assertTrue(inputsOf(p) === p);
  });
});

suite('short-run-chart: analyze', () => {
  test('inputs null → null (keine Ausgabe, kein Fehler), die Engine läuft nicht', () => {
    const n = engineRuns();
    assertEqual(analyze(null), null);
    assertEqual(analyzeWith(computeZMR, null), null);
    assertEqual(engineRuns(), n);
  });

  test('Ergebnis: Status, n, Rohergebnis', () => {
    const a = run(LEGACY_MODEL);
    assertEqual(a.status, 'ok');
    assertEqual(a.n, 20);
    assertEqual(a.fit.z.length, 20);
    assertEqual(a.fit.mr[0], null);
  });

  test('die Engine bekommt die Paare unverändert', () => {
    let seen = null;
    const engine = (v, g) => { seen = { v, g }; return computeZMR(v, g); };
    analyzeWith(engine, inputsOf(inputPairs(CSV_MODEL, COLS)));
    assertDeepEqual(seen, { v: VALUE, g: PART });
  });

  test('Wurf der Engine (gestubbt) → errCompute mit Warnung', () => {
    const engine = () => { throw new Error('boom'); };
    const { value, warned } = quiet(() => analyzeWith(engine, pairs(MASS, TEIL)));
    assertDeepEqual(value, { status: 'error', reason: 'errCompute' });
    assertEqual(warned, 1, 'Ursache per console.warn');
  });

  test('nicht endliche gezeichnete Werte (gestubbte Engine) → errCompute mit Warnung', () => {
    const fit = computeZMR(MASS, TEIL);
    const cases = [
      [{ ...fit, z: fit.z.map((v, i) => (i === 3 ? NaN : v)) }, 'z NaN'],
      [{ ...fit, z: fit.z.map((v, i) => (i === 0 ? -Infinity : v)) }, 'z −Infinity'],
      [{ ...fit, mr: fit.mr.map((v, i) => (i === 5 ? Infinity : v)) }, 'mr Infinity'],
      [{ ...fit, mr: fit.mr.map((v, i) => (i === 5 ? null : v)) }, 'mr Lücke mitten in der Reihe'],
      [{ ...fit, mr: [0, ...fit.mr.slice(1)] }, 'mr ohne führende Lücke'],
      [{ ...fit, mrBarZ: NaN }, 'mrBarZ'],
      [{ ...fit, uclMR: Infinity }, 'uclMR'],
      [{ ...fit, lclMR: NaN }, 'lclMR'],
      [null, 'kein Ergebnis'],
    ];
    for (const [stub, name] of cases) {
      const { value, warned } = quiet(() => analyzeWith(() => stub, pairs(MASS, TEIL)));
      assertDeepEqual(value, { status: 'error', reason: 'errCompute' }, name);
      assertEqual(warned, 1, name);
    }
  });

  test('die führende Lücke der MR-Reihe ist kein Fehler', () => {
    const a = analyzeWith(computeZMR, pairs(MASS, TEIL));
    assertEqual(a.status, 'ok');
    assertEqual(a.fit.mr[0], null);
  });

  test('nicht endliche Kennzahlen nur eines Teils sind kein Fehler; im Ergebnis null', () => {
    const fit = computeZMR(MASS, TEIL);
    const groups = fit.groups.map((g, i) => (i === 0 ? { ...g, mean: Infinity, sigma: NaN, mrBar: Infinity } : g));
    const a = analyzeWith(() => ({ ...fit, groups }), pairs(MASS, TEIL));
    assertEqual(a.status, 'ok');
    const r = resultOf(a);
    assertDeepEqual(r.groups[0], { group: 'A', count: 9, mean: null, sigma: null, mrBar: null });
    assertDeepEqual(r.mr, LEGACY_RESULT.mr);
  });

  test('Überlauf: Werte um 1,7·10³⁰⁸ in einem Teil → errCompute', () => {
    const values = [1.7e308, 1.75e308, 1.72e308, 1.71e308, 1.74e308, 10, 11, 10.5, 10.2];
    const groups = [...rep('A', 5), ...rep('B', 4)];
    const fit = computeZMR(values, groups);
    assertEqual(fit.mr[0], null, 'die MR-Reihe beginnt auch hier mit der Lücke');
    assertTrue(!fit.z.every(Number.isFinite), 'die Engine liefert nicht endliche z');
    const { value, warned } = quiet(() => analyzeWith(computeZMR, inputsOf(pairs(values, groups))));
    assertDeepEqual(value, { status: 'error', reason: 'errCompute' });
    assertEqual(warned, 1);
    assertEqual(resultOf(value), null);
    assertDeepEqual(pointsOf(value), []);
    assertEqual(skippedOf(value), 0);
  });

  test('Werte um 10²⁰⁰ sind kein Fehler', () => {
    const values = [1e200, 1.02e200, 0.99e200, 1.01e200, 1e200, 10, 11, 10.5, 10.2];
    const groups = [...rep('A', 5), ...rep('B', 4)];
    const a = analyzeWith(computeZMR, inputsOf(pairs(values, groups)));
    assertEqual(a.status, 'ok');
    assertTrue(Number.isFinite(resultOf(a).groups[0].mean));
  });

  test('Ränder: jedes Teil mit einem Wert (alles übersprungen, z = 0, MR̄ = 0)', () => {
    const a = analyzeWith(computeZMR, inputsOf(pairs([1, 2, 3, 4, 5], ['A', 'B', 'C', 'D', 'E'])));
    const r = resultOf(a);
    assertEqual(r.skipped, 5);
    assertDeepEqual(r.mr, { cl: 0, ucl: 0, lcl: 0 });
    assertDeepEqual([r.signalsZ, r.signalsMR], [[], []]);
    assertDeepEqual(pointsOf(a).map((p) => p.z), [0, 0, 0, 0, 0]);
    assertDeepEqual(stageBoundariesOf(a.fit), [1, 2, 3, 4]);
  });

  test('Ränder: genau vier Paare (A, A, B, B)', () => {
    const a = analyzeWith(computeZMR, inputsOf(pairs([10, 10.2, 20, 20.3], ['A', 'A', 'B', 'B'])));
    const r = resultOf(a);
    assertEqual(r.n, 4);
    assertEqual(r.mr.cl.toFixed(3), '1.128');
    assertEqual(r.mr.ucl.toFixed(3), '3.685');
    assertDeepEqual(stageBoundariesOf(a.fit), [2]);
  });
});

suite('short-run-chart: Merker', () => {
  test('gleiche Eingabe → dasselbe Objekt, die Engine läuft nicht', () => {
    const a = run(LEGACY_MODEL);
    const n = engineRuns();
    const b = run(LEGACY_MODEL, reader({ mass: [...MASS], teil: [...TEIL] }));
    assertTrue(a === b, 'dasselbe Objekt');
    resultOf(b); pointsOf(b); skippedOf(b); errorOf(b); stageBoundariesOf(b.fit);
    assertEqual(engineRuns(), n, 'Ergebnis, Punkte, Hinweis, Trennlinien und Grund rufen die Engine nicht');
  });

  test('je wirksame Änderung genau eine neue Rechnung (Messwertspalte, Teilespalte, Wert, Teil)', () => {
    run(LEGACY_MODEL);
    let n = engineRuns();
    const mass = [...MASS];
    mass[0] = 10.03;
    const teil = [...TEIL];
    teil[19] = 'B';
    const steps = [
      [EXAMPLE_MODEL, COLS, 'andere Spalten'],
      [LEGACY_MODEL, COLS, 'zurück'],
      [model({ valuesRef: ref('mass'), groupsRef: ref('part') }), COLS, 'andere Teilespalte'],
      [LEGACY_MODEL, COLS, 'zurück'],
      [LEGACY_MODEL, reader({ mass, teil: TEIL }), 'Wert geändert'],
      [LEGACY_MODEL, reader({ mass, teil }), 'Teil geändert'],
    ];
    for (const [m, read, name] of steps) {
      run(m, read);
      assertEqual(engineRuns(), n + 1, name);
      n = engineRuns();
    }
  });

  test('Teil als Zahl und als Text sind verschiedene Eingaben', () => {
    const a = analyze(pairs([1, 2, 3, 4], [1, 1, 2, 2]));
    const n = engineRuns();
    const b = analyze(pairs([1, 2, 3, 4], ['1', '1', '2', '2']));
    assertTrue(a !== b);
    assertEqual(engineRuns(), n + 1);
  });

  test('der Merker hält auch Fehler und null', () => {
    const values = [1.7e308, 1.75e308, 1.72e308, 10, 11];
    const groups = ['A', 'A', 'A', 'B', 'B'];
    const { value: e } = quiet(() => analyze(pairs(values, groups)));
    const n = engineRuns();
    assertTrue(analyze(pairs([...values], [...groups])) === e, 'derselbe Fehler');
    assertEqual(engineRuns(), n);
    assertEqual(run(model()), null);
    assertEqual(run(model()), null);
    assertEqual(engineRuns(), n);
  });

  test('die Eingabe wird kopiert: spätere Änderung an den Listen täuscht den Merker nicht', () => {
    const values = [...MASS];
    const groups = [...TEIL];
    const a = analyze({ values, groups });
    values[0] = 99;
    let n = engineRuns();
    const b = analyze({ values, groups });
    assertTrue(a !== b);
    assertEqual(engineRuns(), n + 1);
    groups[0] = 'B';
    n = engineRuns();
    analyze({ values, groups });
    assertEqual(engineRuns(), n + 1);
  });
});

suite('short-run-chart: stageBoundariesOf', () => {
  test('Blöcke: kumulierte Teilegrößen ohne die letzte', () => {
    assertDeepEqual(stageBoundariesOf(run(LEGACY_MODEL).fit), [9, 19]);
    assertDeepEqual(stageBoundariesOf(run(EXAMPLE_MODEL).fit), [8, 16]);
    assertDeepEqual(stageBoundariesOf(run(CSV_MODEL).fit), [8, 16]);
  });

  test('verschachtelt A, B, A: nach Stückzahl in Reihenfolge des Auftretens, wie die Altform', () => {
    const values = [10, 10.1, 9.9, 10.05, 20, 20.2, 19.8, 20.1, 10.02, 9.97, 10.08, 9.95];
    const groups = [...rep('A', 4), ...rep('B', 4), ...rep('A', 4)];
    const a = analyzeWith(computeZMR, pairs(values, groups));
    assertDeepEqual(resultOf(a).groups.map((g) => [g.group, g.count]), [['A', 8], ['B', 4]]);
    assertDeepEqual(stageBoundariesOf(a.fit), [8]);
  });

  test('ein Teil: keine Trennlinie; ohne Ergebnis leer', () => {
    assertDeepEqual(stageBoundariesOf(computeZMR([1, 2, 3, 4], ['A', 'A', 'A', 'A'])), []);
    assertDeepEqual(stageBoundariesOf(null), []);
    assertDeepEqual(stageBoundariesOf(undefined), []);
  });
});

suite('short-run-chart: resultOf gleich der Altform', () => {
  test('Altprojekt', () => {
    assertDeepEqual(resultOf(run(LEGACY_MODEL)), LEGACY_RESULT);
  });

  test('Beispiel spc-short-run-zmr', () => {
    assertDeepEqual(resultOf(run(EXAMPLE_MODEL)), EXAMPLE_RESULT);
  });

  test('test_data_short_run.csv', () => {
    assertDeepEqual(resultOf(run(CSV_MODEL)), CSV_RESULT);
  });

  test('Literale der Altform (KPIs und Tabelle auf drei Stellen)', () => {
    const l = resultOf(run(LEGACY_MODEL));
    assertDeepEqual([l.mr.cl, l.mr.ucl].map((v) => v.toFixed(3)), ['1.054', '3.444']);
    assertDeepEqual(l.groups.map((g) => [g.group, g.count, ...[g.mean, g.sigma, g.mrBar].map((v) => v.toFixed(3))]), [
      ['A', 9, '10.003', '0.028', '0.031'],
      ['B', 10, '25.042', '0.104', '0.118'],
      ['C', 1, '7.500', '0.000', '0.000'],
    ]);
    assertEqual(l.signalsZ.length + l.signalsMR.length, 3);
    const e = resultOf(run(EXAMPLE_MODEL));
    assertDeepEqual([e.mr.cl, e.mr.ucl].map((v) => v.toFixed(7)), ['1.2162753', '3.9735713']);
    const c = resultOf(run(CSV_MODEL));
    assertDeepEqual([c.mr.cl, c.mr.ucl].map((v) => v.toFixed(7)), ['1.0479240', '3.4235678']);
  });

  test('gegengerechnet wie `_runAnalysis` der Altform (Engine direkt)', () => {
    const r = computeZMR(MASS, TEIL);
    assertDeepEqual([r.mrBarZ, r.uclMR, r.lclMR, r.skipped], [LEGACY_RESULT.mr.cl, LEGACY_RESULT.mr.ucl, 0, 1]);
    assertDeepEqual([r.signalsZ, r.signalsMR], [LEGACY_RESULT.signalsZ, LEGACY_RESULT.signalsMR]);
  });

  test('Teile als Zahl werden im Ergebnis Text', () => {
    const r = resultOf(analyzeWith(computeZMR, pairs([10, 10.2, 10.1, 20, 20.3, 20.1], [1, 1, 1, 2, 2, 2])));
    assertDeepEqual(r.groups.map((g) => g.group), ['1', '2']);
  });

  test('ohne Funktionen: übersteht JSON unverändert; Listen sind Kopien', () => {
    const a = run(LEGACY_MODEL);
    const r = resultOf(a);
    assertDeepEqual(plain(r), r);
    assertTrue(r.signalsZ !== a.fit.signalsZ && r.signalsMR !== a.fit.signalsMR);
  });

  test('null ohne Ergebnis oder bei Fehler', () => {
    assertEqual(resultOf(null), null);
    assertEqual(resultOf({ status: 'error', reason: 'errCompute' }), null);
  });
});

suite('short-run-chart: pointsOf', () => {
  test('je Paar { z, mr, signalZ, signalMR }, mr null in Zeile 0', () => {
    const a = run(LEGACY_MODEL);
    const p = pointsOf(a);
    assertEqual(p.length, 20);
    assertDeepEqual(Object.keys(p[0]), ['z', 'mr', 'signalZ', 'signalMR']);
    assertEqual(p[0].mr, null);
    assertTrue(p.slice(1).every((r) => Number.isFinite(r.mr)));
    assertDeepEqual(p.flatMap((r, i) => (r.signalZ ? [i] : [])), [16]);
    assertDeepEqual(p.flatMap((r, i) => (r.signalMR ? [i] : [])), [16, 17]);
    assertEqual(p[16].z, a.fit.z[16]);
    assertEqual(p[19].z, 0, 'Teil C ohne Streuung: z = 0');
  });

  test('leer ohne Ergebnis oder bei Fehler', () => {
    assertDeepEqual(pointsOf(null), []);
    assertDeepEqual(pointsOf({ status: 'error', reason: 'errCompute' }), []);
  });
});

suite('short-run-chart: skippedOf, errorOf', () => {
  test('skippedOf: Zahl der Werte aus Teilen ohne Streuung; 0 ohne Ergebnis', () => {
    assertEqual(skippedOf(run(LEGACY_MODEL)), 1);
    assertEqual(skippedOf(run(EXAMPLE_MODEL)), 0);
    assertEqual(skippedOf(null), 0);
    assertEqual(skippedOf({ status: 'error', reason: 'errCompute' }), 0);
  });

  test('errorOf: Grund als Schlüssel, null mit Ergebnis oder ohne Ausgabe', () => {
    assertEqual(errorOf(null), null);
    assertEqual(errorOf(run(LEGACY_MODEL)), null);
    assertEqual(errorOf({ status: 'error', reason: 'errCompute' }), 'errCompute');
  });

  test('errorOf: Fehlerobjekt eines computed zählt als errCompute', () => {
    assertEqual(errorOf({ error: 'boom' }), 'errCompute');
  });
});

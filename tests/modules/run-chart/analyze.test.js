/**
 * Verlaufsdiagramm: die Rechnung (domain/analyze.js) gegen die Altrechnung.
 * Die Literale stammen aus dem Altmodul (`_runAnalysis`, `read().result`)
 * für die Altprojekt-Fixture und das Beispiel `spc-run-chart-shift`.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertDeepClose } from '../../test-utils.js';
import {
  TEST_IDS, MIN_VALUES, inputValues, analyze, isFlagged, flaggedCount, resultOf, pointsOf, engineRuns,
} from '../../../js/modules/run-chart/domain/analyze.js';

const plain = (v) => JSON.parse(JSON.stringify(v));

/** Spalte „Durchmesser“ der Altprojekt-Fixture (n = 24). */
const DURCHMESSER = [
  9.96, 9.98, 10.01, 10.03, 10, 10.02, 10.04, 10.05, 10.03, 10.06, 10.08, 10.07,
  10.36, 10.38, 10.41, 10.43, 10.4, 10.42, 10.44, 10.45, 10.43, 10.46, 10.48, 10.47,
];

/** `read().result` des Altmoduls für die Altprojekt-Fixture (α 0,1). */
const LEGACY_RESULT = {
  n: 24, median: 10.219999999999999, runsAboutMedian: 2, runsUpDown: 12, flagged: 2,
  tests: [
    { id: 'clustering', p: 0.000002200937432472738, observed: 2, flagged: true },
    { id: 'mixtures', p: 0.9999977990625675, observed: 2, flagged: false },
    { id: 'trends', p: 0.03243159904910542, observed: 12, flagged: true },
    { id: 'oscillation', p: 0.9675684009508946, observed: 12, flagged: false },
  ],
};

const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
/** Spaltenleser wie `sourceColumns` über ein Wörterbuch Spalten-Id → Werte. */
const reader = (cols) => ({ values: (r) => cols[r.columnId] ?? null });

suite('run-chart: Konstanten', () => {
  test('Tests in der Reihenfolge der Testtafel, ab drei Werten', () => {
    assertDeepEqual([...TEST_IDS], ['clustering', 'mixtures', 'trends', 'oscillation']);
    assertEqual(MIN_VALUES, 3);
  });
});

suite('run-chart: inputValues', () => {
  const read = reader({ a: [1, '2,5', null, NaN, 3, '4', undefined, 5.5] });

  test('nur echte Zahlen zählen (Text „2,5“, null, NaN nicht)', () => {
    assertDeepEqual(inputValues({ columnRef: ref('a') }, read), [1, 3, 5.5]);
  });

  test('ohne Bezug oder bei fehlender Spalte leer', () => {
    assertDeepEqual(inputValues({ columnRef: null }, read), []);
    assertDeepEqual(inputValues({ columnRef: ref('gone') }, read), []);
  });
});

suite('run-chart: analyze', () => {
  test('unter drei Werten null', () => {
    assertEqual(analyze([]), null);
    assertEqual(analyze([1, 2]), null);
  });

  test('Altprojekt: Rohergebnis mit Werten und Tests', () => {
    const a = analyze(DURCHMESSER);
    assertEqual(a.n, 24);
    assertEqual(a.median.toFixed(4), '10.2200');
    assertEqual(a.runsAboutMedian, 2);
    assertEqual(a.runsUpDown, 12);
    assertDeepEqual(a.values, DURCHMESSER);
    assertDeepEqual(a.tests.map((t) => t.id), [...TEST_IDS]);
    assertDeepEqual(a.tests.map((t) => t.obs), [2, 2, 12, 12]);
  });
});

suite('run-chart: Bewertung gegen α', () => {
  const fake = (ps) => ({ tests: ps.map((p, i) => ({ id: TEST_IDS[i], p, obs: 1 })) });

  test('flaggedCount zählt die p-Werte unter α', () => {
    assertEqual(flaggedCount(/** @type {any} */ (fake([0.001, 0.9, 0.04, 0.5])), 0.05), 2);
  });

  test('flaggedCount: keiner unter α → 0', () => {
    assertEqual(flaggedCount(/** @type {any} */ (fake([0.2, 0.9, 0.3, 0.5])), 0.05), 0);
  });

  test('strengeres α schlägt seltener an (p = α zählt nicht)', () => {
    assertEqual(flaggedCount(/** @type {any} */ (fake([0.001, 0.9, 0.04, 0.5])), 0.001), 0);
    assertEqual(isFlagged(0.001, 0.001), false);
    assertEqual(isFlagged(0.0009, 0.001), true);
  });

  test('ohne Ergebnis 0', () => {
    assertEqual(flaggedCount(null, 0.05), 0);
  });
});

suite('run-chart: resultOf', () => {
  test('Altprojekt: gleich dem read().result der Altform', () => {
    const r = resultOf(analyze(DURCHMESSER), 0.1);
    assertDeepClose(r, LEGACY_RESULT);
    assertDeepEqual(plain(r), r, 'JSON-fest, ohne Funktionen');
  });

  test('α bewertet neu, ohne die Rechnung zu ändern', () => {
    const a = analyze(DURCHMESSER);
    const r = resultOf(a, 0.01);
    assertEqual(r.flagged, 1);
    assertDeepEqual(r.tests.map((t) => t.flagged), [true, false, false, false]);
    assertDeepClose(r.median, LEGACY_RESULT.median);
  });

  test('nicht endliche Zahlen werden null', () => {
    const r = resultOf(/** @type {any} */ ({
      n: 3, median: NaN, runsAboutMedian: 1, runsUpDown: 1, values: [1, 1, 1],
      tests: [{ id: 'clustering', p: NaN, obs: 1 }],
    }), 0.05);
    assertEqual(r.median, null);
    assertEqual(r.tests[0].p, null);
    assertEqual(r.tests[0].flagged, false);
  });

  test('ohne Ergebnis null', () => {
    assertEqual(resultOf(null, 0.05), null);
  });
});

suite('run-chart: pointsOf', () => {
  test('je Wert eine Zeile in Datenfolge', () => {
    const p = pointsOf(analyze([3, 1, 2]));
    assertDeepEqual(p, [{ value: 3 }, { value: 1 }, { value: 2 }]);
  });

  test('ohne Ergebnis leer', () => {
    assertDeepEqual(pointsOf(null), []);
  });
});

suite('run-chart: analyze rechnet je Eingabe nur einmal', () => {
  test('gleiche Eingabe (neue Liste mit gleichem Inhalt) → dasselbe Objekt, Engine nicht erneut', () => {
    const a = analyze([...DURCHMESSER]);
    const n = engineRuns();
    const b = analyze([...DURCHMESSER]);
    assertTrue(a === b, 'neu gerechnet trotz gleicher Eingabe');
    assertEqual(engineRuns(), n);
    resultOf(b, 0.01);
    resultOf(b, 0.2);
    pointsOf(b);
    assertEqual(engineRuns(), n, 'Bewertung und Punkte rufen die Engine nicht');
  });

  test('andere Zahl → neue Rechnung, genau ein Engine-Aufruf', () => {
    const a = analyze(DURCHMESSER);
    const n = engineRuns();
    const values = [...DURCHMESSER];
    values[3] = 11;
    const b = analyze(values);
    assertTrue(a !== b, 'Zahl geändert, nicht neu gerechnet');
    assertEqual(engineRuns(), n + 1);
  });

  test('unter drei Werten ruft die Engine nicht', () => {
    const n = engineRuns();
    analyze([1, 2]);
    analyze([5]);
    assertEqual(engineRuns(), n);
  });
});

const EXAMPLES = new URL('../../../examples/', import.meta.url);

suite('run-chart: Beispiel gegen die Altrechnung', () => {
  test('spc-run-chart-shift (α 0,05 und 0,01)', async () => {
    const res = await fetch(new URL('shared/worksheets/spc-imr-shift.json', EXAMPLES), { cache: 'no-cache' });
    const json = await res.json();
    const values = json.sheets[0].state.columns[0].values;
    const a = analyze(inputValues({ columnRef: ref('x') }, reader({ x: values })));
    const expected = {
      n: 50, median: 10.061399999999999, runsAboutMedian: 12, runsUpDown: 31, flagged: 1,
      tests: [
        { id: 'clustering', p: 0.00003157467505099376, observed: 12, flagged: true },
        { id: 'mixtures', p: 0.999968425324949, observed: 12, flagged: false },
        { id: 'trends', p: 0.24720229712672825, observed: 31, flagged: false },
        { id: 'oscillation', p: 0.7527977028732717, observed: 31, flagged: false },
      ],
    };
    assertDeepClose(resultOf(a, 0.05), expected);
    assertDeepClose(resultOf(a, 0.01), expected);
    assertEqual(pointsOf(a).length, 50);
  });
});

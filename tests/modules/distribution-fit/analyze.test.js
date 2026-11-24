/**
 * Verteilungstest: die Rechnung (domain/analyze.js) gegen die Altrechnung.
 * Die Literale stammen aus dem Altmodul (runAnalysis, read().result über den
 * JSON-Weg der alten Lesefläche).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import {
  DATA_TYPES, ALGO_LAB_IDS, MIN_VALUES, inputValues, analyze, buildResult, engineRuns,
} from '../../../js/modules/distribution-fit/domain/analyze.js';

const plain = (v) => JSON.parse(JSON.stringify(v));

/** Spalte „Fehler“ der Altprojekt-Fixture (n = 30 Ganzzahlen 0…9). */
const FEHLER = [3, 5, 2, 4, 6, 3, 1, 4, 5, 2, 7, 3, 4, 0, 5, 3, 2, 6, 4, 3, 8, 2, 4, 5, 3, 1, 4, 9, 3, 5];

/** `read().result` des Altmoduls für die Altprojekt-Fixture (`dataType: 'discrete'`). */
const LEGACY_RESULT = {
  stats: {
    n: 30, mean: 3.8666666666666667, stdDev: 2.0296650536197, median: 4,
    skewness: 0.5649620223910312, kurtosis: 0.5206334417137346, min: 0, max: 9,
  },
  results: [
    {
      name: 'Poisson', type: 'disc', params: { 'λ': 3.8666666666666667 },
      chi2: { chi2: 0.8994894412142175, df: 5, p: 0.9702585902813478 }, score: 0.9702585902813478,
    },
    {
      name: 'Binomial', type: 'disc', params: { n: 9, p: 0.42962962962962964 },
      chi2: { chi2: 1.21263298439426, df: 4, p: 0.8760143319797246 }, score: 0.8760143319797246,
    },
  ],
  normalityTests: [
    { W: 0.9605650565044662, p: 0.3202245396753015, name: 'Shapiro-Wilk' },
    { A2: 0.5154524462799266, p: 0.17628157027726907, name: 'Anderson-Darling' },
    {
      JB: 1.5127386644898406, p: 0.46936745449085715, skewness: 0.5363121796412263,
      exKurtosis: 0.24427016900510035, name: 'Jarque-Bera',
    },
    {
      K2: 2.5143974650415117, p: 0.2844497312701779, skewZ: 1.355514313080428, kurtZ: -0.8227869785525338,
      skewness: 0.5363121796412263, exKurtosis: 0.24427016900510035, name: "D'Agostino-Pearson",
    },
  ],
  _dataType: 'discrete',
};

/** Fünf Werte: Jarque-Bera und D'Agostino-Pearson melden `tooSmall` (Altmodul, `continuous`). */
const SMALL = [1.2, 2.5, 3.1, 4.8, 5.3];
const SMALL_NORMALITY = [
  { W: 0.9514836725507291, p: 0.7477832411132354, name: 'Shapiro-Wilk' },
  { A2: 0.2120714670234225, p: 0.7014617459559058, name: 'Anderson-Darling' },
  { JB: null, p: null, name: 'Jarque-Bera', tooSmall: true },
  { K2: null, p: null, skewZ: null, kurtZ: null, name: "D'Agostino-Pearson", tooSmall: true },
];

const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
/** Spaltenleser wie `sourceColumns` über ein Wörterbuch Spalten-Id → Werte. */
const reader = (cols) => ({ values: (r) => cols[r.columnId] ?? null });

suite('distribution-fit: Konstanten', () => {
  test('Datentypen und Lab-Ids wie im Altmodul', () => {
    assertDeepEqual([...DATA_TYPES], ['auto', 'continuous', 'discrete']);
    assertDeepEqual({ ...ALGO_LAB_IDS }, {
      'Shapiro-Wilk': 'shapiro-wilk', 'Anderson-Darling': 'anderson-darling',
      'Jarque-Bera': 'jarque-bera', "D'Agostino-Pearson": 'dagostino-pearson',
    });
    assertEqual(MIN_VALUES, 5);
  });
});

suite('distribution-fit: inputValues', () => {
  const read = reader({ a: [1, '2,5', null, NaN, 3, '4', undefined, 5.5] });

  test('nur echte Zahlen zählen (Text „2,5“, null, NaN nicht)', () => {
    assertDeepEqual(inputValues({ columnRef: ref('a') }, read), [1, 3, 5.5]);
  });

  test('ohne Bezug oder bei fehlender Spalte leer', () => {
    assertDeepEqual(inputValues({ columnRef: null }, read), []);
    assertDeepEqual(inputValues({ columnRef: ref('gone') }, read), []);
  });
});

suite('distribution-fit: analyze', () => {
  test('ohne Werte null', () => {
    assertEqual(analyze([], 'auto'), null);
  });

  test('mit vier Werten min5', () => {
    assertDeepEqual(analyze([1, 2, 3, 4], 'auto'), { status: 'insufficient', reason: 'min5' });
  });

  test('konstante Werte: zeroVariance', () => {
    assertDeepEqual(analyze([2, 2, 2, 2, 2, 2], 'continuous'), { status: 'error', reason: 'zeroVariance' });
  });

  test('Altprojekt (discrete): Rohergebnis der Engine samt Funktionen', () => {
    const a = analyze(FEHLER, 'discrete');
    assertEqual(a.status, 'ok');
    assertEqual(typeof a.fit.results[0].pmf, 'function', 'pmf bleibt für das Diagramm');
    assertDeepEqual(a.fit.results.map((r) => r.name), ['Poisson', 'Binomial']);
  });

  test('auto bei Ganzzahlen: stetig und diskret', () => {
    const names = analyze(FEHLER, 'auto').fit.results.map((r) => r.type);
    assertTrue(names.includes('cont') && names.includes('disc'), names.join());
  });
});

suite('distribution-fit: buildResult', () => {
  test('Altprojekt: gleich dem read().result der Altform', () => {
    const r = buildResult(analyze(FEHLER, 'discrete'), 'discrete');
    assertDeepEqual(r, LEGACY_RESULT);
    assertEqual(r.results[0].params['λ'].toFixed(4), '3.8667');
    assertEqual(r.results[0].chi2.chi2.toFixed(4), '0.8995');
    assertEqual(r.results[0].chi2.p.toFixed(4), '0.9703');
    assertEqual(r.stats.mean.toFixed(4), '3.8667');
  });

  test('ohne Funktionen, NaN wird null (tooSmall)', () => {
    const r = buildResult(analyze(SMALL, 'continuous'), 'continuous');
    assertDeepEqual(r.normalityTests, SMALL_NORMALITY);
    for (const f of r.results) {
      for (const k of ['cdf', 'pdf', 'pmf']) assertEqual(k in f, false, `${f.name}.${k}`);
    }
    assertEqual(r._dataType, 'continuous');
    assertDeepEqual(plain(r), r, 'JSON-fest');
  });

  test('ohne gelungene Rechnung null', () => {
    assertEqual(buildResult(null, 'auto'), null);
    assertEqual(buildResult(analyze([1, 2], 'auto'), 'auto'), null);
    assertEqual(buildResult(analyze([3, 3, 3, 3, 3], 'auto'), 'auto'), null);
  });
});

suite('distribution-fit: analyze rechnet je Eingabe nur einmal', () => {
  test('gleiche Eingabe (neue Liste mit gleichem Inhalt) → dasselbe Objekt, Engine nicht erneut', () => {
    const a = analyze([...FEHLER], 'auto');
    const n = engineRuns();
    const b = analyze([...FEHLER], 'auto');
    assertTrue(a === b, 'neu gerechnet trotz gleicher Eingabe');
    assertEqual(engineRuns(), n);
  });

  test('anderer Datentyp oder andere Zahl → neue Rechnung, je genau ein Engine-Aufruf', () => {
    const a = analyze(FEHLER, 'auto');
    let n = engineRuns();
    const b = analyze(FEHLER, 'discrete');
    assertTrue(a !== b, 'Datentyp geändert, nicht neu gerechnet');
    assertEqual(engineRuns(), n + 1);
    n = engineRuns();
    const values = [...FEHLER];
    values[3] = 7;
    const c = analyze(values, 'discrete');
    assertTrue(b !== c, 'Zahl geändert, nicht neu gerechnet');
    assertEqual(engineRuns(), n + 1);
    assertEqual(c.fit.stats.n, 30);
  });

  test('unter fünf Werten ruft die Engine nicht', () => {
    const n = engineRuns();
    analyze([1, 2, 3], 'auto');
    analyze([1, 2, 3, 9], 'continuous');
    assertEqual(engineRuns(), n);
  });
});

const EXAMPLES = new URL('../../../examples/', import.meta.url);

/** @param {string} file @returns {Promise<number[]>} */
async function sheetValues(file) {
  const res = await fetch(new URL(file, EXAMPLES), { cache: 'no-cache' });
  const json = await res.json();
  return json.sheets[0].state.columns[0].values;
}

/**
 * Die geteilten Beispiele (`continuous`), gerechnet am Altmodul: n, Mittelwert,
 * Reihenfolge der Verteilungen, p der besten, p der vier Normalitätstests.
 */
const EXAMPLE_LITERALS = [
  ['worksheets/distribution-normal.json', 80, '10.0738',
    ['Normal', 'Weibull', 'Gamma', 'Log-Normal', 'Exponential'], '0.8793', ['0.7046', '0.6480', '0.8167', '0.7353']],
  ['worksheets/distribution-exponential.json', 80, '18.4219',
    ['Weibull', 'Gamma', 'Log-Normal', 'Exponential', 'Normal'], '0.8453', ['0.0000', '0.0000', '0.0000', '0.0000']],
  ['shared/worksheets/distribution-weibull.json', 80, '87.3778',
    ['Normal', 'Weibull', 'Gamma', 'Log-Normal', 'Exponential'], '0.9611', ['0.0431', '0.4825', '0.0198', '0.0188']],
  ['shared/worksheets/distribution-lognormal.json', 80, '6.7406',
    ['Log-Normal', 'Gamma', 'Weibull', 'Normal', 'Exponential'], '0.7588', ['0.0000', '0.0000', '0.0000', '0.0000']],
];

suite('distribution-fit: Beispiele gegen die Altrechnung', () => {
  for (const [file, n, mean, names, best, normP] of EXAMPLE_LITERALS) {
    test(file, async () => {
      const values = await sheetValues(file);
      const r = buildResult(analyze(inputValues({ columnRef: ref('x') }, reader({ x: values })), 'continuous'), 'continuous');
      assertEqual(r.stats.n, n);
      assertEqual(r.stats.mean.toFixed(4), mean);
      assertDeepEqual(r.results.map((f) => f.name), names);
      assertEqual(r.results[0].score.toFixed(4), best);
      assertDeepEqual(r.normalityTests.map((t) => t.p.toFixed(4)), normP);
    });
  }
});

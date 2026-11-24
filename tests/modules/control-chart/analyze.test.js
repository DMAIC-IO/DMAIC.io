/**
 * Regelkarte für Variablen (I-MR, X̄-R, X̄-S): die Rechnung
 * (domain/analyze.js) gegen die Altrechnung. Die Literale haben die Form von
 * `read().result` des Altmoduls (`_agentResult`) und sind mit der
 * unveränderten Engine gerechnet: die sieben eigenen Beispiele, das geteilte
 * CSV-Beispiel `capability-bolzendurchmesser` (Altform: Spalte mit
 * Vorgaben), `test_data_control.csv` und beide Altprojekte (I-MR mit
 * Phase II, Anmerkungen und Spezifikation; X̄-R mit Stufen). Die
 * Kachel-Literale stammen aus der Rechnung der Altkachel.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import {
  MIN_VALUES, parseStages, activeStages, misalignedStages, excludedOf, sameColumn, frozenApplies, inputsOf,
  analyze, analyzeWith, computeChart, baselineEndOf, uniqueViolations, resultOf, pointsOf, freezeLimitsOf,
  tileAnalysisOf, errorOf, engineRuns,
} from '../../../js/modules/control-chart/domain/analyze.js';
import { CHART_TYPES } from '../../../js/engines/control-chart-engine.js';

const plain = (v) => JSON.parse(JSON.stringify(v));
const V = (pairs) => pairs.map(([index, ruleId]) => ({ index, ruleId }));

/** Spalte „Durchmesser“ des Altprojekts (I-MR): Ausreißer 10,62 an Index 20, Lauf über 1σ an 24–28. */
export const DURCHMESSER = [
  10.02, 9.95, 10.08, 9.97, 10.04, 9.91, 10.06, 10.01, 9.98, 10.07, 9.94, 10.03, 9.96, 9.99, 10.05,
  9.93, 10.07, 9.97, 10.02, 9.95, 10.62, 10.03, 9.94, 9.98, 10.13, 10.16, 10.12, 10.04, 10.14, 9.96,
];

/** Spalte „Laenge“ des Altprojekts X̄-R: 40 Werte um 10, ab Index 25 um 10,5. */
export const LAENGE = [
  10.02, 9.95, 10.08, 9.97, 10.04, 9.91, 10.06, 10.01, 9.98, 10.07, 9.94, 10.03, 9.96, 9.99, 10.05,
  9.93, 10.07, 9.97, 10.02, 9.95, 10.03, 9.96, 10.05, 9.98, 10.01, 10.41, 10.56, 10.49, 10.53, 10.44,
  10.57, 10.46, 10.51, 10.42, 10.54, 10.48, 10.59, 10.45, 10.5, 10.53,
];

/** Spalte „Value“ aus `test_data_control.csv` (28 Werte, steigend). */
export const TEST_DATA_CONTROL = [
  1.1, 2.2, 1.8, 3.3, 2.7, 4.4, 3.9, 5.5, 4.2, 6.6, 5.1, 7.7, 6.3, 8.8, 7.5, 9.9, 8.4, 10.1, 9.6, 11.2,
  10.8, 12.3, 11.5, 13.4, 12.9, 14.5, 13.8, 15.6,
];

/** Spalte „Riesig“ der Überlauf-Fixture: acht Werte um 1,7·10³⁰⁸. */
export const RIESIG = [1.7e308, 1.71e308, 1.69e308, 1.72e308, 1.68e308, 1.7e308, 1.71e308, 1.69e308];

/** `read().result` der Altform: control-chart-xbar-r-stable. */
export const XBAR_R_STABLE_RESULT = {
  chartType: 'xbar-r', subgroupSize: 5, n: 25, baselineEnd: 125, stages: [], frozen: false,
  subcharts: { xbar: { cl: 9.991372, ucl: 10.060780484, lcl: 9.921963516, sigma: 0.023128210588942797 }, r: { cl: 0.12029200000000002, ucl: 0.254297288, lcl: 0, sigma: 0.044668429333333336 } },
  capability: null,
  violations: V([]),
  signals: [],
};

/** `read().result` der Altform: control-chart-xbar-s-stable. */
export const XBAR_S_STABLE_RESULT = {
  chartType: 'xbar-s', subgroupSize: 5, n: 25, baselineEnd: 125, stages: [], frozen: false,
  subcharts: { xbar: { cl: 9.991372, ucl: 10.060639287803408, lcl: 9.922104712196592, sigma: 0.02309358483732583 }, s: { cl: 0.04854049600799384, ucl: 0.10140109616069913, lcl: 0, sigma: 0.017620200050901764 } },
  capability: null,
  violations: V([]),
  signals: [],
};

/** `read().result` der Altform: control-chart-capability. */
export const CAPABILITY_RESULT = {
  chartType: 'xbar-r', subgroupSize: 5, n: 25, baselineEnd: 125, stages: [], frozen: false,
  subcharts: { xbar: { cl: 9.991372, ucl: 10.060780484, lcl: 9.921963516, sigma: 0.023128210588942797 }, r: { cl: 0.12029200000000002, ucl: 0.254297288, lcl: 0, sigma: 0.044668429333333336 } },
  capability: { cp: 1.6113568095412272, cpu: 1.666967955752113, cpl: 1.5557456633303413, cpk: 1.5557456633303413 },
  violations: V([]),
  signals: [],
};

/** `read().result` der Altform: control-chart-imr-shift. */
export const IMR_SHIFT_RESULT = {
  chartType: 'i-mr', subgroupSize: 1, n: 50, baselineEnd: 50, stages: [], frozen: false,
  subcharts: { i: { cl: 10.066595999999999, ucl: 10.318712804168475, lcl: 9.814479195831522, sigma: 0.08403893472282539 }, mr: { cl: 0.09479591836734703, ucl: 0.30969826530612277, lcl: 0, sigma: 0.07163411564625859 } },
  capability: null,
  violations: V([[0, 2], [1, 2], [2, 2], [2, 6], [3, 2], [3, 5], [3, 6], [4, 2], [4, 6], [5, 1], [5, 2], [5, 5], [5, 6], [6, 2], [6, 6], [7, 1], [7, 2], [7, 5], [7, 6], [8, 2], [8, 6], [9, 2], [10, 2], [10, 6], [11, 2], [12, 2], [23, 5], [24, 5], [25, 5], [28, 2], [29, 2], [29, 6], [29, 8], [30, 2], [30, 6], [30, 8], [31, 2], [31, 6], [31, 8], [32, 2], [32, 6], [32, 8], [33, 2], [33, 6], [33, 8], [34, 2], [34, 6], [34, 8], [35, 2], [35, 6], [35, 8], [36, 2], [36, 6], [36, 8], [37, 2], [39, 2], [40, 2], [41, 2], [42, 2], [43, 2], [44, 2], [45, 2], [46, 2], [46, 5], [47, 2], [48, 1], [48, 2], [48, 5], [49, 2]]),
  signals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 23, 24, 25, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49],
};

/** `read().result` der Altform: control-chart-imr-trend. */
export const IMR_TREND_RESULT = {
  chartType: 'i-mr', subgroupSize: 1, n: 50, baselineEnd: 50, stages: [], frozen: false,
  subcharts: { i: { cl: 10.291074000000002, ucl: 10.52322771254885, lcl: 10.058920287451153, sigma: 0.07738457084961642 }, mr: { cl: 0.08728979591836732, ucl: 0.285175763265306, lcl: 0, sigma: 0.06596198911564623 } },
  capability: null,
  violations: V([[0, 1], [0, 2], [0, 5], [0, 6], [0, 8], [1, 1], [1, 2], [1, 3], [1, 5], [1, 6], [1, 8], [2, 1], [2, 2], [2, 3], [2, 5], [2, 6], [2, 8], [3, 1], [3, 2], [3, 3], [3, 5], [3, 6], [3, 8], [4, 1], [4, 2], [4, 3], [4, 5], [4, 6], [4, 8], [5, 1], [5, 2], [5, 3], [5, 5], [5, 6], [5, 8], [6, 2], [6, 3], [6, 5], [6, 6], [6, 8], [7, 1], [7, 2], [7, 5], [7, 6], [7, 8], [8, 2], [8, 6], [8, 8], [9, 2], [10, 2], [11, 2], [11, 5], [11, 6], [12, 2], [12, 5], [12, 6], [13, 2], [14, 2], [14, 6], [15, 1], [15, 2], [15, 6], [16, 2], [16, 6], [17, 2], [17, 6], [18, 2], [19, 2], [19, 6], [20, 2], [20, 6], [21, 2], [22, 2], [23, 2], [24, 2], [25, 2], [26, 2], [27, 2], [28, 2], [29, 2], [30, 2], [31, 2], [32, 2], [33, 2], [34, 2], [34, 6], [35, 2], [35, 5], [35, 6], [36, 2], [37, 1], [37, 2], [37, 5], [37, 6], [37, 8], [38, 1], [38, 2], [38, 5], [38, 6], [38, 8], [39, 2], [39, 6], [39, 8], [40, 1], [40, 2], [40, 5], [40, 6], [40, 8], [41, 2], [41, 5], [41, 6], [41, 8], [42, 2], [42, 5], [42, 6], [42, 8], [43, 1], [43, 2], [43, 5], [43, 6], [43, 8], [44, 2], [44, 5], [44, 6], [44, 8], [45, 1], [45, 2], [45, 5], [45, 6], [45, 8], [46, 1], [46, 2], [46, 5], [46, 6], [46, 8], [47, 1], [47, 2], [47, 5], [47, 6], [47, 8], [48, 1], [48, 2], [48, 5], [48, 6], [48, 8], [49, 2], [49, 5], [49, 6], [49, 8]]),
  signals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49],
};

/** `read().result` der Altform: control-chart-imr-annotated-frozen. */
export const IMR_ANNOTATED_FROZEN_RESULT = {
  chartType: 'i-mr', subgroupSize: 1, n: 50, baselineEnd: 29, stages: [], frozen: true,
  subcharts: { i: { cl: 9.974160714285713, ucl: 10.181934855038577, lcl: 9.766386573532849, sigma: 0.0692580469176214 }, mr: { cl: 0.07812307692307693, ucl: 0.25522809230769233, lcl: 0, sigma: 0.059035005128205136 } },
  capability: null,
  violations: V([[29, 1], [30, 1], [33, 1], [36, 1], [40, 1], [41, 1], [46, 1], [48, 1], [49, 1]]),
  signals: [29, 30, 33, 36, 40, 41, 46, 48, 49],
};

/** `read().result` der Altform: control-chart-hubschrauber-flyer. */
export const HUBSCHRAUBER_RESULT = {
  chartType: 'i-mr', subgroupSize: 1, n: 5, baselineEnd: 5, stages: [], frozen: false,
  subcharts: { i: { cl: 2.7561999999999998, ucl: 3.135189361702128, lcl: 2.3772106382978717, sigma: 0.12632978723404273 }, mr: { cl: 0.14250000000000018, ucl: 0.46554750000000056, lcl: 0, sigma: 0.10768250000000013 } },
  capability: null,
  violations: V([]),
  signals: [],
};

/** `read().result` der Altform: capability-bolzendurchmesser. */
export const BOLZEN_CSV_RESULT = {
  chartType: 'i-mr', subgroupSize: 1, n: 100, baselineEnd: 100, stages: [], frozen: false,
  subcharts: { i: { cl: 9.997482000000003, ucl: 10.105705189340213, lcl: 9.889258810659793, sigma: 0.036074396446736864 }, mr: { cl: 0.04069191919191918, ucl: 0.13294049999999996, lcl: 0, sigma: 0.030749526936026925 } },
  capability: null,
  violations: V([[30, 1]]),
  signals: [30],
};

/** `read().result` der Altform: test_data_control. */
export const TEST_DATA_CONTROL_RESULT = {
  chartType: 'i-mr', subgroupSize: 1, n: 28, baselineEnd: 28, stages: [], frozen: false,
  subcharts: { i: { cl: 8.039285714285716, ucl: 11.713438590566252, lcl: 4.365132838005181, sigma: 1.2247176254268453 }, mr: { cl: 1.3814814814814813, ucl: 4.513299999999999, lcl: 0, sigma: 1.0439395061728394 } },
  capability: null,
  violations: V([[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [6, 1], [8, 1], [21, 1], [23, 1], [24, 1], [25, 1], [26, 1], [27, 1]]),
  signals: [0, 1, 2, 3, 4, 6, 8, 21, 23, 24, 25, 26, 27],
};

/** `read().result` der Altform: legacy-project. */
export const LEGACY_RESULT = {
  chartType: 'i-mr', subgroupSize: 1, n: 30, baselineEnd: 20, stages: [], frozen: true,
  subcharts: { i: { cl: 10, ucl: 10.3, lcl: 9.7, sigma: 0.1 }, mr: { cl: 0.1128, ucl: 0.3685, lcl: 0, sigma: 0.0853 } },
  capability: { cp: 1.8333333333333324, cpu: 1.6666666666666665, cpl: 1.9999999999999984, cpk: 1.6666666666666665 },
  violations: V([[20, 1], [24, 6], [25, 6], [26, 6], [28, 6]]),
  signals: [20, 24, 25, 26, 28],
};

/** `read().result` der Altform: legacy-project-xbar. */
export const LEGACY_XBAR_RESULT = {
  chartType: 'xbar-r', subgroupSize: 5, n: 8, baselineEnd: 40, stages: [22], frozen: false,
  subcharts: { xbar: { cl: 10.498666666666667, ucl: 10.583293333333334, lcl: 10.41404, sigma: 0.028199194901115224 }, r: { cl: 0.14666666666666708, ucl: 0.3100533333333342, lcl: 0, sigma: 0.05446222222222236 } },
  capability: { cp: 4.229090909090896, cpu: 3.707503030303015, cpl: 4.750678787878777, cpk: 3.707503030303015 },
  violations: V([]),
  signals: [],
};


/** Rechnung der Altkachel (Kennwerte und Kennzahlen; `violationIndices` sortiert). */
const LEGACY_TILE = {
  'legacy-project': { cl: 10.000000000000002, ucl: 10.236562150055992, lcl: 9.763437849944012, sigma: 0.07885405001866358, violations: 5, violationIndices: [20, 24, 25, 26, 28], totalPts: 30, oos: 1, capability: { cp: 2.3249704142011858, cpu: 2.1136094674556163, cpl: 2.536331360946755, cpk: 2.1136094674556163 }, baselineEnd: 20 },
  'legacy-project-xbar': { cl: 10.187750000000001, ucl: 10.264923750000001, lcl: 10.110576250000001, sigma: 0.025715743077437483, violations: 8, violationIndices: [0, 1, 2, 3, 4, 5, 6, 7], totalPts: 8, oos: 0, capability: { cp: 4.637507788161976, cpu: 5.86789657320869, cpl: 3.407119003115261, cpk: 3.407119003115261 }, baselineEnd: null },
  'control-chart-capability': { cl: 9.991372, ucl: 10.060780484, lcl: 9.921963516, sigma: 0.023128210588942797, violations: 0, violationIndices: [], totalPts: 25, oos: 0, capability: { cp: 1.6113568095412272, cpu: 1.666967955752113, cpl: 1.5557456633303413, cpk: 1.5557456633303413 }, baselineEnd: null },
  'control-chart-imr-annotated-frozen': { cl: 9.980999999999998, ucl: 10.200756838905773, lcl: 9.761243161094223, sigma: 0.07325227963525834, violations: 8, violationIndices: [30, 33, 36, 40, 41, 46, 48, 49], totalPts: 50, oos: null, capability: null, baselineEnd: 29 },
  'control-chart-imr-shift': { cl: 10.066595999999999, ucl: 10.318712804168475, lcl: 9.814479195831522, sigma: 0.08403893472282539, violations: 37, violationIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 23, 24, 25, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49], totalPts: 50, oos: null, capability: null, baselineEnd: null },
};

const ref = (c, s = 's1') => ({ instanceId: 'ws1', sheetId: s, columnId: c });
/** Spaltenleser wie `sourceColumns` über ein Wörterbuch Spalten-Id → Werte. */
const reader = (cols) => ({ values: (r) => cols[r.columnId] ?? null });

/** Stand des Models mit Vorgaben; `over` überschreibt. */
const model = (over = {}) => ({
  chartTypeId: 'i-mr', subgroupSize: 1, columnRef: null, baselineCount: null, stagesText: '', usl: null, lsl: null,
  enabledRules: [1], annotations: {}, frozenLimits: null, ...over,
});

const ALL_RULES = [1, 2, 3, 4, 5, 6, 7, 8];

/** Altprojekt I-MR: Phase I 20, Spezifikation, Regeln 1/2/5/6, zwei Anmerkungen, eingefrorene Grenzen. */
const LEGACY_MODEL = model({
  columnRef: ref('durchmesser'), baselineCount: 20, usl: 10.5, lsl: 9.4, enabledRules: [1, 2, 5, 6],
  annotations: { 20: { comment: 'Werkzeugwechsel', excluded: true }, 28: { comment: 'Messung wiederholt', excluded: false } },
  frozenLimits: {
    chartTypeId: 'i-mr', subgroupSize: 1, columnRef: ref('durchmesser'), baselineEnd: 20,
    primary: { cl: 10, ucl: 10.3, lcl: 9.7, sigma: 0.1 },
    secondary: { cl: 0.1128, ucl: 0.3685, lcl: 0, sigma: 0.0853 },
    excludedIndices: [],
  },
});

/** Altprojekt X̄-R: n = 5, Stufe „22“ mitten in einer Untergruppe, Spezifikation, Regeln 1/2. */
const LEGACY_XBAR_MODEL = model({
  chartTypeId: 'xbar-r', subgroupSize: 5, columnRef: ref('laenge'), stagesText: '22', usl: 11.2, lsl: 9.6,
  enabledRules: [1, 2],
});

const COLS = reader({ durchmesser: DURCHMESSER, laenge: LAENGE, value: TEST_DATA_CONTROL, riesig: RIESIG });
const run = (m, read = COLS) => analyze(inputsOf(m, read));
const fresh = (m, read = COLS) => analyzeWith(computeChart, inputsOf(m, read));

/** Führt `fn` aus, ohne dass `console.warn` die Ausgabe füllt; liefert die Zahl der Warnungen. */
function quiet(fn) {
  const orig = console.warn;
  let warned = 0;
  console.warn = () => { warned += 1; };
  try { return { value: fn(), warned }; } finally { console.warn = orig; }
}

/**
 * Die Beispiele: Arbeitsblatt (Pfad unter `examples/`), Spalte und die
 * Einstellungen der Beispieldatei.
 */
const EXAMPLES = [
  ['control-chart-xbar-r-stable', 'worksheets/spc-subgroups-stable.json', 'sheet-xbar-r', 'c-diameter',
    { chartTypeId: 'xbar-r', subgroupSize: 5, enabledRules: ALL_RULES }, XBAR_R_STABLE_RESULT],
  ['control-chart-xbar-s-stable', 'worksheets/spc-subgroups-stable.json', 'sheet-xbar-r', 'c-diameter',
    { chartTypeId: 'xbar-s', subgroupSize: 5, enabledRules: ALL_RULES }, XBAR_S_STABLE_RESULT],
  ['control-chart-capability', 'worksheets/spc-subgroups-stable.json', 'sheet-xbar-r', 'c-diameter',
    { chartTypeId: 'xbar-r', subgroupSize: 5, usl: 10.25, lsl: 9.75, enabledRules: ALL_RULES }, CAPABILITY_RESULT],
  ['control-chart-imr-shift', 'shared/worksheets/spc-imr-shift.json', 'sheet-imr-shift', 'c-value',
    { enabledRules: ALL_RULES }, IMR_SHIFT_RESULT],
  ['control-chart-imr-trend', 'worksheets/spc-imr-trend.json', 'sheet-imr-trend', 'c-value',
    { enabledRules: ALL_RULES }, IMR_TREND_RESULT],
  ['control-chart-imr-annotated-frozen', 'shared/worksheets/spc-imr-shift.json', 'sheet-imr-shift', 'c-value', {
    baselineCount: 29, enabledRules: [1],
    annotations: { 13: { comment: 'Werkzeugwechsel / tool change', excluded: true } },
    frozenLimits: {
      chartTypeId: 'i-mr', subgroupSize: 1, columnRef: ref('c-value', 'sheet-imr-shift'), baselineEnd: 29,
      primary: { cl: 9.974160714285713, ucl: 10.181934855038577, lcl: 9.766386573532849, sigma: 0.0692580469176214 },
      secondary: { cl: 0.07812307692307693, ucl: 0.25522809230769233, lcl: 0, sigma: 0.059035005128205136 },
      excludedIndices: [13],
    },
  }, IMR_ANNOTATED_FROZEN_RESULT],
  ['control-chart-hubschrauber-flyer', 'shared/worksheets/hubschrauber-flyer.json', 'sheet-hubschrauber-confirmation',
    'c-flugzeit', { enabledRules: ALL_RULES }, HUBSCHRAUBER_RESULT],
];

async function fetchText(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.text();
}

/** Werte einer Spalte aus einem Arbeitsblatt unter `examples/`. */
async function exampleColumn(file, sheetId, columnId) {
  const ws = JSON.parse(await fetchText(`../../../examples/${file}`));
  return ws.sheets.find((s) => s.id === sheetId).state.columns.find((c) => c.id === columnId).values;
}

suite('control-chart: Konstanten', () => {
  test('ab zwei Werten', () => {
    assertEqual(MIN_VALUES, 2);
  });
});

suite('control-chart: Stufen', () => {
  test('parseStages: Komma, Semikolon, Leerraum; ganzzahlig, positiv, entdoppelt, sortiert', () => {
    assertDeepEqual(parseStages('25, 12;12  40'), [12, 25, 40]);
    assertDeepEqual(parseStages('12.7, -3, 0, abc, 5x'), [5, 12]);
    assertDeepEqual(parseStages(''), []);
    assertDeepEqual(parseStages(null), []);
    assertDeepEqual(parseStages(12), []);
  });

  test('activeStages: nur Grenzen innerhalb der Werte (0 < b < N)', () => {
    assertDeepEqual(activeStages('10, 30, 50', 30), [10]);
    assertDeepEqual(activeStages('100', 50), [], 'Stufe jenseits der Werte gilt nicht');
    assertDeepEqual(activeStages('', 50), []);
  });

  test('misalignedStages: nur bei n > 1 die Grenzen, die keine Vielfachen von n sind', () => {
    assertDeepEqual(misalignedStages([10, 22, 25], 5), [22]);
    assertDeepEqual(misalignedStages([3, 7], 1), []);
  });
});

suite('control-chart: excludedOf, sameColumn, frozenApplies', () => {
  test('excludedOf: nur Anmerkungen mit Ausschluss, als Zahlen sortiert', () => {
    assertDeepEqual(excludedOf({ 28: { comment: 'x', excluded: false }, 20: { comment: '', excluded: true }, 3: { excluded: true } }), [3, 20]);
    assertDeepEqual(excludedOf({ 5: null }), []);
    assertDeepEqual(excludedOf({}), []);
    assertDeepEqual(excludedOf(null), []);
  });

  test('sameColumn: alle drei Schlüssel gleich', () => {
    assertTrue(sameColumn(ref('a'), ref('a')));
    assertEqual(sameColumn(ref('a'), ref('b')), false);
    assertEqual(sameColumn(ref('a'), ref('a', 's2')), false);
    assertEqual(sameColumn(ref('a'), null), false);
    assertEqual(sameColumn(null, null), false);
  });

  // Fälle wie „frozen limits follow the column“ des Altmodells.
  const fl = (over = {}) => ({ chartTypeId: 'i-mr', subgroupSize: 1, columnRef: ref('a'), ...over });
  test('frozenApplies: gleicher Typ, gleiche Untergruppe, gleiche Spalte, ohne Stufen', () => {
    const m = model({ columnRef: ref('a') });
    assertTrue(frozenApplies(fl(), m, false));
    assertEqual(frozenApplies(fl(), m, true), false, 'mit Stufen nicht');
    assertEqual(frozenApplies(fl({ chartTypeId: 'xbar-r' }), m, false), false, 'anderer Typ');
    assertEqual(frozenApplies(fl({ subgroupSize: 5 }), m, false), false, 'andere Untergruppe');
    assertEqual(frozenApplies(fl({ columnRef: ref('b') }), m, false), false, 'andere Spalte');
    assertEqual(frozenApplies(fl(), model({ columnRef: null }), false), false, 'ohne Bezug');
    assertTrue(frozenApplies(fl({ columnRef: null }), m, false), 'Grenzen ohne Spalte gelten weiter');
    assertEqual(frozenApplies(null, m, false), false);
  });
});

suite('control-chart: inputsOf', () => {
  test('ohne Bezug, gelöschte Spalte, unbekannter Typ → null', () => {
    assertEqual(inputsOf(model(), COLS), null);
    assertEqual(inputsOf(model({ columnRef: ref('gone') }), COLS), null);
    assertEqual(inputsOf(model({ columnRef: ref('value'), chartTypeId: 'p' }), COLS), null);
  });

  test('Text „2,5“, null, „“, NaN, undefined fallen heraus; unter zwei Werten null', () => {
    const read = reader({ v: [10, '2,5', null, '', NaN, undefined, 10.2, 9.9], w: [1, '2', null] });
    assertDeepEqual(inputsOf(model({ columnRef: ref('v') }), read).values, [10, 10.2, 9.9]);
    assertEqual(inputsOf(model({ columnRef: ref('w') }), read), null);
  });

  test('wirksame Eingaben des Altprojekts', () => {
    const i = inputsOf(LEGACY_MODEL, COLS);
    assertDeepEqual(i, {
      values: DURCHMESSER, chartTypeId: 'i-mr', n: 1, baselineCount: 20, stages: [], enabledRules: [1, 2, 5, 6],
      excluded: [20],
      frozen: { primary: { cl: 10, ucl: 10.3, lcl: 9.7, sigma: 0.1 }, secondary: { cl: 0.1128, ucl: 0.3685, lcl: 0, sigma: 0.0853 } },
      usl: 10.5, lsl: 9.4,
    });
  });

  test('Stufen jenseits der Werte gelten nicht; eingefrorene Grenzen nur ohne wirksame Stufen', () => {
    const frozenLimits = LEGACY_MODEL.frozenLimits;
    assertDeepEqual(inputsOf(model({ columnRef: ref('durchmesser'), stagesText: '100', frozenLimits }), COLS).stages, []);
    assertTrue(inputsOf(model({ columnRef: ref('durchmesser'), stagesText: '100', frozenLimits }), COLS).frozen !== null);
    const staged = inputsOf(model({ columnRef: ref('durchmesser'), stagesText: '15', frozenLimits }), COLS);
    assertDeepEqual([staged.stages, staged.frozen], [[15], null]);
  });

  test('Kommentar ohne Ausschluss ändert die Eingabe nicht', () => {
    const a = inputsOf(model({ columnRef: ref('value') }), COLS);
    const b = inputsOf(model({ columnRef: ref('value'), annotations: { 3: { comment: 'nur Text', excluded: false } } }), COLS);
    assertDeepEqual(a, b);
  });
});

suite('control-chart: baselineEndOf (Phase I)', () => {
  test('leer → alle; mit Stufen immer alle Werte', () => {
    assertEqual(baselineEndOf(null, 30, 'i-mr', 1, false), 30);
    assertEqual(baselineEndOf(20, 30, 'i-mr', 1, false), 20);
    assertEqual(baselineEndOf(20, 30, 'i-mr', 1, true), 30);
    assertEqual(baselineEndOf(null, 40, 'xbar-r', 5, true), 40);
  });

  test('Phase I größer als die Werte → wie alle (I-MR: N; X̄: Werte der vollen Untergruppen)', () => {
    assertEqual(baselineEndOf(50, 30, 'i-mr', 1, false), 30);
    assertEqual(baselineEndOf(50, 30, 'xbar-r', 5, false), 30);
    assertEqual(baselineEndOf(null, 23, 'xbar-r', 5, false), 20, 'Rest am Ende bildet keinen Punkt');
    assertEqual(baselineEndOf(22, 23, 'xbar-s', 5, false), 20);
    assertEqual(baselineEndOf(12, 23, 'xbar-r', 5, false), 12);
  });
});

suite('control-chart: resultOf gleich der Altform', () => {
  for (const [id, file, sheet, col, over, expected] of EXAMPLES) {
    test(`Beispiel ${id}`, async () => {
      const values = await exampleColumn(file, sheet, col);
      const m = model({ columnRef: ref(col, sheet), ...over });
      const a = run(m, { values: () => values });
      assertDeepEqual(resultOf(a), expected);
      assertEqual(pointsOf(a).length, expected.n);
    });
  }

  test('geteiltes CSV-Beispiel capability-bolzendurchmesser (Spalte mit Vorgaben)', async () => {
    const csv = await fetchText('../../../examples/data/capability-bolzendurchmesser.csv');
    const values = csv.trim().split(/\r?\n/).slice(1).map(Number);
    assertEqual(values.length, 100);
    assertDeepEqual(resultOf(run(model({ columnRef: ref('c-0') }), { values: () => values })), BOLZEN_CSV_RESULT);
  });

  test('test_data_control.csv (Vorgaben)', () => {
    assertDeepEqual(resultOf(run(model({ columnRef: ref('value') }))), TEST_DATA_CONTROL_RESULT);
  });

  test('Altprojekt I-MR (Phase II, Anmerkungen, Spezifikation)', () => {
    assertDeepEqual(resultOf(run(LEGACY_MODEL)), LEGACY_RESULT);
  });

  test('Altprojekt X̄-R (Stufen; Grenzen der letzten Stufe)', () => {
    assertDeepEqual(resultOf(run(LEGACY_XBAR_MODEL)), LEGACY_XBAR_RESULT);
  });

  test('Literale der Altform (KPI-Leiste am Altmodul, Sprache en)', () => {
    const l = resultOf(run(LEGACY_MODEL));
    const f4 = (v) => v.toFixed(4);
    const f3 = (v) => v.toFixed(3);
    assertDeepEqual([f4(l.subcharts.i.cl), f4(l.subcharts.i.sigma), f3(l.subcharts.i.ucl), f3(l.subcharts.i.lcl)],
      ['10.0000', '0.1000', '10.300', '9.700']);
    assertDeepEqual([l.signals.length, l.n, f3(l.capability.cpk), f3(l.capability.cp)], [5, 30, '1.667', '1.833']);
    const x = resultOf(run(LEGACY_XBAR_MODEL));
    assertDeepEqual([f4(x.subcharts.xbar.cl), f4(x.subcharts.xbar.sigma), f3(x.subcharts.xbar.ucl), f3(x.subcharts.xbar.lcl)],
      ['10.4987', '0.0282', '10.583', '10.414']);
    assertDeepEqual([x.signals.length, x.n, f3(x.capability.cpk), f3(x.capability.cp)], [0, 8, '3.708', '4.229']);
    const t = resultOf(run(model({ columnRef: ref('value') })));
    assertDeepEqual([f4(t.subcharts.i.cl), f3(t.subcharts.i.ucl), t.signals.length], ['8.0393', '11.713', 13]);
  });

  test('ohne Funktionen: übersteht JSON unverändert', () => {
    const r = resultOf(run(LEGACY_XBAR_MODEL));
    assertDeepEqual(plain(r), r);
  });

  test('null ohne Ergebnis oder bei Fehler', () => {
    assertEqual(resultOf(null), null);
    assertEqual(resultOf({ status: 'error', reason: 'errCompute' }), null);
  });
});

suite('control-chart: analyze', () => {
  test('inputs null → null (keine Ausgabe, kein Fehler), die Engine läuft nicht', () => {
    const n = engineRuns();
    assertEqual(analyze(null), null);
    assertEqual(analyzeWith(computeChart, null), null);
    assertEqual(engineRuns(), n);
  });

  test('je Kartentyp die Teilkarten der Engine, Punkte und Grenzen', () => {
    const values = LAENGE.slice(0, 30);
    for (const [type, n, ids, points] of [['i-mr', 1, ['i', 'mr'], 30], ['xbar-r', 5, ['xbar', 'r'], 6], ['xbar-s', 5, ['xbar', 's'], 6]]) {
      const a = fresh(model({ chartTypeId: type, subgroupSize: n, columnRef: ref('v') }), reader({ v: values }));
      assertEqual(a.status, 'ok', type);
      assertDeepEqual(Object.keys(a.fit.subcharts), ids, type);
      assertDeepEqual(a.ct.subcharts.map((s) => s.id), ids, type);
      assertEqual(a.fit.subcharts[ids[0]].values.length, points, type);
      assertEqual(a.fit.segments, undefined, `${type}: ohne Stufen keine Segmente`);
    }
  });

  test('die Engine bekommt Werte, Untergruppe, Ende der Basis, Stufen und Ausschlüsse', () => {
    const seen = [];
    const engine = (...args) => { seen.push(args); return computeChart(...args); };
    analyzeWith(engine, inputsOf(model({ columnRef: ref('durchmesser'), baselineCount: 20, annotations: { 4: { comment: '', excluded: true } } }), COLS));
    analyzeWith(engine, inputsOf(LEGACY_XBAR_MODEL, COLS));
    assertDeepEqual(seen, [
      ['i-mr', DURCHMESSER, 1, 20, undefined, [4]],
      ['xbar-r', LAENGE, 5, 40, [22], []],
    ]);
  });

  test('eingefrorene Grenzen: Punkte aus der Engine, Grenzen aus Phase II', () => {
    const a = fresh(LEGACY_MODEL);
    assertEqual(a.frozen, true);
    assertDeepEqual(a.fit.subcharts.i.values, DURCHMESSER);
    assertDeepEqual([a.fit.subcharts.i.cl, a.fit.subcharts.i.ucl, a.fit.subcharts.mr.ucl], [10, 10.3, 0.3685]);
    assertEqual(a.baselineEnd, 20);
    const live = fresh({ ...LEGACY_MODEL, frozenLimits: null });
    assertEqual(live.frozen, false);
    assertTrue(live.fit.subcharts.i.cl !== 10);
  });

  test('Stufen: Grenzen je Punkt, Segmente, Warnung für Grenzen mitten in einer Untergruppe', () => {
    const a = fresh(LEGACY_XBAR_MODEL);
    assertDeepEqual(a.stages, [22]);
    assertDeepEqual(a.misaligned, [22]);
    assertDeepEqual(a.fit.segments, [{ start: 0, end: 5 }, { start: 5, end: 8 }]);
    assertEqual(a.fit.subcharts.xbar.cl.length, 8);
    assertEqual(a.frozen, false);
    assertDeepEqual(fresh(model({ columnRef: ref('durchmesser'), stagesText: '15' })).misaligned, [], 'I-MR warnt nie');
  });

  test('I-MR mit Stufen: null der MR-Reihe an Index 0 und am Stufenbeginn ist kein Fehler', () => {
    const a = fresh(model({ columnRef: ref('durchmesser'), stagesText: '10, 20' }));
    assertEqual(a.status, 'ok');
    const mr = a.fit.subcharts.mr.values;
    assertDeepEqual([mr[0], mr[10], mr[20]], [null, null, null]);
    assertEqual(mr.filter((v) => v === null).length, 3);
  });

  test('Ausschluss bei I-MR: der Punkt fehlt in CL und MR̄', () => {
    const base = fresh(model({ columnRef: ref('durchmesser') }));
    const ex = fresh(model({ columnRef: ref('durchmesser'), annotations: { 20: { comment: '', excluded: true } } }));
    const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
    assertEqual(ex.fit.subcharts.i.cl, mean(DURCHMESSER.filter((_, i) => i !== 20)));
    assertTrue(ex.fit.subcharts.mr.cl < base.fit.subcharts.mr.cl);
  });

  test('Altverhalten, nicht behoben: bei X̄ zählt der Index als Einzelwert — Untergruppe 3 (Index 2) schließt Untergruppe 1 aus', () => {
    const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
    const means = [0, 1, 2, 3, 4, 5].map((k) => mean(DURCHMESSER.slice(k * 5, k * 5 + 5)));
    const a = fresh(model({ chartTypeId: 'xbar-r', subgroupSize: 5, columnRef: ref('durchmesser'), annotations: { 2: { comment: '', excluded: true } } }));
    assertEqual(a.fit.subcharts.xbar.cl, mean(means.slice(1)), 'Mittel ohne Untergruppe 1');
    assertTrue(a.fit.subcharts.xbar.cl !== mean(means.filter((_, k) => k !== 2)), 'Untergruppe 3 bleibt drin');
    assertDeepEqual(resultOf(a).subcharts.xbar, { cl: 10.0424, ucl: 10.191266, lcl: 9.893534, sigma: 0.0496049473942344 });
  });

  test('Nelson: erste Teilkarte mit den angehakten Regeln, zweite nur mit den dort erlaubten (1–4)', () => {
    const a = fresh(LEGACY_MODEL);
    assertDeepEqual(uniqueViolations(a.primaryViolations), V([[20, 1], [24, 6], [25, 6], [26, 6], [28, 6]]));
    assertTrue(a.secondaryViolations.every((v) => [1, 2].includes(v.ruleId)), 'Regeln 5/6 nicht an der MR-Karte');
    const none = fresh({ ...LEGACY_MODEL, enabledRules: [] });
    assertDeepEqual([none.primaryViolations, none.secondaryViolations], [[], []]);
  });

  test('Fähigkeit aus der letzten Stufe; ohne Spezifikation null', () => {
    const a = fresh(LEGACY_XBAR_MODEL);
    assertEqual(a.capability.cpk, LEGACY_XBAR_RESULT.capability.cpk);
    assertEqual(fresh({ ...LEGACY_XBAR_MODEL, usl: null, lsl: null }).capability, null);
  });

  test('σ̂ = 0 (alle Werte gleich): Fähigkeit null, kein Fehler', () => {
    const a = fresh(model({ columnRef: ref('v'), usl: 11, lsl: 9 }), reader({ v: [10, 10, 10, 10] }));
    assertEqual(a.status, 'ok');
    assertEqual(a.capability, null);
    assertEqual(resultOf(a).capability, null);
  });

  test('Phase I größer als die Werte rechnet wie alle (I-MR und X̄-R), kein NaN', () => {
    for (const over of [{}, { chartTypeId: 'xbar-r', subgroupSize: 5 }]) {
      const all = resultOf(fresh(model({ columnRef: ref('durchmesser'), usl: 10.5, lsl: 9.4, ...over })));
      const big = resultOf(fresh(model({ columnRef: ref('durchmesser'), usl: 10.5, lsl: 9.4, baselineCount: 50, ...over })));
      assertDeepEqual(big, all, JSON.stringify(over));
      assertEqual(big.baselineEnd, 30);
      assertTrue(Object.values(big.subcharts).every((s) => Object.values(s).every(Number.isFinite)), 'alle Grenzen endlich');
    }
  });

  test('X̄ mit einem Rest am Ende (23 Werte, n = 5): vier Untergruppen, endliche Grenzen', () => {
    const r = resultOf(fresh(model({ chartTypeId: 'xbar-r', subgroupSize: 5, columnRef: ref('v') }), reader({ v: LAENGE.slice(0, 23) })));
    assertEqual(r.n, 4);
    assertEqual(r.baselineEnd, 20);
    assertDeepEqual(r.subcharts.xbar, { cl: 10, ucl: 10.077895, lcl: 9.922105, sigma: 0.025956077124890207 });
  });

  test('X̄ mit weniger Werten als eine Untergruppe: errCompute (nichts zu zeichnen)', () => {
    const { value } = quiet(() => fresh(model({ chartTypeId: 'xbar-r', subgroupSize: 5, columnRef: ref('v') }), reader({ v: [1, 2, 3] })));
    assertDeepEqual(value, { status: 'error', reason: 'errCompute' });
  });

  test('Wurf der Engine (gestubbt) → errCompute mit Warnung', () => {
    const engine = () => { throw new Error('boom'); };
    const { value, warned } = quiet(() => analyzeWith(engine, inputsOf(LEGACY_XBAR_MODEL, COLS)));
    assertDeepEqual(value, { status: 'error', reason: 'errCompute' });
    assertEqual(warned, 1, 'Ursache per console.warn');
  });

  test('nicht endliche gezeichnete Werte (gestubbte Engine) → errCompute mit Warnung', () => {
    const inputs = inputsOf(model({ columnRef: ref('durchmesser') }), COLS);
    const stub = (patch) => (...args) => {
      const raw = computeChart(...args);
      return { ...raw, subcharts: { i: { ...raw.subcharts.i, ...patch.i }, mr: { ...raw.subcharts.mr, ...patch.mr } } };
    };
    const raw = computeChart('i-mr', DURCHMESSER, 1, 30, undefined, []);
    const cases = [
      [{ i: { values: raw.subcharts.i.values.map((v, k) => (k === 3 ? NaN : v)) } }, 'Punkt NaN'],
      [{ mr: { values: raw.subcharts.mr.values.map((v, k) => (k === 5 ? Infinity : v)) } }, 'MR Infinity'],
      [{ mr: { values: raw.subcharts.mr.values.map((v, k) => (k === 5 ? null : v)) } }, 'MR-Lücke mitten in der Reihe'],
      [{ mr: { values: [0, ...raw.subcharts.mr.values.slice(1)] } }, 'MR ohne führende Lücke'],
      [{ i: { cl: NaN } }, 'CL NaN'],
      [{ i: { ucl: Infinity } }, 'UCL Infinity'],
      [{ mr: { lcl: -Infinity } }, 'LCL der MR-Karte'],
      [{ mr: { sigma: NaN } }, 'σ der zweiten Teilkarte'],
      [{ i: { sigma: null } }, 'σ null'],
    ];
    for (const [patch, label] of cases) {
      const { value, warned } = quiet(() => analyzeWith(stub(patch), inputs));
      assertDeepEqual(value, { status: 'error', reason: 'errCompute' }, label);
      assertEqual(warned, 1, label);
    }
  });

  test('Überlauf: Werte um 1,7·10³⁰⁸ → errCompute (Modul und Merker)', () => {
    const m = model({ columnRef: ref('riesig') });
    const { value, warned } = quiet(() => fresh(m));
    assertDeepEqual(value, { status: 'error', reason: 'errCompute' });
    assertEqual(warned, 1);
    assertEqual(errorOf(quiet(() => run(m)).value), 'errCompute');
  });

  test('Werte um 10²⁰⁰ sind kein Fehler', () => {
    const a = fresh(model({ columnRef: ref('v') }), reader({ v: [1e200, 1.1e200, 0.9e200, 1.05e200] }));
    assertEqual(a.status, 'ok');
  });

  test('eingefrorene Grenze null (Altprojekt) → errCompute, kein Wurf', () => {
    const frozenLimits = { ...LEGACY_MODEL.frozenLimits, primary: { ...LEGACY_MODEL.frozenLimits.primary, ucl: null } };
    const { value, warned } = quiet(() => fresh({ ...LEGACY_MODEL, frozenLimits }));
    assertDeepEqual(value, { status: 'error', reason: 'errCompute' });
    assertEqual(warned, 1);
    const secondary = { ...LEGACY_MODEL.frozenLimits, secondary: { cl: 0.1, ucl: 0.3, lcl: 0, sigma: null } };
    assertDeepEqual(quiet(() => fresh({ ...LEGACY_MODEL, frozenLimits: secondary })).value, { status: 'error', reason: 'errCompute' });
    const missing = { ...LEGACY_MODEL.frozenLimits, primary: undefined };
    assertDeepEqual(quiet(() => fresh({ ...LEGACY_MODEL, frozenLimits: missing })).value, { status: 'error', reason: 'errCompute' });
  });
});

suite('control-chart: Grenzlisten mit Stufen und Rest am Ende', () => {
  // X̄-R, n = 5, 23 Werte, Stufe „10“: die Engine legt einen fünften Eintrag hinter den vierten Punkt.
  const M = model({ chartTypeId: 'xbar-r', subgroupSize: 5, columnRef: ref('v'), stagesText: '10' });
  const READ = reader({ v: LAENGE.slice(0, 23) });

  test('die Engine selbst liefert fünf Einträge bei vier Punkten (unverändert)', () => {
    const raw = computeChart('xbar-r', LAENGE.slice(0, 23), 5, 23, [10], []);
    assertEqual(raw.subcharts.xbar.values.length, 4);
    assertEqual(raw.subcharts.xbar.cl.length, 5);
  });

  test('jede Grenzliste beider Teilkarten hat genau n Einträge; Segmente innerhalb der Punkte', () => {
    const a = fresh(M, READ);
    for (const id of ['xbar', 'r']) {
      for (const key of ['cl', 'ucl', 'lcl', 'sigma']) assertEqual(a.fit.subcharts[id][key].length, 4, `${id}.${key}`);
    }
    assertDeepEqual(a.fit.segments, [{ start: 0, end: 2 }, { start: 2, end: 4 }]);
  });

  test('pointsOf hat genau n Zeilen; Grenzen der letzten Stufe wie in der Altform', () => {
    const a = fresh(M, READ);
    const r = resultOf(a);
    assertEqual(r.n, 4);
    assertEqual(pointsOf(a).length, r.n);
    assertDeepEqual(r, {
      chartType: 'xbar-r', subgroupSize: 5, n: 4, baselineEnd: 23, stages: [10], frozen: false,
      subcharts: {
        xbar: { cl: 9.991, ucl: 10.063125, lcl: 9.918875, sigma: 0.02403340474526876 },
        r: { cl: 0.1250000000000009, ucl: 0.2642500000000019, lcl: 0, sigma: 0.046416666666666995 },
      },
      capability: null, violations: [], signals: [],
    });
  });

  test('Stufe, deren Werte keine volle Untergruppe bilden („20“ bei 23 Werten): entfällt, Grenzen endlich', () => {
    const a = fresh(model({ ...M, stagesText: '20' }), READ);
    assertEqual(a.status, 'ok');
    assertDeepEqual(a.fit.segments, [{ start: 0, end: 4 }]);
    assertDeepEqual(resultOf(a).subcharts.xbar, { cl: 10, ucl: 10.077895, lcl: 9.922105, sigma: 0.025956077124890207 });
  });
});

suite('control-chart: Merker', () => {
  test('gleiche Eingabe → dasselbe Objekt, die Engine läuft nicht', () => {
    const a = run(LEGACY_MODEL);
    const n = engineRuns();
    const b = run(LEGACY_MODEL);
    assertTrue(a === b);
    assertEqual(engineRuns(), n);
    assertTrue(run({ ...LEGACY_MODEL, annotations: { ...LEGACY_MODEL.annotations } }) === a, 'neues, gleiches Objekt');
    assertEqual(engineRuns(), n);
  });

  test('je wirksame Änderung genau eine neue Rechnung', () => {
    const changes = [
      ['Spalte', { columnRef: ref('value'), frozenLimits: null }],
      ['Kartentyp', { chartTypeId: 'xbar-r', subgroupSize: 5 }],
      ['Untergruppe', { chartTypeId: 'xbar-r', subgroupSize: 3 }],
      ['Phase I', { baselineCount: 25 }],
      ['Stufen', { stagesText: '15' }],
      ['USL', { usl: 10.6 }],
      ['LSL', { lsl: 9.3 }],
      ['Regel', { enabledRules: [1, 2] }],
      ['Ausschluss', { annotations: { 20: { comment: 'Werkzeugwechsel', excluded: true }, 5: { comment: '', excluded: true } } }],
      ['Phase II aus', { frozenLimits: null }],
      ['eingefrorene Grenze', { frozenLimits: { ...LEGACY_MODEL.frozenLimits, primary: { cl: 10, ucl: 10.4, lcl: 9.7, sigma: 0.1 } } }],
    ];
    for (const [label, over] of changes) {
      run(LEGACY_MODEL);
      const n = engineRuns();
      run({ ...LEGACY_MODEL, ...over });
      assertEqual(engineRuns(), n + 1, label);
      run({ ...LEGACY_MODEL, ...over });
      assertEqual(engineRuns(), n + 1, `${label}: erneutes Lesen`);
    }
  });

  test('Wertänderung der Spalte: eine Rechnung; gleiche Werte in neuer Liste: keine', () => {
    const vals = [...DURCHMESSER];
    const read = { values: () => vals };
    run(LEGACY_MODEL, read);
    let n = engineRuns();
    run(LEGACY_MODEL, { values: () => [...DURCHMESSER] });
    assertEqual(engineRuns(), n);
    vals[3] = 10.5;
    run(LEGACY_MODEL, read);
    assertEqual(engineRuns(), n + 1);
    n = engineRuns();
    run(LEGACY_MODEL, read);
    assertEqual(engineRuns(), n);
  });

  test('keine Rechnung ohne wirksame Änderung: Stufentext gleichwertig, Kommentar ohne Ausschluss, fremde Felder', () => {
    const base = model({ columnRef: ref('durchmesser'), stagesText: '12,25' });
    run(base);
    const n = engineRuns();
    run({ ...base, stagesText: '12, 25' });
    run({ ...base, stagesText: '25 12' });
    run({ ...base, annotations: { 4: { comment: 'nur Text', excluded: false } } });
    run({ ...base, exampleWorksheetId: 'ws9', charts: { i: { title: 'x' } } });
    run({ ...base, stagesText: '12,25,100' });
    assertEqual(engineRuns(), n, 'Stufe jenseits der Werte ist keine wirksame Änderung');
  });

  test('der Merker hält auch Fehler und null', () => {
    const m = model({ columnRef: ref('riesig') });
    const a = quiet(() => run(m)).value;
    const n = engineRuns();
    const { value: b, warned } = quiet(() => run(m));
    assertTrue(a === b);
    assertEqual([engineRuns(), warned].join(), [n, 0].join(), 'keine zweite Rechnung, keine zweite Warnung');
    assertEqual(run(model()), null);
    assertEqual(run(model()), null);
    assertEqual(engineRuns(), n);
  });

  test('die Eingabe wird kopiert: spätere Änderung an den Listen täuscht den Merker nicht', () => {
    const inputs = inputsOf(model({ columnRef: ref('durchmesser'), enabledRules: [1, 2] }), COLS);
    const a = analyze(inputs);
    let n = engineRuns();
    inputs.enabledRules.push(5);
    const b = analyze(inputs);
    assertTrue(a !== b);
    assertEqual(engineRuns(), n + 1);
    n = engineRuns();
    inputs.values[0] = 99;
    analyze(inputs);
    assertEqual(engineRuns(), n + 1);
  });
});

suite('control-chart: pointsOf', () => {
  test('je Punkt der ersten Teilkarte eine Zeile: Punkt und Grenzen je Teilkarte, dazu signal', () => {
    const a = run(LEGACY_MODEL);
    const p = pointsOf(a);
    assertEqual(p.length, 30);
    assertDeepEqual(Object.keys(p[0]), ['i', 'iCl', 'iUcl', 'iLcl', 'mr', 'mrCl', 'mrUcl', 'mrLcl', 'signal']);
    assertDeepEqual(p[0], { i: 10.02, iCl: 10, iUcl: 10.3, iLcl: 9.7, mr: null, mrCl: 0.1128, mrUcl: 0.3685, mrLcl: 0, signal: false });
    assertDeepEqual(p.flatMap((r, i) => (r.signal ? [i] : [])), LEGACY_RESULT.signals);
  });

  test('X̄-R mit Stufen: Grenzen je Punkt', () => {
    const p = pointsOf(run(LEGACY_XBAR_MODEL));
    assertEqual(p.length, 8);
    assertDeepEqual(Object.keys(p[0]), ['xbar', 'xbarCl', 'xbarUcl', 'xbarLcl', 'r', 'rCl', 'rUcl', 'rLcl', 'signal']);
    assertTrue(p[0].xbarCl !== p[7].xbarCl, 'Stufen haben eigene Grenzen');
    assertEqual(p[7].xbarCl, LEGACY_XBAR_RESULT.subcharts.xbar.cl);
  });

  test('leer ohne Ergebnis oder bei Fehler', () => {
    assertDeepEqual(pointsOf(null), []);
    assertDeepEqual(pointsOf({ status: 'error', reason: 'errCompute' }), []);
  });
});

suite('control-chart: uniqueViolations', () => {
  test('je Paar aus Punkt und Regel einmal, nach Punkt sortiert, Reihenfolge der Prüfung bleibt', () => {
    assertDeepEqual(uniqueViolations(V([[5, 2], [1, 1], [5, 1], [5, 2], [1, 1]])), V([[1, 1], [5, 2], [5, 1]]));
    assertDeepEqual(uniqueViolations([]), []);
  });
});

suite('control-chart: freezeLimitsOf', () => {
  test('wie buildFrozenLimits: Typ, Untergruppe, Spalte, Basis, Grenzen beider Teilkarten, Ausschlüsse', () => {
    const m = model({ columnRef: ref('durchmesser'), baselineCount: 20, annotations: { 4: { comment: '', excluded: true }, 9: { comment: 'x', excluded: false } } });
    const a = fresh(m);
    const f = freezeLimitsOf(m, a);
    const p = a.fit.subcharts.i;
    const s = a.fit.subcharts.mr;
    assertDeepEqual(f, {
      chartTypeId: 'i-mr', subgroupSize: 1, columnRef: ref('durchmesser'), baselineEnd: 20,
      primary: { cl: p.cl, ucl: p.ucl, lcl: p.lcl, sigma: p.sigma },
      secondary: { cl: s.cl, ucl: s.ucl, lcl: s.lcl, sigma: s.sigma },
      excludedIndices: [4],
    });
    assertTrue(f.columnRef !== m.columnRef, 'Kopie des Bezugs');
  });

  test('eingefroren → die Rechnung mit den eingefrorenen Grenzen gleicht der Livrechnung', () => {
    const m = model({ chartTypeId: 'xbar-r', subgroupSize: 5, columnRef: ref('laenge'), baselineCount: 25, enabledRules: [1, 2] });
    const live = fresh(m);
    const frozen = fresh({ ...m, frozenLimits: freezeLimitsOf(m, live) });
    assertEqual(frozen.frozen, true);
    assertDeepEqual(resultOf(frozen).subcharts, resultOf(live).subcharts);
    assertDeepEqual(resultOf(frozen).violations, resultOf(live).violations);
  });

  test('null mit Stufen, ohne Ergebnis oder bei Fehler', () => {
    assertEqual(freezeLimitsOf(LEGACY_XBAR_MODEL, fresh(LEGACY_XBAR_MODEL)), null);
    assertEqual(freezeLimitsOf(LEGACY_MODEL, null), null);
    assertEqual(freezeLimitsOf(LEGACY_MODEL, { status: 'error', reason: 'errCompute' }), null);
  });

  test('Stufentext jenseits der Werte sperrt das Einfrieren nicht', () => {
    const m = model({ columnRef: ref('durchmesser'), stagesText: '100' });
    const f = freezeLimitsOf(m, fresh(m));
    assertTrue(f !== null);
    assertEqual(f.baselineEnd, 30);
  });
});

suite('control-chart: tileAnalysisOf gleich der Altkachel', () => {
  const check = (id, m, values) => {
    const t = tileAnalysisOf(m, values);
    const e = LEGACY_TILE[id];
    assertEqual(t.status, 'ok', id);
    assertDeepEqual(
      { cl: t.primary.cl, ucl: t.primary.ucl, lcl: t.primary.lcl, sigma: t.primary.sigma, violations: t.violationIndices.length,
        violationIndices: t.violationIndices, totalPts: t.totalPoints, oos: t.outOfSpec, capability: t.capability, baselineEnd: t.baselineEnd },
      e, id,
    );
  };

  test('Altprojekte: ohne Stufen, ohne Ausschlüsse, ohne eingefrorene Grenzen', () => {
    check('legacy-project', LEGACY_MODEL, DURCHMESSER);
    check('legacy-project-xbar', LEGACY_XBAR_MODEL, LAENGE);
  });

  test('Beispiele control-chart-capability, -imr-annotated-frozen, -imr-shift', async () => {
    for (const [id, file, sheet, col, over] of EXAMPLES) {
      if (!LEGACY_TILE[id]) continue;
      const values = await exampleColumn(file, sheet, col);
      check(id, model({ columnRef: ref(col, sheet), ...over }), values);
    }
  });

  test('Kachel und Modul rechnen verschieden (Altverhalten): Phase II gilt nur im Modul', () => {
    assertEqual(resultOf(run(LEGACY_MODEL)).subcharts.i.cl, 10);
    assertTrue(tileAnalysisOf(LEGACY_MODEL, DURCHMESSER).primary.cl !== 10);
  });

  test('Punkte und Grenzen der ersten Teilkarte für das Diagramm', () => {
    const t = tileAnalysisOf(LEGACY_XBAR_MODEL, LAENGE);
    assertEqual(t.chartTypeId, 'xbar-r');
    assertEqual(t.primary.values.length, 8);
    assertEqual(typeof t.primary.cl, 'number', 'ohne Stufen skalare Grenzen');
  });

  test('ohne Bezug, ohne Spalte, unbekannter Typ oder unter zwei Werten null', () => {
    assertEqual(tileAnalysisOf(model(), DURCHMESSER), null);
    assertEqual(tileAnalysisOf(LEGACY_MODEL, null), null);
    assertEqual(tileAnalysisOf({ ...LEGACY_MODEL, chartTypeId: 'p' }, DURCHMESSER), null);
    assertEqual(tileAnalysisOf(LEGACY_MODEL, [1, 'x', null]), null);
  });

  test('Phase I größer als die Werte: wie alle, keine Trennlinie, kein NaN', () => {
    const t = tileAnalysisOf({ ...LEGACY_MODEL, baselineCount: 50 }, DURCHMESSER);
    const all = tileAnalysisOf({ ...LEGACY_MODEL, baselineCount: null }, DURCHMESSER);
    assertDeepEqual(t, all);
    assertEqual(t.baselineEnd, null);
    const x = tileAnalysisOf({ ...LEGACY_XBAR_MODEL, baselineCount: 50 }, LAENGE);
    assertTrue(Number.isFinite(x.primary.cl) && Number.isFinite(x.capability.cpk));
  });

  test('Überlauf → errCompute; außerhalb der Spezifikation nur mit Grenze', () => {
    const { value, warned } = quiet(() => tileAnalysisOf(model({ columnRef: ref('riesig') }), RIESIG));
    assertDeepEqual([value, warned], [{ status: 'error', reason: 'errCompute' }, 1]);
    assertEqual(tileAnalysisOf(model({ columnRef: ref('v') }), DURCHMESSER).outOfSpec, null);
    assertEqual(tileAnalysisOf(model({ columnRef: ref('v'), usl: 10.1 }), DURCHMESSER).outOfSpec, 5, '10,62 10,13 10,16 10,12 10,14');
  });

  test('die Kachel zählt nicht als Rechnung des Moduls', () => {
    const n = engineRuns();
    tileAnalysisOf(LEGACY_MODEL, DURCHMESSER);
    assertEqual(engineRuns(), n);
  });
});

suite('control-chart: errorOf', () => {
  test('Grund als Schlüssel, null mit Ergebnis oder ohne Ausgabe', () => {
    assertEqual(errorOf(null), null);
    assertEqual(errorOf(run(LEGACY_MODEL)), null);
    assertEqual(errorOf({ status: 'error', reason: 'errCompute' }), 'errCompute');
  });

  test('Fehlerobjekt eines computed zählt als errCompute', () => {
    assertEqual(errorOf({ error: new Error('x') }), 'errCompute');
  });
});

suite('control-chart: Engine-Teilkarten', () => {
  test('Teilkarten-Ids je Kartentyp, wie die Ansicht sie erwartet', () => {
    assertDeepEqual(CHART_TYPES.map((c) => [c.id, c.subcharts.map((s) => s.id)]),
      [['i-mr', ['i', 'mr']], ['xbar-r', ['xbar', 'r']], ['xbar-s', ['xbar', 's']]]);
  });
});

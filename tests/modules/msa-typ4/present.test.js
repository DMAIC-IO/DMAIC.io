/**
 * MSA Typ 4: Darstellung — Zahlformat je Sprache, p-Werte, Kacheln je Norm,
 * Deutung, Fehlertext, Tabelle und die vier Diagrammkonfigurationen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import {
  fmt, fmtP, resultOf, errorText, colorClass, verdictClass, kpiAiag, kpiVda, maxBiasText, interpretationText,
  tableRows, linearityChart, pctBiasChart, perRefChart, residualChart,
} from '../../../js/modules/msa-typ4/viewmodel/present.js';
import { runEngine, toResult, bandPoints } from '../../../js/modules/msa-typ4/domain/analyze.js';

/** Fake-Übersetzer: Schlüssel samt Werten. */
const t = (key, params) => (params ? `${key}|${JSON.stringify(params)}` : key);
const REF = [2, 2, 2, 4, 4, 4, 6, 6, 6, 8, 8, 8, 10, 10, 10];
const MEAS = REF.map((x, i) => x + 0.01 * x + ((i % 3) - 1) * 0.02);
const INPUTS = { reference: REF, measured: MEAS };
const P = { norm: 'AIAG', pvMode: 'tolerance', tolerance: { LSL: 0, USL: 12 }, sigmaP: null, alpha: 0.05 };
const RUN = runEngine(P, INPUTS);
const R = toResult(RUN);
const R_INF = toResult(runEngine({ ...P, norm: 'VDA5', pvMode: 'sixSigma', sigmaP: 0.5, tolerance: { LSL: 12, USL: null } }, INPUTS));

suite('MSA Typ 4 present — Zahlen und Klassen', () => {
  test('fmt im Zahlformat der Sprache, Strich für fehlende und nicht endliche Werte', () => {
    assertEqual(fmt(0.0739, 2, 'de'), '0,07');
    assertEqual(fmt(0.0739, 2, 'en'), '0.07');
    assertEqual(fmt(NaN, 2, 'de'), '–');
    assertEqual(fmt(null, 2, 'de'), '–');
    assertEqual(fmt(Infinity, 2, 'en'), '–');
  });
  test('fmtP: drei Stellen, unter 0,001 „< 0,001“, ohne Wert Strich', () => {
    assertEqual(fmtP(0.1506, 'de'), '0,151');
    assertEqual(fmtP(0.1506, 'en'), '0.151');
    assertEqual(fmtP(0.0004, 'de'), '< 0,001');
    assertEqual(fmtP(0.0004, 'en'), '< 0.001');
    assertEqual(fmtP(null, 'de'), '–');
  });
  test('resultOf blendet Ablehnung und Fehler aus', () => {
    assertEqual(resultOf(null), null);
    assertEqual(resultOf({ invalid: { key: 'x', vars: null } }), null);
    assertEqual(resultOf({ error: 'x' }), null);
    assertEqual(resultOf(R), R);
  });
  test('Ampelklassen wie die Altform; ohne Ergebnis grün', () => {
    assertEqual(colorClass('green'), 'dmike-kpi--good');
    assertEqual(colorClass('yellow'), 'dmike-kpi--warn');
    assertEqual(colorClass('red'), 'dmike-kpi--bad');
    assertEqual(colorClass('x'), '');
    assertEqual(verdictClass(null, 'AIAG'), 'dmike-kpi--good');
    assertEqual(verdictClass(R_INF, 'VDA5'), 'dmike-kpi--bad');
  });
});

suite('MSA Typ 4 present — Texte', () => {
  test('Fehlertext ohne Modulpräfix, mit den Werten der Engine; sonst leer', () => {
    assertEqual(errorText({ invalid: { key: 'modules.msa-typ4.errTooFewReferences', vars: { got: 4 } } }, t), 'errTooFewReferences|{"got":4}');
    assertEqual(errorText({ invalid: { key: 'modules.msa-typ4.errInvalidPv', vars: null } }, t), 'errInvalidPv');
    assertEqual(errorText(R, t), '');
    assertEqual(errorText(null, t), '');
  });
  test('Kacheln nach AIAG: Stellen der Altform, p-Wert, Signifikanz-Ampel', () => {
    const k = kpiAiag(R, t, 'de');
    assertTrue(/^\d+,\d{2} %$/.test(k.lin), k.lin);
    assertTrue(/^-?\d+,\d{4}$/.test(k.slope), k.slope);
    assertTrue(/^p = (\d,\d{3}|< 0,001)$/.test(k.slopeP), k.slopeP);
    assertEqual(k.slopeClass, R.kpi.aiag.slopeSignificant ? 'dmike-kpi--bad' : 'dmike-kpi--good');
    assertEqual(k.linClass, colorClass(R.kpi.aiag.verdict.color));
    assertEqual(k.verdict, R.kpi.aiag.verdict.key.replace('modules.msa-typ4.', ''));
  });
  test('Kacheln nach VDA 5: Q_MS,BI nicht endlich als Strich', () => {
    const k = kpiVda(R_INF, t, 'de');
    assertEqual(k.qMsBi, '– %');
    assertEqual(k.cls, 'dmike-kpi--bad');
    assertTrue(/^\d+,\d{4}$/.test(k.uBi), k.uBi);
    assertEqual(k.verdict, 'verdictVdaFail');
  });
  test('größter %Bias mit zwei Stellen', () => {
    assertTrue(/^\d+,\d{2} %$/.test(maxBiasText(R, 'de')), maxBiasText(R, 'de'));
  });
  test('Deutung: Kennzahlen im Zahlformat, p-Wert der Steigung eingesetzt, nicht endlich als Strich', () => {
    const de = interpretationText(R, t, 'de');
    const [key, json] = de.split('|');
    assertEqual(key, R.interpretation.textKey.replace('modules.msa-typ4.', ''));
    const vars = JSON.parse(json);
    assertEqual(vars.pctLin, fmt(R.kpi.aiag.percentLinearity, 2, 'de'));
    assertEqual(vars.pSlope, fmtP(R.regression.pSlope, 'de'));
    assertEqual(JSON.parse(interpretationText(R_INF, t, 'en').split('|')[1]).qMsBi, '–');
  });
  test('Tabelle: eine Zeile je Referenz, Stellen 3/4/4/2 %/2, Zeilenklasse je Ampel', () => {
    const rows = tableRows(R, 'de');
    assertEqual(rows.length, 5);
    assertDeepEqual(Object.keys(rows[0]), ['key', 'rowClass', 'xRef', 'n', 'mean', 'bias', 'percentBias', 'tStat', 'pValue']);
    assertEqual(rows[0].xRef, '2,000');
    assertEqual(rows[0].n, 3);
    assertTrue(/^\d+,\d{4}$/.test(rows[0].mean), rows[0].mean);
    assertTrue(/ %$/.test(rows[0].percentBias), rows[0].percentBias);
    assertEqual(rows[0].rowClass, `msa-typ4__row--${R.perReference[0].verdict}`);
  });
});

suite('MSA Typ 4 present — Diagramme', () => {
  test('ohne Ergebnis null', () => {
    assertEqual(linearityChart(null, null, t), null);
    assertEqual(pctBiasChart(null, t), null);
    assertEqual(perRefChart(null, INPUTS, t), null);
    assertEqual(residualChart(null, INPUTS, t), null);
  });
  test('Linearitätsplot wie die Altform: Bias je Messung, Fit mit Band, Linie bei 0', () => {
    const band = bandPoints(RUN, INPUTS);
    const c = /** @type {any} */ (linearityChart(INPUTS, band, t));
    assertEqual(c.series.length, 2);
    assertDeepEqual(c.series[0].y, REF.map((x, i) => MEAS[i] - x));
    assertEqual(c.series[1].name, 'charts.fitSeries');
    assertEqual(c.series[1].markerSize, 0);
    assertEqual(c.series[1].errorBars.bandShow, true);
    assertEqual(c.series[1].errorBars.bandColor, 'var(--color-accent-light)');
    assertDeepEqual(c.series[1].errorBars.yPlus, band.yPlus);
    assertEqual(c.moduleRefLines[0].value, 0);
    assertEqual(JSON.stringify(c), JSON.stringify(JSON.parse(JSON.stringify(c))));
  });
  test('%Bias mit Vorzeichen des Bias und Linien bei 0 und ±5', () => {
    const c = /** @type {any} */ (pctBiasChart(R, t));
    assertDeepEqual(c.series[0].x, [2, 4, 6, 8, 10]);
    assertDeepEqual(c.series[0].y, R.perReference.map((p) => p.percentBias * Math.sign(p.bias)));
    assertDeepEqual(c.moduleRefLines.map((l) => l.value), [0, 5, -5]);
  });
  test('je Referenz: Messwerte und Mittelwerte als Rauten', () => {
    const c = /** @type {any} */ (perRefChart(R, INPUTS, t));
    assertDeepEqual(c.series[0].y, MEAS);
    assertEqual(c.series[1].symbol, 'diamond');
    assertEqual(c.series[1].markerSize, 10);
  });
  test('Residuen über ŷ, Achse „ŷ“ wörtlich', () => {
    const c = /** @type {any} */ (residualChart(R, INPUTS, t));
    assertEqual(c.xLabel, 'ŷ');
    const { slope, intercept } = R.regression;
    assertEqual(c.series[0].x[0], slope * 2 + intercept);
    assertEqual(c.series[0].y[0], (MEAS[0] - 2) - (slope * 2 + intercept));
  });
});

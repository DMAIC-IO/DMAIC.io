/**
 * Ausreißertest: die Rechnung (domain/analyze.js) gegen die Altrechnung.
 * Die Literale stammen aus dem Altmodul (runAnalysis/_buildResult).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertDeepClose } from '../../test-utils.js';
import {
  ALL_METHODS, inputValues, analyze, buildResult, chartMethodOptions, effectiveChartMethod,
} from '../../../js/modules/outlier-test/domain/analyze.js';

const plain = (v) => JSON.parse(JSON.stringify(v));

/** Vorgaben der Parameter (Altmodul). */
const DEFAULTS = {
  alpha: 0.05, side: 'two-sided', tukeyFactor: 1.5, hampelK: 3, zThreshold: 3,
  modZThreshold: 3.5, esdMaxOutliers: null, enabled: [...ALL_METHODS], chartMethod: 'all',
};

/** Spalte „Durchmesser“ der Altprojekt-Fixture. */
const LEGACY_VALUES = [10.02, 9.98, 10.01, 9.97, 10.03, 10, 9.99, 10.02, 10.01, 9.98, 10, 10.03, 9.97, 10.01, 9.99, 10.02, 10, 9.98, 10.01, 10.45];
const LEGACY_PARAMS = {
  ...DEFAULTS, alpha: 0.1, side: 'upper', tukeyFactor: 2, hampelK: 2.5, zThreshold: 2.5, modZThreshold: 3,
  esdMaxOutliers: 3, enabled: ['grubbs', 'generalized-esd', 'tukey-iqr', 'z-score'], chartMethod: 'grubbs',
};

/** Ergebnis der Altrechnung für die Altprojekt-Fixture. */
const LEGACY_RESULT = {
  n: 20, flaggedIdxs: [19], methods: [
    { id: 'grubbs', flagged: [19], error: null, metrics: { statistic: 4.1773698753533095, critical: 2.3852746844697976, pValue: 1.0000263503881883e-12, mean: 10.0235, sd: 0.10209773439416277 }, steps: null },
    { id: 'generalized-esd', flagged: [19], error: null, metrics: { detected: 1, maxOutliers: 3 }, steps: [
      { i: 1, value: 10.45, R: 4.1773698753533095, lambda: 2.5565813344927606 },
      { i: 2, value: 9.97, R: 1.6242633958036505, lambda: 2.5311928033065336 },
      { i: 3, value: 9.97, R: 1.8122711674379421, lambda: 2.5040173902269114 },
    ] },
    { id: 'tukey-iqr', flagged: [19], error: null, metrics: { q1: 9.9875, median: 10.004999999999999, q3: 10.02, iqr: 0.03249999999999886, fenceLower: 9.922500000000003, fenceUpper: 10.084999999999997 }, steps: null },
    { id: 'z-score', flagged: [19], error: null, metrics: { mean: 10.0235, sd: 0.10209773439416277, threshold: 2.5 }, steps: null },
  ],
};

/** Spalte des Beispiels `outlier-bolzen-grubbs`. */
const BOLZEN = [9.9851, 9.9939, 9.9873, 9.9639, 10.0126, 9.9679, 9.9884, 10.26, 10.0564, 9.9412, 9.9441, 9.9916, 9.944, 10.0172, 10.0243, 9.9869, 9.9368, 10.0135, 10.0258, 9.745, 9.9608, 9.9777, 10.0122, 9.9719, 9.9492, 9.9677, 9.9304, 10.0193, 9.9976, 10.0654];
const BOLZEN_PARAMS = { ...DEFAULTS, enabled: ['grubbs', 'generalized-esd', 'tukey-iqr', 'modified-z'] };

/** Ergebnis der Altrechnung für das Beispiel. */
const BOLZEN_RESULT = {
  n: 30, flaggedIdxs: [7, 19], methods: [
    { id: 'grubbs', flagged: [7], error: null, metrics: { statistic: 3.59301364155483, critical: 2.9084730597409676, pValue: 0.001127391393380291, mean: 9.987936666666666, sd: 0.07572009473796533 }, steps: null },
    { id: 'generalized-esd', flagged: [7, 19], error: null, metrics: { detected: 2, maxOutliers: 7 }, steps: [
      { i: 1, value: 10.26, R: 3.59301364155483, lambda: 2.9084730597409676 },
      { i: 2, value: 9.745, R: 4.126371582304135, lambda: 2.8927047112289683 },
      { i: 3, value: 10.0654, R: 2.238548372616463, lambda: 2.8762091343375826 },
      { i: 4, value: 10.0564, R: 2.254798772624666, lambda: 2.8589228513713443 },
      { i: 5, value: 9.9304, R: 1.737683755094327, lambda: 2.8407740764706553 },
      { i: 6, value: 9.9368, R: 1.6642276683737296, lambda: 2.821681237805184 },
      { i: 7, value: 9.9412, R: 1.6447185197931333, lambda: 2.801551161550313 },
    ] },
    { id: 'tukey-iqr', flagged: [7, 19], error: null, metrics: { q1: 9.961575, median: 9.9871, q3: 10.013275, iqr: 0.0517000000000003, fenceLower: 9.884025, fenceUpper: 10.090825 }, steps: null },
    { id: 'modified-z', flagged: [7, 19], error: null, metrics: { median: 9.9871, mad: 0.026349999999999874, threshold: 3.5 }, steps: null },
  ],
};

/** @param {any[]|null} values @returns {{ values: () => any[]|null }} */
const reader = (values) => ({ values: () => values });

suite('outlier-test: inputValues', () => {
  test('nur Werte vom Typ Zahl: Text „2,5“, null, NaN, Wahrheitswerte entfallen', () => {
    const m = { colRef: { instanceId: 'w', sheetId: 's', columnId: 'c' } };
    assertDeepEqual(inputValues(m, reader([1, '2,5', null, NaN, 3, '', true, 4.5, undefined])), [1, 3, 4.5]);
  });

  test('ohne colRef oder bei fehlender Spalte → []', () => {
    assertDeepEqual(inputValues({ colRef: null }, reader([1, 2, 3])), []);
    assertDeepEqual(inputValues({ colRef: { instanceId: 'w', sheetId: 's', columnId: 'x' } }, reader(null)), []);
  });
});

suite('outlier-test: analyze und buildResult gegen die Altrechnung', () => {
  test('unter drei Werten null', () => {
    assertEqual(analyze([], DEFAULTS), null);
    assertEqual(analyze([1, 2], DEFAULTS), null);
  });

  test('Altprojekt-Fixture: G 4.1774, Gₜ 2.3853, obere Schranke 10.0850, Schwelle 2.50, markiert 10,45', () => {
    const res = buildResult(LEGACY_VALUES, analyze(LEGACY_VALUES, LEGACY_PARAMS));
    assertDeepClose(plain(res), LEGACY_RESULT);
    assertEqual(LEGACY_VALUES[res.flaggedIdxs[0]], 10.45);
    assertEqual(res.methods[0].metrics.statistic.toFixed(4), '4.1774');
    assertEqual(res.methods[0].metrics.critical.toFixed(4), '2.3853');
    assertEqual(res.methods[2].metrics.fenceUpper.toFixed(4), '10.0850');
    assertEqual(res.methods[3].metrics.threshold.toFixed(2), '2.50');
  });

  test('Beispiel outlier-bolzen-grubbs: gleich der Altrechnung', () => {
    assertDeepClose(plain(buildResult(BOLZEN, analyze(BOLZEN, BOLZEN_PARAMS))), BOLZEN_RESULT);
  });

  test('Reihenfolge der Verfahren nach ALL_METHODS, nicht nach enabled', () => {
    const res = buildResult(BOLZEN, analyze(BOLZEN, { ...BOLZEN_PARAMS, enabled: ['modified-z', 'grubbs'] }));
    assertDeepEqual(res.methods.map((m) => m.id), ['grubbs', 'modified-z']);
  });

  test('Fehlercodes je Verfahren: min4, zeroVariance, dixonRange', () => {
    const three = buildResult([1, 2, 3], analyze([1, 2, 3], DEFAULTS));
    const err = (r) => Object.fromEntries(r.methods.map((m) => [m.id, m.error]));
    assertDeepEqual(err(three), {
      grubbs: null, 'dixon-q': null, 'generalized-esd': 'min4', 'tukey-iqr': 'min4',
      hampel: null, 'z-score': null, 'modified-z': null,
    });
    const esd = three.methods.find((m) => m.id === 'generalized-esd');
    assertDeepEqual(plain(esd), { id: 'generalized-esd', flagged: [], error: 'min4', metrics: null, steps: null });

    const same = buildResult([5, 5, 5, 5], analyze([5, 5, 5, 5], DEFAULTS));
    assertEqual(err(same).grubbs, 'zeroVariance');
    assertEqual(err(same)['dixon-q'], 'zeroVariance');

    const many = Array.from({ length: 31 }, (_, i) => i + (i % 3) * 0.5);
    assertEqual(err(buildResult(many, analyze(many, DEFAULTS)))['dixon-q'], 'dixonRange');
  });

  test('esdMaxOutliers null heißt automatisch (n/4, höchstens 10)', () => {
    const res = buildResult(BOLZEN, analyze(BOLZEN, { ...BOLZEN_PARAMS, esdMaxOutliers: null }));
    assertEqual(res.methods.find((m) => m.id === 'generalized-esd').metrics.maxOutliers, 7);
  });
});

suite('outlier-test: Diagrammwahl', () => {
  test('chartMethodOptions: all und jedes aktive Verfahren mit Markierung', () => {
    const a = analyze(LEGACY_VALUES, LEGACY_PARAMS);
    assertDeepEqual(chartMethodOptions(LEGACY_PARAMS, a), ['all', 'grubbs', 'generalized-esd', 'tukey-iqr', 'z-score']);
    assertDeepEqual(chartMethodOptions(LEGACY_PARAMS, null), ['all']);
    const b = analyze(BOLZEN, { ...BOLZEN_PARAMS, enabled: ['hampel', 'grubbs'] });
    assertDeepEqual(chartMethodOptions({ enabled: ['hampel', 'grubbs'] }, b), ['all', 'grubbs', 'hampel']);
  });

  test('effectiveChartMethod: gespeichertes Verfahren ohne Markierung → all, der Wert bleibt', () => {
    const model = { ...LEGACY_PARAMS, chartMethod: 'grubbs' };
    assertEqual(effectiveChartMethod(model, analyze(LEGACY_VALUES, model)), 'grubbs');
    const calm = LEGACY_VALUES.slice(0, 19);
    assertEqual(effectiveChartMethod(model, analyze(calm, model)), 'all');
    assertEqual(model.chartMethod, 'grubbs');
    assertEqual(effectiveChartMethod({ ...model, chartMethod: 'hampel' }, analyze(LEGACY_VALUES, model)), 'all');
    assertEqual(effectiveChartMethod(model, null), 'all');
  });
});

suite('outlier-test: analyze rechnet je Eingabe nur einmal', () => {
  test('gleiche Eingabe (neue Listen mit gleichem Inhalt) → dasselbe Ergebnisobjekt', () => {
    const a = analyze([...BOLZEN], { ...BOLZEN_PARAMS, enabled: [...BOLZEN_PARAMS.enabled] });
    const b = analyze([...BOLZEN], { ...BOLZEN_PARAMS, enabled: [...BOLZEN_PARAMS.enabled] });
    assertTrue(a === b, 'neu gerechnet trotz gleicher Eingabe');
  });

  test('andere Zahl, anderer Parameter oder andere Verfahren → neu gerechnet', () => {
    const a = analyze(BOLZEN, BOLZEN_PARAMS);
    const values = [...BOLZEN];
    values[3] = 9.9;
    const b = analyze(values, BOLZEN_PARAMS);
    assertTrue(a !== b, 'Zahl geändert, nicht neu gerechnet');
    const c = analyze(values, { ...BOLZEN_PARAMS, tukeyFactor: 2 });
    assertTrue(b !== c, 'Parameter geändert, nicht neu gerechnet');
    assertTrue(c.results['tukey-iqr'].fenceUpper > b.results['tukey-iqr'].fenceUpper, 'Tukey nicht mit neuem Faktor');
    const d = analyze(values, { ...BOLZEN_PARAMS, tukeyFactor: 2, enabled: ['grubbs'] });
    assertDeepEqual(Object.keys(d.results), ['grubbs']);
    const e = analyze(values, { ...BOLZEN_PARAMS, tukeyFactor: 2, esdMaxOutliers: 3 });
    assertEqual(e.results['generalized-esd'].parameters.maxOutliers, 3);
  });

  test('wechselnde Eingaben liefern jeweils ihr eigenes, richtiges Ergebnis', () => {
    const x = plain(buildResult(LEGACY_VALUES, analyze(LEGACY_VALUES, LEGACY_PARAMS)));
    const y = plain(buildResult(BOLZEN, analyze(BOLZEN, BOLZEN_PARAMS)));
    assertDeepEqual(plain(buildResult(LEGACY_VALUES, analyze(LEGACY_VALUES, LEGACY_PARAMS))), x);
    assertDeepClose(y, BOLZEN_RESULT);
  });
});

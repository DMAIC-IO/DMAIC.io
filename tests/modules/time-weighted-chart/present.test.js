/**
 * Zeitgewichtete Regelkarten: der Presenter (viewmodel/present.js) —
 * KPI-Leiste, Abzeichen, Kopfzeilen und Diagrammkonfiguration je Teilkarte.
 * Die englischen Literale gleichen der Altform (Beispiele und Altprojekt,
 * E2E aus Task 0).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import {
  fmt, kpiOf, badgeOf, chartConfig, chartViewsOf, CHARTS_OF, LEGACY_EDIT_KEYS,
} from '../../../js/modules/time-weighted-chart/viewmodel/present.js';
import { CHART_KEYS } from '../../../js/modules/time-weighted-chart/domain/model.js';
import { inputsOf, analyzeWith, CHART_TYPES } from '../../../js/modules/time-weighted-chart/domain/analyze.js';
import { DURCHMESSER, WERT } from './analyze.test.js';

const plain = (v) => JSON.parse(JSON.stringify(v));

const PARAMS = (o = {}) => ({ ewma: { lambda: 0.2, L: 3, ...o.ewma }, cusum: { kSigma: 0.5, hSigma: 4, ...o.cusum } });
const model = (over = {}) => ({
  chartTypeId: 'ewma', sigmaMethod: 'mr', baselineCount: null, targetOverride: null, sigmaOverride: null, params: PARAMS(), ...over,
});
/** Ergebnis wie `analyze`, ohne Merker. */
const run = (values, m) => {
  const inputs = inputsOf(values, m);
  return /** @type {any} */ (analyzeWith(CHART_TYPES[inputs.type].engine, inputs));
};

const EX_EWMA = run(WERT, model());
const EX_CUSUM = run(WERT, model({ chartTypeId: 'cusum', baselineCount: 30 }));
const LEGACY = model({ sigmaMethod: 'sd', baselineCount: 20, targetOverride: 25, params: PARAMS({ ewma: { lambda: 0.1, L: 2.7 }, cusum: { hSigma: 5 } }) });
const LEG_CUSUM = run(DURCHMESSER, { ...LEGACY, chartTypeId: 'cusum' });
const LEG_EWMA = run(DURCHMESSER, LEGACY);

/** Übersetzer aus `ui.<lang>.json` des Moduls. */
async function translator(lang) {
  const res = await fetch(new URL(`../../../js/modules/time-weighted-chart/resources/i18n/ui.${lang}.json`, import.meta.url), { cache: 'no-cache' });
  const ui = await res.json();
  return (key, params) => {
    const v = ui[key];
    if (typeof v !== 'string') return key;
    return v.replace(/\{(\w+)\}/g, (_, k) => (params && k in params ? String(params[k]) : `{${k}}`));
  };
}

suite('time-weighted-chart: Presenter', () => {
  test('fmt: vier Stellen in der Sprache, „–“ für leer und nicht endlich', () => {
    assertEqual(fmt(10.058175, 'en'), '10.0582');
    assertEqual(fmt(10.058175, 'de'), '10,0582');
    assertEqual(fmt(25, 'en'), '25.0000');
    for (const v of [NaN, Infinity, -Infinity, null, undefined, '3']) assertEqual(fmt(v, 'de'), '–');
  });

  test('KPI-Leiste EWMA wie die Altform (en), Dezimalkomma und λ formatiert in de', async () => {
    const en = await translator('en');
    assertDeepEqual(plain(kpiOf(EX_EWMA, 0.2, en, 'en')), {
      type: 'ewma', targetText: '10.0582', sigmaHatText: 'σ̂ = 0.0965', signals: 4, ofText: 'of 60 data points',
      signalsClass: 'dmike-kpi--bad', sigmaSteadyText: '0.0322', lambdaText: 'λ = 0.2',
    });
    assertDeepEqual(plain(kpiOf(LEG_EWMA, 0.1, en, 'en')), {
      type: 'ewma', targetText: '25.0000', sigmaHatText: 'σ̂ = 0.0446', signals: 9, ofText: 'of 40 data points',
      signalsClass: 'dmike-kpi--bad', sigmaSteadyText: '0.0102', lambdaText: 'λ = 0.1',
    });
    const de = await translator('de');
    const k = kpiOf(EX_EWMA, 0.25, de, 'de');
    assertEqual(k.targetText, '10,0582');
    assertEqual(k.sigmaHatText, 'σ̂ = 0,0965');
    assertEqual(k.sigmaSteadyText, '0,0322');
    assertEqual(k.lambdaText, 'λ = 0,25');
    assertEqual(k.ofText, 'von 60 Datenpunkten');
    const none = { ...EX_EWMA, fit: { ...EX_EWMA.fit, signals: [] } };
    assertEqual(kpiOf(none, 0.2, en, 'en').signalsClass, 'dmike-kpi--good');
  });

  test('KPI-Leiste CUSUM wie die Altform (en): Signale oben und unten zusammen', async () => {
    const en = await translator('en');
    assertDeepEqual(plain(kpiOf(EX_CUSUM, 0.2, en, 'en')), {
      type: 'cusum', targetText: '10.0003', sigmaHatText: 'σ̂ = 0.1100', signals: 17, ofText: 'of 60 data points',
      signalsClass: 'dmike-kpi--bad', hText: '0.4401', kText: 'k = 0.0550',
    });
    assertDeepEqual(plain(kpiOf(LEG_CUSUM, 0.1, en, 'en')), {
      type: 'cusum', targetText: '25.0000', sigmaHatText: 'σ̂ = 0.0446', signals: 12, ofText: 'of 40 data points',
      signalsClass: 'dmike-kpi--bad', hText: '0.2232', kText: 'k = 0.0223',
    });
    const both = { ...EX_CUSUM, fit: { ...EX_CUSUM.fit, signalsHi: [1, 2], signalsLo: [5] } };
    assertEqual(kpiOf(both, 0.2, en, 'en').signals, 3);
    const de = await translator('de');
    assertEqual(kpiOf(EX_CUSUM, 0.2, de, 'de').kText, 'k = 0,0550');
  });

  test('Abzeichen: stabil ohne Signal, sonst Zahl der Signale', async () => {
    const en = await translator('en');
    assertDeepEqual(badgeOf(0, en), { text: 'STABLE', cls: 'twc__badge--stable', stable: true, unstable: false });
    assertDeepEqual(badgeOf(12, en), { text: '12 signals', cls: 'twc__badge--unstable', stable: false, unstable: true });
  });

  test('Teilkarten: Schlüssel und Reihenfolge je Typ, Titel mit Spalte, eigene Signale, Altschlüssel', async () => {
    const en = await translator('en');
    const ew = chartViewsOf(EX_EWMA, 'Wert', en);
    assertDeepEqual(Object.keys(ew), ['ewma']);
    assertEqual(ew.ewma.title, 'EWMA — Wert');
    assertEqual(ew.ewma.badge.text, '4 signals');
    assertEqual(ew.ewma.legacyEditKey, 'ewma');
    const cu = chartViewsOf(LEG_CUSUM, 'Durchmesser', en);
    assertDeepEqual(Object.keys(cu), ['cusum_plus', 'cusum_minus']);
    assertEqual(cu.cusum_plus.title, 'CUSUM C⁺ — Durchmesser');
    assertEqual(cu.cusum_minus.title, 'CUSUM C⁻ — Durchmesser');
    assertEqual(cu.cusum_plus.badge.text, '12 signals');
    assertTrue(cu.cusum_plus.badge.unstable, 'C⁺ nicht unruhig');
    assertEqual(cu.cusum_minus.badge.text, 'STABLE');
    assertTrue(cu.cusum_minus.badge.stable, 'C⁻ nicht stabil');
    assertDeepEqual([cu.cusum_plus.legacyEditKey, cu.cusum_minus.legacyEditKey], ['cusum', 'cusum#2']);
    // Die Teilkarten sind genau die Schlüssel von model.charts.
    assertDeepEqual([...CHARTS_OF.ewma, ...CHARTS_OF.cusum], [...CHART_KEYS]);
    assertDeepEqual(Object.keys(LEGACY_EDIT_KEYS), [...CHART_KEYS]);
  });

  test('Konfiguration EWMA: Grenzen je Punkt, CL einelementig, Signale sortiert, ohne NaN', async () => {
    const en = await translator('en');
    const c = /** @type {any} */ (chartConfig(EX_EWMA, 'ewma', en));
    assertDeepEqual(Object.keys(c), [
      'title', 'showTitle', 'showLegend', 'xLabel', 'yLabel', 'values', 'cl', 'ucl', 'lcl', 'sigma',
      'violationIndices', 'usl', 'lsl', 'showZones',
    ]);
    assertEqual(c.title, '');
    assertEqual(c.showTitle, false);
    assertEqual(c.showLegend, false);
    assertEqual(c.xLabel, 'Sample');
    assertEqual(c.yLabel, 'EWMA z');
    assertEqual(c.values.length, 60);
    assertDeepEqual(c.cl, [EX_EWMA.fit.cl]);
    assertEqual(c.ucl.length, 60);
    assertEqual(c.lcl.length, 60);
    assertEqual(c.sigma.length, 60);
    assertTrue(c.ucl[0] < c.ucl[59], 'Grenzen weiten sich nicht');
    assertDeepEqual(c.violationIndices, [25, 53, 58, 59]);
    assertEqual(c.usl, null);
    assertEqual(c.lsl, null);
    assertEqual(c.showZones, false);
    for (const k of ['values', 'ucl', 'lcl', 'sigma']) assertTrue(c[k].every(Number.isFinite), `nicht endlich in ${k}`);
    assertTrue(c.values !== EX_EWMA.fit.values, 'Liste der Engine weitergereicht statt kopiert');
    const unsorted = { ...EX_EWMA, fit: { ...EX_EWMA.fit, signals: [5, 2, 5] } };
    assertDeepEqual(/** @type {any} */ (chartConfig(unsorted, 'ewma', en)).violationIndices, [2, 5]);
  });

  test('Konfiguration CUSUM: C⁺ bzw. C⁻, Grenzen einelementig, eigene Signale', async () => {
    const en = await translator('en');
    const hi = /** @type {any} */ (chartConfig(LEG_CUSUM, 'cusum_plus', en));
    const lo = /** @type {any} */ (chartConfig(LEG_CUSUM, 'cusum_minus', en));
    assertEqual(hi.yLabel, 'C⁺');
    assertEqual(lo.yLabel, 'C⁻');
    assertDeepEqual(hi.values, [...LEG_CUSUM.fit.cPlus]);
    assertDeepEqual(lo.values, [...LEG_CUSUM.fit.cMinus]);
    for (const c of [hi, lo]) {
      assertDeepEqual(c.cl, [0]);
      assertDeepEqual(c.ucl, [LEG_CUSUM.fit.h]);
      assertDeepEqual(c.lcl, [0]);
      assertDeepEqual(c.sigma, [0]);
      assertEqual(c.showZones, false);
      assertTrue(c.values.every(Number.isFinite), 'nicht endlich');
    }
    assertDeepEqual(hi.violationIndices, [28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39]);
    assertDeepEqual(lo.violationIndices, []);
    const de = await translator('de');
    assertEqual(/** @type {any} */ (chartConfig(LEG_CUSUM, 'cusum_plus', de)).xLabel, 'Stichprobe');
  });
});

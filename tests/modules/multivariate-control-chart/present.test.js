/**
 * Multivariate Regelkarte: der Presenter (viewmodel/present.js) — KPI-Leiste,
 * Abzeichen, Kopfzeile und Diagrammkonfiguration. Die englischen Literale
 * gleichen der Altform (Altprojekt-Fixture, E2E „Legacy project“).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { fmt, kpiOf, badgeOf, chartTitleOf, chartConfig } from '../../../js/modules/multivariate-control-chart/viewmodel/present.js';
import { computeHotellingT2 } from '../../../js/engines/multivariate-chart-engine.js';

const plain = (v) => JSON.parse(JSON.stringify(v));

/** Spalten der Altprojekt-Fixture (n = 30; Index 24 bricht den Zusammenhang). */
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
const ROWS = DRUCK.map((d, i) => [d, TEMP[i], DICHTE[i]]);
/** Altprojekt: α 0,01, Phase I 20. */
const FIT = computeHotellingT2(ROWS, { alpha: 0.01, baselineEnd: 20 });

/** Übersetzer aus `ui.<lang>.json` des Moduls. */
async function translator(lang) {
  const res = await fetch(new URL(`../../../js/modules/multivariate-control-chart/resources/i18n/ui.${lang}.json`, import.meta.url), { cache: 'no-cache' });
  const ui = await res.json();
  return (key, params) => {
    const v = ui[key];
    if (typeof v !== 'string') return key;
    return v.replace(/\{(\w+)\}/g, (_, k) => (params && k in params ? String(params[k]) : `{${k}}`));
  };
}

suite('multivariate-control-chart: Presenter', () => {
  test('fmt: drei Stellen in der Sprache, „–“ für leer und nicht endlich', () => {
    assertEqual(fmt(18.254249708826574, 'en'), '18.254');
    assertEqual(fmt(18.254249708826574, 'de'), '18,254');
    assertEqual(fmt(2.1e-6, 'en'), '0.000');
    for (const v of [NaN, Infinity, null, undefined, '3']) assertEqual(fmt(v, 'de'), '–');
  });

  test('KPI-Leiste wie die Altform (en), Dezimalkomma in de, α ohne feste Stellen', async () => {
    const en = await translator('en');
    assertDeepEqual(plain(kpiOf(FIT, 30, 0.01, en, 'en')), {
      uclText: '18.254', alphaText: 'α = 0.01', pText: '3', baselineText: 'm = 20 baseline',
      signals: 1, ofText: 'of 30 data points', signalsClass: 'dmike-kpi--bad',
    });
    const de = await translator('de');
    const k = kpiOf(FIT, 30, 0.0027, de, 'de');
    assertEqual(k.uclText, '18,254');
    assertEqual(k.alphaText, 'α = 0,0027');
    assertEqual(k.baselineText, 'm = 20 Baseline');
    assertEqual(k.ofText, 'von 30 Datenpunkten');
    assertEqual(kpiOf({ ...FIT, signals: [] }, 30, 0.01, en, 'en').signalsClass, 'dmike-kpi--good');
    assertEqual(kpiOf({ ...FIT, ucl: NaN }, 30, 0.01, en, 'en').uclText, '–');
  });

  test('Abzeichen: stabil ohne Signal, sonst die Zahl der Signale', async () => {
    const en = await translator('en');
    assertDeepEqual(badgeOf(FIT, en), { text: '1 signals', cls: 'mvcc__badge--unstable', stable: false, unstable: true });
    assertDeepEqual(badgeOf({ ...FIT, signals: [] }, en), { text: 'STABLE', cls: 'mvcc__badge--stable', stable: true, unstable: false });
  });

  test('Kopfzeile mit den Spaltennamen', async () => {
    const en = await translator('en');
    assertEqual(chartTitleOf(['Druck', 'Temperatur', 'Dichte'], en), 'Hotelling T² — Druck, Temperatur, Dichte');
  });

  test('Konfiguration des Widgets: Grenzen als einelementige Liste, Signale sortiert ohne Doppelte, kein NaN', async () => {
    const en = await translator('en');
    const c = chartConfig(FIT, en);
    assertDeepEqual(plain(c), {
      title: '', showTitle: false, showLegend: false, xLabel: 'Observation', yLabel: 'T²',
      values: FIT.t2, cl: [FIT.cl], ucl: [FIT.ucl], lcl: [0], sigma: [0],
      violationIndices: [24], usl: null, lsl: null, showZones: false,
    });
    assertTrue(c.values !== FIT.t2, 'Werte nicht kopiert');
    assertTrue(c.values.every((v) => Number.isFinite(v)), 'nicht endlicher T²-Wert');
    assertDeepEqual(chartConfig({ ...FIT, signals: [7, 2, 7, 0] }, en).violationIndices, [0, 2, 7]);
  });
});

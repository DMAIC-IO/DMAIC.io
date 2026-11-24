/**
 * Regelkarte seltener Ereignisse: der Presenter (viewmodel/present.js) —
 * KPI-Leiste, Abzeichen, Kopfzeile und Diagrammkonfiguration. Die englischen
 * Literale gleichen der Altform (Altprojekt, E2E „Legacy project“ am Altmodul;
 * Randfälle mit Überlauf und Typwechsel mit gewählter Spalte).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { fmt, kpiOf, badgeOf, chartTitleOf, chartConfig } from '../../../js/modules/rare-event-chart/viewmodel/present.js';
import { ENGINES, inputsOf, analyzeWith } from '../../../js/modules/rare-event-chart/domain/analyze.js';
import { TAGE, TAGE_SEIT, COUNTS, LEGACY_RESULT, EXAMPLE_RESULT, COUNTS_RESULT } from './analyze.test.js';

const plain = (v) => JSON.parse(JSON.stringify(v));

/** Ergebnis wie `analyze`, ohne Merker; die Werte gefiltert wie `inputValues`. */
const run = (values, chartTypeId) => {
  const inputs = inputsOf(values.filter((v) => typeof v === 'number' && !Number.isNaN(v)), { chartTypeId });
  return /** @type {any} */ (analyzeWith(ENGINES[inputs.type], inputs));
};

const LEGACY = run(TAGE, 't');
const EXAMPLE = run(TAGE_SEIT, 't');
const COUNTS_G = run(COUNTS, 'g');

/** Übersetzer aus `ui.<lang>.json` des Moduls. */
async function translator(lang) {
  const res = await fetch(new URL(`../../../js/modules/rare-event-chart/resources/i18n/ui.${lang}.json`, import.meta.url), { cache: 'no-cache' });
  const ui = await res.json();
  return (key, params) => {
    const v = ui[key];
    if (typeof v !== 'string') return key;
    return v.replace(/\{(\w+)\}/g, (_, k) => (params && k in params ? String(params[k]) : `{${k}}`));
  };
}

suite('rare-event-chart: Presenter', () => {
  test('fmt: drei Stellen in der Sprache, „–“ für leer und nicht endlich', () => {
    assertEqual(fmt(33.54606888146074, 'en'), '33.546');
    assertEqual(fmt(33.54606888146074, 'de'), '33,546');
    assertEqual(fmt(0, 'en'), '0.000');
    assertEqual(fmt(1.0651e-5, 'de'), '0,000');
    for (const v of [NaN, Infinity, -Infinity, null, undefined, '3']) assertEqual(fmt(v, 'de'), '–');
  });

  test('KPI-Leiste wie die Altform (en, Altprojekt), Dezimalkomma in de', async () => {
    const en = await translator('en');
    assertDeepEqual(plain(kpiOf(LEGACY, en, 'en')), {
      clText: '33.546', sigmaText: 'σ̂ = 0.871', uclText: '395.417', lclText: '0.000', signals: 1,
      ofText: 'of 18 data points', signalsClass: 'dmike-kpi--bad', transformed: true,
    });
    const de = await translator('de');
    assertDeepEqual(plain(kpiOf(LEGACY, de, 'de')), {
      clText: '33,546', sigmaText: 'σ̂ = 0,871', uclText: '395,417', lclText: '0,000', signals: 1,
      ofText: 'von 18 Datenpunkten', signalsClass: 'dmike-kpi--bad', transformed: true,
    });
  });

  test('KPI-Leiste der g-Karte („Counts“): Signale 0 gut, keine Originalskala', async () => {
    const en = await translator('en');
    assertDeepEqual(plain(kpiOf(COUNTS_G, en, 'en')), {
      clText: '8.500', sigmaText: 'σ̂ = 8.986', uclText: '35.458', lclText: '0.000', signals: 0,
      ofText: 'of 6 data points', signalsClass: 'dmike-kpi--good', transformed: false,
    });
  });

  test('KPI: nicht endliche Originalskala der t-Karte wird „–“', async () => {
    const en = await translator('en');
    const a = run([10, 20, 1e308, 15, 30], 't');
    assertEqual(a.status, 'ok');
    const k = kpiOf(a, en, 'en');
    assertEqual(k.uclText, '–');
    assertTrue(k.clText !== '–', 'CL endlich');
  });

  test('Abzeichen, Kopfzeile mit Spaltenname', async () => {
    const en = await translator('en');
    assertDeepEqual(badgeOf(0, en), { text: 'STABLE', cls: 'rec__badge--stable', icon: 'status.ok' });
    assertDeepEqual(badgeOf(1, en), { text: '1 signals', cls: 'rec__badge--unstable', icon: 'status.warning' });
    assertEqual(chartTitleOf('t', 'Tage', en), 't chart — Tage');
    assertEqual(chartTitleOf('g', '?', en), 'g chart — ?');
    const de = await translator('de');
    assertEqual(chartTitleOf('g', 'Counts', de), 'g-Karte — Counts');
    assertEqual(badgeOf(2, de).text, '2 Signale');
  });

  test('chartConfig: t-Karte mit Lücken (null), Grenzen einelementig, Signale sortiert, kein NaN', async () => {
    const en = await translator('en');
    const c = plain(chartConfig(LEGACY, en));
    assertEqual(c.values.length, 20);
    assertEqual(c.values[7], null);
    assertEqual(c.values[12], null);
    assertEqual(c.values.filter((v) => v !== null).length, 18);
    assertDeepEqual(c.cl, [LEGACY_RESULT.plotted.cl]);
    assertDeepEqual(c.ucl, [LEGACY_RESULT.plotted.ucl]);
    assertDeepEqual(c.lcl, [LEGACY_RESULT.plotted.lcl]);
    assertDeepEqual(c.sigma, [LEGACY_RESULT.plotted.sigma]);
    assertDeepEqual(c.violationIndices, LEGACY_RESULT.signals);
    assertDeepEqual(
      Object.fromEntries(['title', 'showTitle', 'showLegend', 'xLabel', 'yLabel', 'usl', 'lsl', 'showZones'].map((k) => [k, c[k]])),
      { title: '', showTitle: false, showLegend: false, xLabel: 'Observation', yLabel: 'Transformed y = t^(1/3.6)', usl: null, lsl: null, showZones: false },
    );
    assertTrue(!JSON.stringify(chartConfig(LEGACY, en)).includes('NaN'), 'NaN in der Konfiguration');
    const ex = plain(chartConfig(EXAMPLE, en));
    assertEqual(ex.values.length, 25);
    assertDeepEqual(ex.violationIndices, EXAMPLE_RESULT.signals);
  });

  test('chartConfig: g-Karte zeichnet die Zählwerte', async () => {
    const en = await translator('en');
    const c = plain(chartConfig(COUNTS_G, en));
    assertDeepEqual(c.values, [5, 10, 8, 12, 7, 9]);
    assertDeepEqual(c.ucl, [COUNTS_RESULT.plotted.ucl]);
    assertDeepEqual(c.lcl, [0]);
    assertDeepEqual(c.violationIndices, []);
    assertEqual(c.yLabel, 'Opportunities between events');
  });
});

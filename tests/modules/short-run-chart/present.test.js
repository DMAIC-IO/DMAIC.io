/**
 * Kurzserien-Regelkarte (Z-MR): der Presenter (viewmodel/present.js) —
 * KPI-Leiste, Teiletabelle, Abzeichen, Kopfzeilen und Diagrammkonfiguration
 * je Teilkarte. Die englischen Literale gleichen der Altform (Altprojekt, E2E
 * „Legacy project“ am Altmodul; Beispiel `spc-short-run-zmr`).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import {
  fmt, kpiOf, groupRowsOf, badgeOf, chartConfig, chartViewsOf, SUBCHARTS, LEGACY_EDIT_KEYS,
} from '../../../js/modules/short-run-chart/viewmodel/present.js';
import { CHART_KEYS } from '../../../js/modules/short-run-chart/domain/model.js';
import { inputsOf, analyzeWith } from '../../../js/modules/short-run-chart/domain/analyze.js';
import { computeZMR } from '../../../js/engines/short-run-chart-engine.js';
import { TEIL, MASS, SETUP, MESSWERT, LEGACY_RESULT, EXAMPLE_RESULT } from './analyze.test.js';

const plain = (v) => JSON.parse(JSON.stringify(v));

/** Ergebnis wie `analyze`, ohne Merker. */
const run = (values, groups) => /** @type {any} */ (analyzeWith(computeZMR, inputsOf({ values, groups })));

const LEGACY = run(MASS, TEIL);
const EXAMPLE = run(MESSWERT, SETUP);

/** Übersetzer aus `ui.<lang>.json` des Moduls. */
async function translator(lang) {
  const res = await fetch(new URL(`../../../js/modules/short-run-chart/resources/i18n/ui.${lang}.json`, import.meta.url), { cache: 'no-cache' });
  const ui = await res.json();
  return (key, params) => {
    const v = ui[key];
    if (typeof v !== 'string') return key;
    return v.replace(/\{(\w+)\}/g, (_, k) => (params && k in params ? String(params[k]) : `{${k}}`));
  };
}

suite('short-run-chart: Presenter', () => {
  test('fmt: drei Stellen in der Sprache, „–“ für leer und nicht endlich', () => {
    assertEqual(fmt(1.0541889970208544, 'en'), '1.054');
    assertEqual(fmt(1.0541889970208544, 'de'), '1,054');
    assertEqual(fmt(0, 'en'), '0.000');
    for (const v of [NaN, Infinity, -Infinity, null, undefined, '3']) assertEqual(fmt(v, 'de'), '–');
  });

  test('KPI-Leiste wie die Altform (en), Dezimalkomma in de', async () => {
    const en = await translator('en');
    const de = await translator('de');
    assertDeepEqual(plain(kpiOf(LEGACY, en, 'en')), {
      groups: 3, totalText: '20 values', mrBarText: '1.054', uclMrText: 'UCL_MR 3.444', signals: 3,
      ofText: 'of 20 data points', signalsClass: 'dmike-kpi--bad',
    });
    assertDeepEqual(plain(kpiOf(EXAMPLE, de, 'de')), {
      groups: 3, totalText: '24 Messwerte', mrBarText: '1,216', uclMrText: 'UCL_MR 3,974', signals: 1,
      ofText: 'von 24 Datenpunkten', signalsClass: 'dmike-kpi--bad',
    });
  });

  test('KPI-Leiste ohne Signal: Klasse gut; nicht endliche MR̄ als „–“', async () => {
    const en = await translator('en');
    const values = [1, 2, 3, 4, 5, 6];
    const groups = ['A', 'A', 'A', 'B', 'B', 'B'];
    const a = run(values, groups);
    const k = kpiOf(a, en, 'en');
    assertEqual(k.signals, 0);
    assertEqual(k.signalsClass, 'dmike-kpi--good');
    const broken = { ...a, fit: { ...a.fit, mrBarZ: NaN, uclMR: Infinity } };
    const kb = kpiOf(broken, en, 'en');
    assertEqual(kb.mrBarText, '–');
    assertEqual(kb.uclMrText, 'UCL_MR –');
  });

  test('Teiletabelle wie die Altform (en, de), Teil als Text, „–“ je Teil', () => {
    assertDeepEqual(plain(groupRowsOf(LEGACY, 'en')), [
      { group: 'A', count: 9, mean: '10.003', sigma: '0.028', mrBar: '0.031' },
      { group: 'B', count: 10, mean: '25.042', sigma: '0.104', mrBar: '0.118' },
      { group: 'C', count: 1, mean: '7.500', sigma: '0.000', mrBar: '0.000' },
    ]);
    assertDeepEqual(plain(groupRowsOf(EXAMPLE, 'de')).map((r) => [r.group, r.count, r.mean, r.sigma, r.mrBar]), [
      ['S1', 8, '10,019', '0,024', '0,028'],
      ['S2', 8, '24,986', '0,040', '0,046'],
      ['S3', 8, '7,504', '0,075', '0,085'],
    ]);
    const nums = run([1, 2, 3, 4, 5, 6], [1, 1, 1, 2, 2, 2]);
    assertDeepEqual(groupRowsOf(nums, 'en').map((r) => r.group), ['1', '2']);
    const odd = { ...nums, fit: { ...nums.fit, groups: [{ group: 'X', count: 3, mean: Infinity, sigma: NaN, mrBar: null }] } };
    assertDeepEqual(plain(groupRowsOf(odd, 'en')), [{ group: 'X', count: 3, mean: '–', sigma: '–', mrBar: '–' }]);
  });

  test('Abzeichen: stabil ohne Signal, sonst die Zahl; Icon je Zustand', async () => {
    const en = await translator('en');
    assertDeepEqual(badgeOf(0, en), { text: 'STABLE', cls: 'src__badge--stable', icon: 'status.ok' });
    assertDeepEqual(badgeOf(2, en), { text: '2 signals', cls: 'src__badge--unstable', icon: 'status.warning' });
  });

  test('chartConfig z: z-Werte, Grenzen 0/±3 einelementig, σ 1, Zonen, Trennlinien', async () => {
    const en = await translator('en');
    const c = /** @type {any} */ (chartConfig(LEGACY, 'z', en));
    assertEqual(c.title, '');
    assertEqual(c.showTitle, false);
    assertEqual(c.showLegend, false);
    assertEqual(c.xLabel, 'Observation');
    assertEqual(c.yLabel, 'z');
    assertEqual(c.values.length, 20);
    assertTrue(c.values.every((v) => Number.isFinite(v)), 'z nicht endlich');
    assertDeepEqual(c.cl, [0]);
    assertDeepEqual(c.ucl, [3]);
    assertDeepEqual(c.lcl, [-3]);
    assertDeepEqual(c.sigma, [1]);
    assertDeepEqual(c.violationIndices, LEGACY_RESULT.signalsZ);
    assertEqual(c.usl, null);
    assertEqual(c.lsl, null);
    assertEqual(c.showZones, true);
    assertDeepEqual(c.stageBoundaries, [9, 19]);
    assertTrue(c.values !== LEGACY.fit.z, 'Werteliste der Engine weitergegeben statt kopiert');
  });

  test('chartConfig mr: führende Lücke, MR̄/UCL/LCL einelementig, σ aus dem Abstand, ohne Zonen', async () => {
    const en = await translator('en');
    const c = /** @type {any} */ (chartConfig(LEGACY, 'mr', en));
    assertEqual(c.yLabel, 'MR (z)');
    assertEqual(c.values.length, 20);
    assertEqual(c.values[0], null);
    assertTrue(c.values.slice(1).every((v) => Number.isFinite(v)), 'MR nicht endlich');
    assertDeepEqual(c.cl, [LEGACY_RESULT.mr.cl]);
    assertDeepEqual(c.ucl, [LEGACY_RESULT.mr.ucl]);
    assertDeepEqual(c.lcl, [0]);
    assertDeepEqual(c.sigma, [(LEGACY_RESULT.mr.ucl - LEGACY_RESULT.mr.cl) / 3]);
    assertDeepEqual(c.violationIndices, [16, 17]);
    assertEqual(c.showZones, false);
    assertDeepEqual(c.stageBoundaries, [9, 19]);
    // Signale unsortiert und doppelt: sortiert, ohne Doppel.
    const shuffled = { ...LEGACY, fit: { ...LEGACY.fit, signalsMR: [17, 3, 17, 16] } };
    assertDeepEqual(/** @type {any} */ (chartConfig(shuffled, 'mr', en)).violationIndices, [3, 16, 17]);
    // Beispiel: Trennlinien [8, 16], MR ohne Signal.
    const ex = /** @type {any} */ (chartConfig(EXAMPLE, 'mr', en));
    assertDeepEqual(ex.stageBoundaries, [8, 16]);
    assertDeepEqual(ex.violationIndices, EXAMPLE_RESULT.signalsMR);
    assertEqual(ex.values.length, 24);
  });

  test('chartViewsOf: { z, mr } in Zeichenreihenfolge, Titel mit Spalte, Abzeichen je Teilkarte, Altschlüssel', async () => {
    const en = await translator('en');
    const de = await translator('de');
    const views = /** @type {any} */ (chartViewsOf(LEGACY, 'Mass', en));
    assertDeepEqual(Object.keys(views), ['z', 'mr']);
    assertEqual(views.z.title, 'Z chart — Mass');
    assertEqual(views.mr.title, 'MR chart (z) — Mass');
    assertDeepEqual(views.z.badge, { text: '1 signals', cls: 'src__badge--unstable', icon: 'status.warning' });
    assertDeepEqual(views.mr.badge, { text: '2 signals', cls: 'src__badge--unstable', icon: 'status.warning' });
    assertEqual(views.z.legacyEditKey, 'z');
    assertEqual(views.mr.legacyEditKey, 'mr');
    assertEqual(views.z.config.showZones, true);
    assertEqual(views.mr.config.values[0], null);
    const ex = /** @type {any} */ (chartViewsOf(EXAMPLE, '?', de));
    assertEqual(ex.z.title, 'Z-Karte — ?');
    assertEqual(ex.mr.title, 'MR-Karte (z) — ?');
    assertEqual(ex.z.badge.text, '1 Signale');
    assertDeepEqual(ex.mr.badge, { text: 'STABIL', cls: 'src__badge--stable', icon: 'status.ok' });
  });

  test('Schlüssel der Teilkarten gleich CHART_KEYS des Models', () => {
    assertDeepEqual([...SUBCHARTS], [...CHART_KEYS]);
    assertDeepEqual(Object.keys(LEGACY_EDIT_KEYS), [...CHART_KEYS]);
    assertDeepEqual(Object.keys(chartViewsOf(LEGACY, 'Mass', (k) => k)), [...CHART_KEYS]);
  });
});

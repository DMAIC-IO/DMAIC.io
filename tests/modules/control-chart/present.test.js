/**
 * Regelkarte für Variablen (I-MR, X̄-R, X̄-S): der Presenter
 * (viewmodel/present.js) — KPI-Leiste, Abzeichen, Kopfzeilen,
 * Diagrammkonfiguration je Teilkarte und Verletzungsliste. Die englischen
 * Literale gleichen der Altform (E2E „Legacy project“ am Altmodul, Task 0b).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import {
  fmt, kpiOf, badgeOf, chartConfig, chartViewsOf, violationRowsOf,
} from '../../../js/modules/control-chart/viewmodel/present.js';
import { CHART_KEYS } from '../../../js/modules/control-chart/domain/model.js';
import { inputsOf, analyzeWith, computeChart } from '../../../js/modules/control-chart/domain/analyze.js';
import { LEGACY, LEGACY_XBAR } from './migrations.test.js';
import { DURCHMESSER, LAENGE } from './analyze.test.js';

const plain = (v) => JSON.parse(JSON.stringify(v));

/** Ergebnis wie `analyze`, ohne Merker. */
const run = (model, values) => /** @type {any} */ (analyzeWith(computeChart, inputsOf(model, { values: () => values })));

const A_IMR = run(LEGACY, DURCHMESSER);
const A_XBAR = run(LEGACY_XBAR, LAENGE);

/** Übersetzer aus `ui.<lang>.json` des Moduls. */
async function translator(lang) {
  const res = await fetch(new URL(`../../../js/modules/control-chart/resources/i18n/ui.${lang}.json`, import.meta.url), { cache: 'no-cache' });
  const ui = await res.json();
  return (key, params) => {
    const v = ui[key];
    if (typeof v !== 'string') return key;
    return v.replace(/\{(\w+)\}/g, (_, k) => (params && k in params ? String(params[k]) : `{${k}}`));
  };
}
/** Globaler Übersetzer: Schlüssel mit Parametern. */
const gt = (key, params) => (params ? `${key}${JSON.stringify(params)}` : key);

suite('control-chart: Presenter', () => {
  test('fmt: Stellen in der Sprache, „–“ für leer und nicht endlich', () => {
    assertEqual(fmt(10, 'en', 4), '10.0000');
    assertEqual(fmt(10.3, 'de', 3), '10,300');
    for (const v of [NaN, Infinity, null, undefined, '3']) assertEqual(fmt(v, 'de', 3), '–');
  });

  test('KPI-Leiste Altprojekt I-MR: Texte wie die Altform (en), Dezimalkomma in de', async () => {
    const en = kpiOf(A_IMR, await translator('en'), 'en');
    assertDeepEqual(en, {
      cl: '10.0000', stageHint: '', sigmaText: 'σ̂ = 0.1000', ucl: '10.300', lcl: '9.700', violations: 5,
      ofText: 'of 30 data points', violationsClass: 'dmike-kpi--bad', cpk: '1.667', cpText: 'Cp = 1.833', cpkClass: 'dmike-kpi--good',
    });
    const de = kpiOf(A_IMR, await translator('de'), 'de');
    assertEqual(de.cl, '10,0000');
    assertEqual(de.sigmaText, 'σ̂ = 0,1000');
    assertEqual(de.cpText, 'Cp = 1,833');
    assertEqual(de.ofText, 'von 30 Datenpunkten');
  });

  test('KPI-Leiste Altprojekt X̄-R mit Stufen: Zusatz der Stufe, gute Klassen', async () => {
    assertDeepEqual(kpiOf(A_XBAR, await translator('en'), 'en'), {
      cl: '10.4987', stageHint: ' (Stage 2)', sigmaText: 'σ̂ = 0.0282', ucl: '10.583', lcl: '10.414', violations: 0,
      ofText: 'of 8 data points', violationsClass: 'dmike-kpi--good', cpk: '3.708', cpText: 'Cp = 4.229', cpkClass: 'dmike-kpi--good',
    });
  });

  test('KPI ohne Fähigkeit: keine Cpk-Zelle; Klassen warn und bad', async () => {
    const t = await translator('en');
    const k = kpiOf(run({ ...LEGACY, usl: null, lsl: null }, DURCHMESSER), t, 'en');
    assertEqual(k.cpk, '');
    assertEqual(k.cpText, '');
    assertEqual(k.cpkClass, '');
    const warn = kpiOf({ ...A_IMR, capability: { cpk: 1.1 } }, t, 'en');
    assertEqual(warn.cpkClass, 'dmike-kpi--warn');
    assertEqual(warn.cpText, '');
    assertEqual(kpiOf({ ...A_IMR, capability: { cp: 0.9, cpk: 0.5 } }, t, 'en').cpkClass, 'dmike-kpi--bad');
  });

  test('Abzeichen: stabil oder Zahl der Verletzungen', async () => {
    const t = await translator('en');
    assertDeepEqual(badgeOf(0, t), { text: 'STABLE', cls: 'control-chart__badge--stable', icon: 'status.ok' });
    assertDeepEqual(badgeOf(5, t), { text: '5 violations', cls: 'control-chart__badge--unstable', icon: 'status.warning' });
  });

  test('Teilkarten I-MR: Kopfzeilen und Abzeichen wie die Altform, Schlüssel und Altschlüssel', async () => {
    const t = await translator('en');
    const views = chartViewsOf(A_IMR, LEGACY, 'Durchmesser', t, 'en');
    assertDeepEqual(Object.keys(views), ['i', 'mr']);
    assertTrue(Object.keys(views).every((k) => CHART_KEYS.includes(k)), 'Schlüssel ohne Feld');
    assertEqual(views.i.title, 'I-Chart — Durchmesser');
    assertEqual(views.mr.title, 'MR-Chart — Durchmesser');
    assertEqual(views.i.badge.text, '5 violations');
    assertEqual(views.mr.badge.text, '2 violations');
    assertEqual(views.i.legacyEditKey, 'i');
    assertEqual(views.mr.legacyEditKey, 'mr');
  });

  test('Konfiguration I-MR: Grenzen einelementig, Ausschluss roh, Phase I, Spezifikation nur an I, MR mit Lücke', async () => {
    const t = await translator('en');
    const i = plain(chartConfig(A_IMR, 0, LEGACY, t, 'en'));
    assertDeepEqual(i, {
      title: '', xLabel: 'Sample', yLabel: 'Individual Value', showLegend: false, showTitle: false,
      values: DURCHMESSER, cl: [10], ucl: [10.3], lcl: [9.7], sigma: [0.1],
      violationIndices: [20, 24, 25, 26, 28], excludedIndices: [20], baselineEnd: 20, usl: 10.5, lsl: 9.4,
    });
    const mr = plain(chartConfig(A_IMR, 1, LEGACY, t, 'de'));
    assertEqual(mr.values.length, 30);
    assertEqual(mr.values[0], null);
    assertEqual(mr.values.slice(1).every((v) => Number.isFinite(v)), true);
    assertDeepEqual([mr.cl, mr.ucl, mr.lcl, mr.sigma], [[0.1128], [0.3685], [0], [0.0853]]);
    assertEqual(mr.yLabel, 'Gleitende Spannweite');
    assertEqual(mr.usl, null);
    assertEqual(mr.lsl, null);
    assertDeepEqual(mr.excludedIndices, [20]);
    assertEqual(mr.violationIndices.length, 2);
    assertEqual('stageBoundaries' in mr, false);
    assertTrue(!JSON.stringify(chartConfig(A_IMR, 1, LEGACY, t, 'en')).includes('NaN'), 'NaN in der Konfiguration');
  });

  test('Konfiguration X̄-R mit Stufen: Grenzen je Punkt, Stufen in Untergruppen, kein Phase-I-Ende, Ausschluss je Untergruppe', async () => {
    const t = await translator('en');
    const x = plain(chartConfig(A_XBAR, 0, LEGACY_XBAR, t, 'en'));
    assertEqual(x.values.length, 8);
    assertEqual(x.cl.length, 8);
    assertEqual(x.ucl.length, 8);
    assertDeepEqual(x.stageBoundaries, [5]);
    assertEqual(x.baselineEnd, null);
    assertDeepEqual([x.usl, x.lsl], [11.2, 9.6]);
    assertEqual(x.yLabel, 'X̄');
    const r = plain(chartConfig(A_XBAR, 1, LEGACY_XBAR, t, 'en'));
    assertEqual(r.yLabel, 'Range R');
    assertDeepEqual(r.stageBoundaries, [5]);
    assertEqual(r.usl, null);
    // Ausschlüsse an Einzelwerten 2, 3 und 7 → Untergruppen 0 und 1, entdoppelt.
    const ann = { 7: { comment: '', excluded: true }, 2: { comment: '', excluded: true }, 3: { comment: 'x', excluded: true }, 4: { comment: 'nur Text', excluded: false } };
    const model = { ...LEGACY_XBAR, stagesText: '', annotations: ann };
    const a = run(model, LAENGE);
    const c = plain(chartConfig(a, 0, model, t, 'en'));
    assertDeepEqual(c.excludedIndices, [0, 1]);
    assertEqual('stageBoundaries' in c, false);
    assertEqual(c.baselineEnd, null, 'Phase I über alle Punkte ist kein Ende');
    const bl = { ...model, baselineCount: 20 };
    assertEqual(plain(chartConfig(run(bl, LAENGE), 0, bl, t, 'en')).baselineEnd, 4);
  });

  test('Verletzungsliste: je Paar einmal, nach Punkt, Anmerkung mit ⊘', () => {
    const rows = violationRowsOf(A_IMR, LEGACY.annotations, gt);
    assertDeepEqual(rows.map((r) => [r.index, r.ruleId]), [[20, 1], [24, 6], [25, 6], [26, 6], [28, 6]]);
    assertDeepEqual(plain(rows[0]), {
      index: 20, ruleId: 1, idx: 'common.pointLabel{"n":21}', rule: 'common.ruleLabel{"n":1}', desc: 'common.nelson.1.short',
      hasAnn: true, annText: 'Werkzeugwechsel ⊘', annExcluded: true,
    });
    assertDeepEqual([rows[4].hasAnn, rows[4].annText, rows[4].annExcluded], [true, 'Messung wiederholt', false]);
    assertDeepEqual([rows[1].hasAnn, rows[1].annText, rows[1].annExcluded], [false, '', false]);
    const dup = { ...A_IMR, primaryViolations: [{ index: 3, ruleId: 2 }, { index: 1, ruleId: 5 }, { index: 3, ruleId: 2 }] };
    assertDeepEqual(violationRowsOf(dup, {}, gt).map((r) => [r.index, r.ruleId]), [[1, 5], [3, 2]]);
  });
});

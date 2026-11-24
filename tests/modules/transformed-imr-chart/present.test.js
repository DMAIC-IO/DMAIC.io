/**
 * Transformierte I-MR-Karte: der Presenter (viewmodel/present.js) — Lauf des
 * Tasks `analysis`, KPI-Leiste, Abzeichen, Grenzentabelle, Kopfzeile und
 * Diagrammkonfiguration. Die englischen Literale gleichen der Altform
 * (Altprojekt-Fixture, λ = 0,25 manuell; E2E „Legacy project“).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import {
  RERUN_DELAY, pause, analysisValueOf, analysisRun, fmt, kpiOf, badgeOf, limitRowsOf, chartTitleOf, chartConfig,
} from '../../../js/modules/transformed-imr-chart/viewmodel/present.js';
import { analyze, resultOf, pointsOf } from '../../../js/modules/transformed-imr-chart/domain/analyze.js';

const plain = (v) => JSON.parse(JSON.stringify(v));

/** Spalte „Standzeit“ der Altprojekt-Fixture (n = 30, Ausreißer 64 an Stelle 24). */
const STANDZEIT = [
  12.4, 8.1, 15.3, 9.7, 21.6, 11.2, 7.4, 13.8, 10.5, 18.9, 6.8, 14.1, 9.2, 26.3, 12.7,
  8.8, 16.4, 11.9, 7.9, 19.8, 10.1, 13.3, 9.5, 64, 11.6, 8.4, 17.2, 12.2, 10.8, 14.9,
];

/** `read().result` der Altform für die Altprojekt-Fixture (manuell, λ = 0,25). */
const LEGACY_RESULT = {
  n: 30, lambda: 0.25, lambdaAuto: false,
  i: { cl: 3.611341686152775, ucl: 6.880092160823472, lcl: 0.3425912114820777, sigma: 1.0895834915568992 },
  mr: { cl: 1.229050178476182, ucl: 4.015306933081686, lcl: 0 },
  iOriginal: { cl: 13.110066936701209, ucl: 54.73817719553579, lcl: 1.3891713921762856 },
  signals: [23],
};

/** Übersetzer aus `ui.<lang>.json` des Moduls. */
async function translator(lang) {
  const res = await fetch(new URL(`../../../js/modules/transformed-imr-chart/resources/i18n/ui.${lang}.json`, import.meta.url), { cache: 'no-cache' });
  const ui = await res.json();
  return (key, params) => {
    const v = ui[key];
    if (typeof v !== 'string') return key;
    return v.replace(/\{(\w+)\}/g, (_, k) => (params && k in params ? String(params[k]) : `{${k}}`));
  };
}

suite('transformed-imr-chart: Presenter — Zahlen', () => {
  test('drei Nachkommastellen in der Sprache, „–“ für nicht endlich', () => {
    assertEqual(fmt(3.611341686152775, 'en'), '3.611');
    assertEqual(fmt(3.611341686152775, 'de'), '3,611');
    assertEqual(fmt(1234.5, 'de'), '1.234,500');
    assertEqual(fmt(NaN, 'de'), '–');
    assertEqual(fmt(Infinity, 'en'), '–');
    assertEqual(fmt(null, 'en'), '–');
  });
});

suite('transformed-imr-chart: Presenter — Anzeige', () => {
  test('KPI-Leiste der Altprojekt-Fixture (en) wie die Altform', async () => {
    const t = await translator('en');
    assertDeepEqual(kpiOf(LEGACY_RESULT, t, 'en'), {
      lambdaText: '0.250', lambdaLabel: 'λ (manual)', clText: '3.611', sigmaText: 'σ̂ = 1.090',
      signals: 1, signalsSub: 'of 30 data points', signalsClass: 'dmike-kpi--bad',
    });
  });

  test('KPI-Leiste im Deutschen mit Dezimalkomma; ohne Signal gut, geschätztes λ mit (auto)', async () => {
    const t = await translator('de');
    const k = kpiOf({ ...LEGACY_RESULT, lambda: 0.35, lambdaAuto: true, signals: [] }, t, 'de');
    assertEqual(k.lambdaText, '0,350');
    assertEqual(k.lambdaLabel, 'λ (auto)');
    assertEqual(k.clText, '3,611');
    assertEqual(k.sigmaText, 'σ̂ = 1,090');
    assertEqual(k.signals, 0);
    assertEqual(k.signalsClass, 'dmike-kpi--good');
    assertEqual(k.signalsSub, 'von 30 Datenpunkten');
  });

  test('Abzeichen: stabil ohne Signal, sonst die Zahl der Signale', async () => {
    const t = await translator('en');
    assertDeepEqual(badgeOf(LEGACY_RESULT, t), { text: '1 signals', cls: 'timr__badge--unstable', stable: false, unstable: true });
    assertDeepEqual(badgeOf({ ...LEGACY_RESULT, signals: [] }, t), { text: 'STABLE', cls: 'timr__badge--stable', stable: true, unstable: false });
  });

  test('Grenzentabelle der Altprojekt-Fixture (en) wie die Altform; fehlende Grenze als „–“', async () => {
    const t = await translator('en');
    assertDeepEqual(limitRowsOf(LEGACY_RESULT, t, 'en'), [
      { label: 'UCL', transformed: '6.880', original: '54.738' },
      { label: 'CL', transformed: '3.611', original: '13.110' },
      { label: 'LCL', transformed: '0.343', original: '1.389' },
    ]);
    const missing = { ...LEGACY_RESULT, iOriginal: { ...LEGACY_RESULT.iOriginal, lcl: null } };
    assertEqual(limitRowsOf(missing, t, 'de')[2].original, '–');
    assertEqual(limitRowsOf(missing, t, 'de')[0].transformed, '6,880');
  });

  test('Kopfzeile: λ ohne feste Stellen in der Sprache der Oberfläche', async () => {
    assertEqual(chartTitleOf(LEGACY_RESULT, 'Standzeit', await translator('en'), 'en'), 'Box-Cox I — Standzeit (λ = 0.25)');
    assertEqual(chartTitleOf(LEGACY_RESULT, 'Standzeit', await translator('de'), 'de'), 'Box-Cox I — Standzeit (λ = 0,25)');
  });

  test('Diagrammkonfiguration: transformierte Werte, Grenzen als einelementige Listen, Signale sortiert ohne Doppelte', async () => {
    const t = await translator('en');
    const a = analyze(STANDZEIT, 0.25);
    const r = resultOf(a);
    const points = pointsOf(a);
    const c = chartConfig(r, points, t);
    assertDeepEqual(plain(c), {
      title: '', showTitle: false, showLegend: false, xLabel: 'Observation', yLabel: 'Transformed y',
      values: points.map((p) => p.transformed),
      cl: [r.i.cl], ucl: [r.i.ucl], lcl: [r.i.lcl], sigma: [r.i.sigma],
      violationIndices: [23], usl: null, lsl: null, showZones: true,
    });
    assertEqual(c.values.length, 30);
    assertDeepEqual(chartConfig({ ...r, signals: [7, 2, 7] }, points, t).violationIndices, [2, 7]);
  });
});

/** Fake-Viewmodel für den Lauf: Eingaben und Übersetzer. */
function host(values, lambda) {
  return {
    input: { values, lambda },
    inputs() { return { values: [...this.input.values], lambda: this.input.lambda }; },
    t: (k) => `text:${k}`,
  };
}

suite('transformed-imr-chart: Presenter — Lauf analysis', () => {
  test('Wert ohne Ergebnis (keine Spalte, unter 5 Zahlen): result null, points leer, kein Fehler', () => {
    assertDeepEqual(analysisValueOf(null, { errPositiveOnly: 'a', errCompute: 'b' }), { result: null, points: [], error: null, message: null });
  });

  test('Wert mit Fehlergrund und Text', () => {
    assertDeepEqual(
      analysisValueOf({ status: 'error', reason: 'errPositiveOnly' }, { errPositiveOnly: 'positiv!', errCompute: 'b' }),
      { result: null, points: [], error: 'errPositiveOnly', message: 'positiv!' },
    );
  });

  test('Snapshot vor dem ersten await: eine spätere Änderung der Eingaben wirkt nicht auf den Lauf', async () => {
    const calls = [];
    const run = analysisRun((values, lambda) => { calls.push({ values, lambda }); return analyze(values, lambda); });
    const vm = host(STANDZEIT, 0.25);
    const p = run.call(vm, {}, { signal: new AbortController().signal });
    vm.input = { values: [1, 2, 3], lambda: 1 };
    const v = await p;
    assertEqual(calls.length, 1);
    assertDeepEqual(calls[0], { values: STANDZEIT, lambda: 0.25 });
    assertDeepEqual(plain(v.result), LEGACY_RESULT);
    assertEqual(v.points.length, 30);
    assertEqual(v.error, null);
    assertEqual(v.message, null);
  });

  test('Abbruch in der Pause: keine Rechnung', async () => {
    let calls = 0;
    const run = analysisRun(() => { calls += 1; return null; });
    const ctl = new AbortController();
    const p = run.call(host(STANDZEIT, 0.25), {}, { signal: ctl.signal });
    setTimeout(() => ctl.abort(new Error('neu')), RERUN_DELAY / 4);
    let threw = false;
    try { await p; } catch { threw = true; }
    assertTrue(threw, 'Lauf nicht abgebrochen');
    assertEqual(calls, 0);
  });

  test('ohne Spalte: Wert ohne Ergebnis; nicht positive Werte: Grund und übersetzter Text', async () => {
    const run = analysisRun();
    const signal = new AbortController().signal;
    assertDeepEqual(await run.call(host([], undefined), {}, { signal }), { result: null, points: [], error: null, message: null });
    const v = await run.call(host([1, 2, 0, 4, 5, 6], undefined), {}, { signal });
    assertDeepEqual(v, { result: null, points: [], error: 'errPositiveOnly', message: 'text:errPositiveOnly' });
  });

  test('pause löst nach der Wartezeit auf und weist ein schon abgebrochenes Signal sofort ab', async () => {
    await pause(1, new AbortController().signal);
    const ctl = new AbortController();
    ctl.abort(new Error('x'));
    let threw = false;
    try { await pause(1000, ctl.signal); } catch { threw = true; }
    assertTrue(threw);
  });
});

/**
 * Verlaufsdiagramm: der Presenter (viewmodel/present.js) — KPI-Leiste,
 * Testtafel und Diagrammkonfiguration aus dem Rohergebnis. Die Literale der
 * englischen Fassung gleichen der Altform (Altprojekt-Fixture, α 0,1).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { fmt, pText, kpiOf, testRowsOf, chartConfig } from '../../../js/modules/run-chart/viewmodel/present.js';
import { analyze } from '../../../js/modules/run-chart/domain/analyze.js';

/** Übersetzer-Stub: Schlüssel mit Parametern, damit die Texte prüfbar sind. */
const T = (k, p) => (p ? `${k}(${Object.entries(p).map(([a, b]) => `${a}=${b}`).join(',')})` : k);

/** Spalte „Durchmesser“ der Altprojekt-Fixture (n = 24). */
const D = [
  9.96, 9.98, 10.01, 10.03, 10, 10.02, 10.04, 10.05, 10.03, 10.06, 10.08, 10.07,
  10.36, 10.38, 10.41, 10.43, 10.4, 10.42, 10.44, 10.45, 10.43, 10.46, 10.48, 10.47,
];

suite('run-chart: Presenter — Zahlen', () => {
  test('vier Nachkommastellen in der Sprache, „–“ für nicht endlich', () => {
    assertEqual(fmt(10.219999999999999, 'en'), '10.2200');
    assertEqual(fmt(10.219999999999999, 'de'), '10,2200');
    assertEqual(fmt(1234.5, 'de'), '1.234,5000');
    assertEqual(fmt(NaN, 'de'), '–');
    assertEqual(fmt(Infinity, 'en'), '–');
    assertEqual(fmt(null, 'en'), '–');
  });

  test('p-Wert: unter 0,0001 als „< 0,0001“', () => {
    assertEqual(pText(0.0000022, 'en'), '< 0.0001');
    assertEqual(pText(0.0000022, 'de'), '< 0,0001');
    assertEqual(pText(0.0001, 'en'), '0.0001');
    assertEqual(pText(0.03243159904910542, 'en'), '0.0324');
    assertEqual(pText(0.03243159904910542, 'de'), '0,0324');
    assertEqual(pText(0.9999977990625675, 'en'), '1.0000');
  });
});

suite('run-chart: Presenter — KPI-Leiste', () => {
  test('Altprojekt (α 0,1): Median, n, Läufe, zwei angeschlagen, α ohne feste Stellen', () => {
    const a = analyze(D);
    assertDeepEqual(kpiOf(a, 0.1, T, 'en'), {
      medianText: '10.2200', nText: 'statN(n=24)', runsAbout: 2, runsUpDownText: 'statRunsUpDown(count=12)',
      flagged: 2, flaggedClass: 'dmike-kpi--bad', alphaText: 'statAlpha(a=0.1)',
    });
    const de = kpiOf(a, 0.05, T, 'de');
    assertEqual(de.medianText, '10,2200');
    assertEqual(de.alphaText, 'statAlpha(a=0,05)');
    assertEqual(de.flagged, 2);
  });

  test('ohne Anschlag: Klasse gut', () => {
    const k = kpiOf(analyze(D), 0.000001, T, 'de');
    assertEqual(k.flagged, 0);
    assertEqual(k.flaggedClass, 'dmike-kpi--good');
    assertEqual(k.alphaText, 'statAlpha(a=0,000001)');
  });
});

suite('run-chart: Presenter — Testtafel', () => {
  test('vier Zeilen mit Name, Beschreibung, p-Wert, Status und Icon-Merker', () => {
    const rows = testRowsOf(analyze(D), 0.1, T, 'en');
    assertDeepEqual(rows.map((r) => r.id), ['clustering', 'mixtures', 'trends', 'oscillation']);
    assertDeepEqual(rows.map((r) => r.pText), ['< 0.0001', '1.0000', '0.0324', '0.9676']);
    assertDeepEqual(rows.map((r) => r.flagged), [true, false, true, false]);
    assertDeepEqual(rows.map((r) => r.statusText), ['flagFail', 'flagPass', 'flagFail', 'flagPass']);
    assertDeepEqual(rows.map((r) => r.statusClass), [
      'run-chart__test-status--bad', 'run-chart__test-status--ok', 'run-chart__test-status--bad', 'run-chart__test-status--ok',
    ]);
    assertEqual(rows[0].name, 'test_clustering');
    assertEqual(rows[0].desc, 'testDesc_clustering');
  });

  test('deutsch mit Dezimalkomma; α 0,01 lässt Trends unangeschlagen', () => {
    const rows = testRowsOf(analyze(D), 0.01, T, 'de');
    assertDeepEqual(rows.map((r) => r.pText), ['< 0,0001', '1,0000', '0,0324', '0,9676']);
    assertDeepEqual(rows.map((r) => r.flagged), [true, false, false, false]);
  });
});

suite('run-chart: Presenter — Diagramm', () => {
  test('Konfiguration wie die Altform, ohne Farben und ohne colorBySide', () => {
    const a = analyze(D);
    assertDeepEqual(chartConfig(a, 'Durchmesser', T), {
      title: '', showTitle: false, showLegend: false, xLabel: 'xLabelSample', yLabel: 'Durchmesser',
      values: a.values, median: a.median,
    });
  });
});

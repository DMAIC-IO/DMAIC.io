/**
 * MSA Typ 6: Darstellung — Zahlformat je Sprache, Deutung, Fehler- und
 * Warntexte, Verletzungstabelle, Typ-1-Beschriftung und Diagrammkonfiguration.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import {
  fmt, resultOf, errorText, levelClass, violationsClass, meanOf, interpretationText, warningItems,
  violationRows, typ1Label, primaryChart, secondaryChart, driftChart,
} from '../../../js/modules/msa-typ6/viewmodel/present.js';
import { analyzeTyp6 } from '../../../js/modules/msa-typ6/domain/analyze.js';

/** Fake-Übersetzer: Schlüssel samt Werten. */
const t = (key, params) => (params ? `${key}|${JSON.stringify(params)}` : key);
const gt = (key) => key;
const P = { chartType: 'i-mr', limitsMode: 'from-study', baselineK: 15, mu0: null, sigma0: null, enabledRules: [1, 2, 3, 4, 5, 6], alpha: 0.05 };
const VALUES = Array.from({ length: 30 }, (_, i) => 10 + (((i * 7) % 11) - 5) * 0.01 + (i >= 25 ? 0.2 : 0));
const inputs = { values: VALUES, timestamps: null, subgroups: null };
const R = analyzeTyp6(P, inputs);

suite('MSA Typ 6 present — Zahlen und Klassen', () => {
  test('fmt im Zahlformat der Sprache, Strich für nicht endliche Werte', () => {
    assertEqual(fmt(0.4113, 4, 'de'), '0,4113');
    assertEqual(fmt(0.4113, 4, 'en'), '0.4113');
    assertEqual(fmt(NaN, 3, 'de'), '—');
    assertEqual(fmt(null, 3, 'de'), '—');
  });
  test('resultOf blendet Ablehnung und Fehler aus', () => {
    assertEqual(resultOf(null), null);
    assertEqual(resultOf({ invalid: { code: 'E_NO_VALUES', params: null } }), null);
    assertEqual(resultOf({ error: 'x' }), null);
    assertEqual(resultOf(R), R);
  });
  test('Ampelklassen wie die Altform', () => {
    assertEqual(levelClass('stable'), 'dmike-kpi--good');
    assertEqual(levelClass('marginal'), 'dmike-kpi--warn');
    assertEqual(levelClass('unstable'), 'dmike-kpi--bad');
    assertEqual(violationsClass(0), 'dmike-kpi--good');
    assertEqual(violationsClass(2), 'dmike-kpi--warn');
    assertEqual(violationsClass(3), 'dmike-kpi--bad');
  });
  test('meanOf über endliche Werte', () => {
    assertEqual(meanOf([1, null, 3, NaN]), 2);
    assertTrue(Number.isNaN(meanOf([])), 'leer');
  });
});

suite('MSA Typ 6 present — Texte', () => {
  test('Fehlertext mit den Werten der Engine, sonst leer', () => {
    assertEqual(errorText({ invalid: { code: 'E_TOO_FEW_POINTS', params: { min: 10 } } }, t), 'errors.E_TOO_FEW_POINTS|{"min":10}');
    assertEqual(errorText({ invalid: { code: 'E_GIVEN_LIMITS_INVALID', params: null } }, t), 'errors.E_GIVEN_LIMITS_INVALID');
    assertEqual(errorText(R, t), '');
    assertEqual(errorText(null, t), '');
  });
  test('Warnungen setzen ihre Werte ein (k der Basis)', () => {
    const w = warningItems(R, t);
    const lt20 = w.find((x) => x.code === 'W_BASELINE_LT_20');
    assertEqual(lt20.text, 'warnings.W_BASELINE_LT_20|{"k":15}');
  });
  test('Deutung: Schlüssel ohne Modulpräfix, p und Steigung im Zahlformat', () => {
    const de = interpretationText(R, t, 'de');
    assertTrue(de.startsWith(`interpretation.${R.verdict.level}.${R.verdict.driver}|`), de);
    assertTrue(de.includes(`"driftP":"${fmt(R.verdict.driftP, 4, 'de')}"`), de);
    assertTrue(de.includes(`"slope":"${fmt(R.drift.slope, 4, 'de')}"`), de);
    assertTrue(de.includes(`"nelsonCount":${R.verdict.nelsonCount}`), de);
  });
  test('Verletzungstabelle: Zeit roh, Wert mit 3 Stellen, Regeln und Kurztexte', () => {
    const rows = violationRows(R, gt, 'de');
    assertEqual(rows.length, R.ruleViolations.length);
    assertTrue(rows.length > 0, 'Verletzungen');
    const v = R.ruleViolations[0];
    assertDeepEqual(rows[0], {
      index: v.primaryIndex,
      time: String(v.time),
      value: fmt(v.value, 3, 'de'),
      rules: v.ruleIds.join(', '),
      description: v.ruleIds.map((id) => `common.nelson.${id}.short`).join('; '),
    });
  });
  test('Typ-1-Beschriftung „Name (μ=…, σ=…)“ je Sprache', () => {
    assertEqual(typ1Label({ name: 'Normal', mean: 10.000267, stdDev: 0.0020331 }, 'de'), 'Normal (μ=10,000, σ=0,002)');
    assertEqual(typ1Label({ name: 'Normal', mean: 10.000267, stdDev: 0.0020331 }, 'en'), 'Normal (μ=10.000, σ=0.002)');
  });
});

suite('MSA Typ 6 present — Diagramme', () => {
  test('Lagekarte: Grenzen als Liste, Zonen, Verletzungen sortiert und eindeutig', () => {
    const c = primaryChart(R);
    assertDeepEqual(c.cl, [R.primary.cl]);
    assertDeepEqual(c.sigma, [R.primary.sigma]);
    assertEqual(c.showZones, true);
    assertDeepEqual(c.violationIndices, [...new Set(R.ruleViolations.map((v) => v.primaryIndex))].sort((a, b) => a - b));
    assertEqual(c.labels[0], '1');
    assertEqual(c.values.length, 30);
    assertEqual(primaryChart(null), null);
  });
  test('Streuungskarte ohne Zonen, MR beginnt mit Lücke', () => {
    const c = secondaryChart(R);
    assertEqual(c.showZones, false);
    assertDeepEqual(c.violationIndices, []);
    assertEqual(c.values[0], null);
    assertDeepEqual(c.sigma, [0]);
  });
  test('Driftgrafik: Punkte über der Nummer, Gerade aus zwei Endpunkten', () => {
    const c = driftChart(R, inputs, t);
    assertEqual(c.showLegend, true);
    assertEqual(c.xLabel, 'drift.xLabel');
    assertDeepEqual(c.series[0].x.slice(0, 3), [1, 2, 3]);
    assertDeepEqual(c.series[1].x, [1, 30]);
    assertEqual(c.series[1].y[0], R.drift.intercept + R.drift.slope);
    assertEqual(c.series[1].markerSize, 0);
    assertEqual(c.series[1].connectLine.show, true);
  });
  test('Driftgrafik: Zeitstempel als Achse, unlesbare fallen heraus', () => {
    const ts = VALUES.map((_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`);
    ts[3] = 'kaputt';
    const c = driftChart(R, { ...inputs, timestamps: ts }, t);
    assertEqual(c.series[0].x.length, 29);
    assertEqual(c.series[0].y.length, 29);
    assertEqual(c.series[0].x[0], Date.parse('2026-01-01'));
  });
});

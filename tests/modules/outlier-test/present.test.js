/**
 * Ausreißertest: die Anzeige (viewmodel/present.js). Stellenzahl wie in der
 * Altform, Dezimalkomma im Deutschen, Chips, ESD-Schritte, Hinweise,
 * Fehlerkarten, Übersicht, Tabelle, Diagrammwahl und Diagramm.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { ALL_METHODS, analyze } from '../../../js/modules/outlier-test/domain/analyze.js';
import {
  methodCards, summaryKpis, flaggedTable, chartSegs, chartConfig, num,
} from '../../../js/modules/outlier-test/viewmodel/present.js';

const UI = {};
async function translator(lang) {
  if (!UI[lang]) {
    const res = await fetch(new URL(`../../../js/modules/outlier-test/resources/i18n/ui.${lang}.json`, import.meta.url));
    UI[lang] = await res.json();
  }
  const dict = UI[lang];
  return (key, params) => {
    const v = key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), dict);
    if (typeof v !== 'string') return key;
    return v.replace(/\{(\w+)\}/g, (_, k) => (params && k in params ? String(params[k]) : `{${k}}`));
  };
}

/** Spalte „Durchmesser“ und Parameter der Altprojekt-Fixture. */
const LEGACY_VALUES = [10.02, 9.98, 10.01, 9.97, 10.03, 10, 9.99, 10.02, 10.01, 9.98, 10, 10.03, 9.97, 10.01, 9.99, 10.02, 10, 9.98, 10.01, 10.45];
const LEGACY_PARAMS = {
  alpha: 0.1, side: 'upper', tukeyFactor: 2, hampelK: 2.5, zThreshold: 2.5, modZThreshold: 3,
  esdMaxOutliers: 3, enabled: ['grubbs', 'generalized-esd', 'tukey-iqr', 'z-score'],
};
const DEFAULTS = {
  alpha: 0.05, side: 'two-sided', tukeyFactor: 1.5, hampelK: 3, zThreshold: 3,
  modZThreshold: 3.5, esdMaxOutliers: null, enabled: [...ALL_METHODS],
};
const plain = (v) => JSON.parse(JSON.stringify(v));
const values = (card) => Object.fromEntries(card.metrics.map((m) => [m.help.split('.').pop(), m.value]));

suite('outlier-test: Karten je Verfahren', () => {
  test('Altprojekt (en): Reihenfolge, Kennzahlen mit denselben Stellen wie die Altform', async () => {
    const t = await translator('en');
    const cards = methodCards(analyze(LEGACY_VALUES, LEGACY_PARAMS), t, 'en');
    assertDeepEqual(cards.map((c) => c.label), ["Grubbs' Test", 'Generalized ESD', 'Tukey IQR Rule', 'Z-Score']);
    assertDeepEqual(cards.map((c) => c.algoId), ['grubbs-test', 'generalized-esd', 'tukey-iqr', 'z-score-outlier']);
    const [g, esd, tukey, z] = cards;
    assertDeepEqual(values(g), { statistic: '4.1774', critical: '2.3853', pValue: '0.0000', mean: '10.0235', sd: '0.1021' });
    assertDeepEqual(g.metrics.map((m) => m.label), ['G', 'Gₜ', 'common.sym.p', 'common.sym.xbar', 's']);
    assertEqual(g.metrics[2].kpiClass, 'dmike-kpi--bad');
    assertEqual(g.verdictText, '1 flagged');
    assertEqual(g.verdictClass, 'outliertest__verdict--flag');
    assertDeepEqual(plain(g.chips), [{ text: '#20: 10.4500', stat: ' (4.177)', moreClass: '' }]);
    assertDeepEqual(values(esd), { detected: '1', maxOutliers: '3' });
    assertEqual(esd.stepsHeader, 'Rᵢ > λᵢ');
    assertDeepEqual(plain(esd.steps[0]), { i: '1', value: '10.4500', R: '4.1774', lambda: '2.5566', markIcon: 'status.error', rejectClass: 'outliertest__step--reject' });
    assertEqual(esd.steps[1].markIcon, 'status.ok');
    assertEqual(values(tukey).fenceUpper, '10.0850');
    assertEqual(values(tukey).fenceLower, '9.9225');
    assertEqual(values(z).threshold, '2.50');
    assertTrue(cards.every((c) => c.metrics.every((m) => m.help.startsWith('modules.outlier-test.types.MethodMetrics.'))), 'Hilfeanker');
  });

  test('Deutsch: Dezimalkomma', async () => {
    const t = await translator('de');
    const [g, , tukey, z] = methodCards(analyze(LEGACY_VALUES, LEGACY_PARAMS), t, 'de');
    assertEqual(values(g).statistic, '4,1774');
    assertEqual(values(tukey).fenceUpper, '10,0850');
    assertEqual(values(z).threshold, '2,50');
    assertEqual(g.chips[0].text, '#20: 10,4500');
  });

  test('Dixon Q: Seite übersetzt, Variante roh', async () => {
    const en = await translator('en');
    const de = await translator('de');
    const p = { ...LEGACY_PARAMS, enabled: ['dixon-q'] };
    const [d] = methodCards(analyze(LEGACY_VALUES, p), en, 'en');
    assertDeepEqual(d.metrics.map((m) => m.value).slice(2), ['r22', 'Upper outlier only']);
    assertEqual(d.metrics[3].valueClass, 'dmike-kpi-value--sm');
    assertEqual(methodCards(analyze(LEGACY_VALUES, p), de, 'de')[0].metrics[3].value, 'Nur oberer Ausreißer');
  });

  test('entartete Streuung: Hinweise und Fehlerkarten mit übersetztem Code', async () => {
    const t = await translator('en');
    const cards = methodCards(analyze([2, 2, 2, 2, 2], DEFAULTS), t, 'en');
    assertEqual(cards.length, 7);
    const by = Object.fromEntries(cards.map((c) => [c.label, c]));
    assertTrue(by["Grubbs' Test"].isError, 'Grubbs ohne Fehler');
    assertEqual(by["Grubbs' Test"].cardClass, 'outliertest__card--error');
    assertEqual(by["Grubbs' Test"].errorText, 'Method not applicable: All values are identical (zero variance).');
    assertEqual(by["Grubbs' Test"].algoId, 'grubbs-test');
    assertEqual(by['Hampel Identifier'].hint, t('hintDegenerateMad'));
    assertEqual(by['Z-Score'].hint, t('hintDegenerateSd'));
    assertEqual(by['Modified Z-Score'].hint, t('hintDegenerateMad'));
    assertEqual(by['Z-Score'].verdictText, 'No outliers');
    const small = methodCards(analyze([1, 2, 3], DEFAULTS), t, 'en');
    assertEqual(small.find((c) => c.label === 'Tukey IQR Rule').errorText, 'Method not applicable: At least 4 values are required.');
  });

  test('Chips: höchstens 12, dann „+n“', async () => {
    const t = await translator('en');
    const outliers = Array.from({ length: 15 }, (_, i) => ({ index: i, value: i + 0.5, statistic: 4 }));
    const analysis = { results: { 'z-score': { outliers, mean: 1, sd: 1, parameters: { threshold: 3 } } }, errs: {} };
    const [z] = methodCards(analysis, t, 'en');
    assertEqual(z.chips.length, 13);
    assertDeepEqual(plain(z.chips[0]), { text: '#1: 0.5000', stat: ' (4.000)', moreClass: '' });
    assertDeepEqual(plain(z.chips[12]), { text: '+3', stat: '', moreClass: 'outliertest__chip--more' });
  });

  test('num: „–“ für leer und nicht endlich', () => {
    assertEqual(num(null, 'en'), '–');
    assertEqual(num(NaN, 'en'), '–');
    assertEqual(num(1.5, 'de', 2), '1,50');
  });
});

suite('outlier-test: Übersicht, Tabelle, Diagrammwahl, Diagramm', () => {
  test('Übersicht: n, Spalte, markiert, gelaufene Verfahren', async () => {
    const t = await translator('en');
    const kpis = summaryKpis(LEGACY_VALUES, analyze(LEGACY_VALUES, LEGACY_PARAMS), 'Durchmesser', t);
    assertDeepEqual(kpis.map((k) => k.value), ['20', 'Durchmesser', '1', '4']);
    assertDeepEqual(kpis.map((k) => k.help), [
      'modules.outlier-test.types.Result.n', 'modules.outlier-test.fields.colRef.help',
      'modules.outlier-test.types.Result.flaggedIdxs', 'modules.outlier-test.types.Result.methods',
    ]);
    assertEqual(kpis[2].kpiClass, 'dmike-kpi--bad');
    // Fehlerhafte Verfahren zählen nicht als gelaufen.
    assertEqual(summaryKpis([1, 2, 3], analyze([1, 2, 3], DEFAULTS), 'x', t)[3].value, '5');
  });

  test('Tabelle: Spalten je Verfahren ohne Fehler, Zeilen je markiertem Punkt', async () => {
    const t = await translator('en');
    const vals = [9.9851, 9.9939, 9.9873, 9.9639, 10.0126, 9.9679, 9.9884, 10.26, 10.0564, 9.9412, 9.9441, 9.9916, 9.944, 10.0172, 10.0243, 9.9869, 9.9368, 10.0135, 10.0258, 9.745, 9.9608, 9.9777, 10.0122, 9.9719, 9.9492, 9.9677, 9.9304, 10.0193, 9.9976, 10.0654];
    const tab = flaggedTable(vals, analyze(vals, { ...DEFAULTS, enabled: ['grubbs', 'generalized-esd', 'tukey-iqr', 'modified-z'] }), t, 'en');
    assertTrue(tab.show, 'Tabelle verborgen');
    assertDeepEqual(tab.headers.map((h) => h.short), ['G', 'ESD', 'IQR', 'M-Z']);
    assertEqual(tab.headers[0].title, "Grubbs' Test");
    assertDeepEqual(tab.rows.map((r) => [r.idx, r.value, r.count]), [['8', '10.2600', '4'], ['20', '9.7450', '3']]);
    assertDeepEqual(tab.rows[1].cells.map((c) => c.flagged), [false, true, true, true]);
    assertEqual(tab.rows[1].cells[0].cls, 'outliertest__no-flag');
    assertEqual(flaggedTable([1, 2, 3, 4, 5], analyze([1, 2, 3, 4, 5], DEFAULTS), t, 'en').show, false);
  });

  test('Diagrammwahl: aktiv ist der wirksame Wert', async () => {
    const t = await translator('en');
    const segs = chartSegs(['all', 'grubbs', 'z-score'], 'grubbs', t);
    assertDeepEqual(segs.map((s) => [s.val, s.label, s.activeClass]), [
      ['all', 'Union of all methods', ''], ['grubbs', "Grubbs' Test", 'btn--active'], ['z-score', 'Z-Score', ''],
    ]);
  });

  test('Diagramm: Gruppen nach dem gezeigten Ziel, Legende nur mit Ausreißern', async () => {
    const t = await translator('en');
    const a = analyze(LEGACY_VALUES, LEGACY_PARAMS);
    const cfg = chartConfig(LEGACY_VALUES, a, 'grubbs', 'Durchmesser', t);
    assertEqual(cfg.title, "Durchmesser — outliers per Grubbs' Test");
    assertEqual(cfg.yLabel, 'Durchmesser');
    assertEqual(cfg.xLabel, '');
    assertEqual(cfg.showLegend, true);
    assertEqual(cfg.showMedian, true);
    assertDeepEqual(cfg.groups.map((g) => [g.name, g.values.length]), [['Regular values', 19], ["Outliers — Grubbs' Test", 1]]);
    assertDeepEqual(cfg.pointColors, ['var(--color-accent)', 'var(--color-error)']);
    const clean = chartConfig([1, 2, 3, 4, 5], analyze([1, 2, 3, 4, 5], DEFAULTS), 'all', 'x', t);
    assertEqual(clean.title, 'x — outliers per Union of all methods');
    assertEqual(clean.groups.length, 1);
    assertEqual(clean.showLegend, false);
    assertDeepEqual(clean.pointColors, ['var(--color-accent)']);
  });
});

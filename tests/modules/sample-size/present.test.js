/**
 * Stichprobenumfang: Darstellung (viewmodel/present.js) — Satz, Kennzahlen
 * und die Konfiguration der Power-Kurve in de und en.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { summaryStrong, summaryText, kpiOf, powerChartOf } from '../../../js/modules/sample-size/viewmodel/present.js';
import { analyze } from '../../../js/modules/sample-size/domain/calc.js';

const UI = {
  de: { requiredN: 'Erforderliches n', perGroup: 'je Gruppe', resultSummary: 'Mit n = {n} wird eine Power von {power} % bei α = {alpha} erreicht.',
    nOverflow: 'Überlauf', varianceRatio: 'Varianzverhältnis', cohensD: "Cohen's d", sectionCurve: 'Power-Kurve', power: 'Power', targetPower: 'Ziel-Power' },
  en: { requiredN: 'Required n', perGroup: 'per group', resultSummary: 'With n = {n}, a power of {power}% is achieved at α = {alpha}.',
    nOverflow: 'Overflow', varianceRatio: 'Variance Ratio', cohensD: "Cohen's d", sectionCurve: 'Power Curve', power: 'Power', targetPower: 'Target Power' },
};
/** @param {'de'|'en'} lang */
const T = (lang) => (k, p) => (UI[lang][k] ?? k).replace(/\{(\w+)\}/g, (_, n) => String(p?.[n]));

const EMPTY = { varianceOne: { sigma0: null, sigmaAlt: null }, varianceTwo: { ratio: null }, mean: { delta: null, sigma: null } };
const MEAN_TWO = analyze({ category: 'mean', testType: 'two', direction: 'two-sided', alpha: 0.05, power: 0.8, effect: { ...EMPTY, mean: { delta: 0.5, sigma: 0.8 } } });
const VAR_ONE = analyze({ category: 'variance', testType: 'one', direction: 'two-sided', alpha: 0.05, power: 0.8, effect: { ...EMPTY, varianceOne: { sigma0: 2, sigmaAlt: 4 } } });
const OVER = analyze({ category: 'mean', testType: 'two', direction: 'less', alpha: 0.01, power: 0.9, effect: { ...EMPTY, mean: { delta: 0.5, sigma: 0.8 } } });

suite('sample-size: Darstellung', () => {
  test('Satz mit Dezimalkomma (de) bzw. -punkt (en)', () => {
    assertEqual(summaryStrong(MEAN_TWO, T('de'), 'de'), 'Erforderliches n (je Gruppe): 42');
    assertEqual(summaryText(MEAN_TWO, T('de'), 'de'), 'Mit n = 42 wird eine Power von 80 % bei α = 0,05 erreicht.');
    assertEqual(summaryText(MEAN_TWO, T('en'), 'en'), 'With n = 42, a power of 80% is achieved at α = 0.05.');
    assertEqual(summaryStrong(VAR_ONE, T('de'), 'de').startsWith('Erforderliches n: '), true);
  });

  test('Deckel: „> 5.000“, „> 10.000“ bzw. „> 5,000“, Hinweis statt Satz', () => {
    assertEqual(summaryStrong(OVER, T('de'), 'de'), 'Erforderliches n (je Gruppe): > 5.000');
    assertEqual(summaryText(OVER, T('de'), 'de'), 'Überlauf');
    const k = kpiOf(OVER, T('en'), 'en');
    assertEqual(k.n, '> 5,000');
    assertEqual(k.total, '> 10,000');
  });

  test('Kennzahlen: n, Power in %, α, Effekt mit 3 Stellen, Gesamt-n', () => {
    assertDeepEqual(kpiOf(MEAN_TWO, T('de'), 'de'), {
      n: '42', nLabel: 'Erforderliches n (je Gruppe)', power: '80%', alpha: '0,05', effect: '0,625', effectLabel: "Cohen's d", total: '84',
    });
    assertDeepEqual(kpiOf(VAR_ONE, T('en'), 'en').effect, '4.000');
    assertDeepEqual(kpiOf(VAR_ONE, T('en'), 'en').effectLabel, 'Variance Ratio');
  });

  test('Power-Kurve: Konfiguration wie die Altform', () => {
    const c = powerChartOf(MEAN_TWO, T('de'), 'de');
    assertEqual(c.title, 'Power-Kurve');
    assertEqual(c.xLabel, 'n (je Gruppe)');
    assertEqual(c.yLabel, 'Power (%)');
    assertDeepEqual([c.showLegend, c.xMin, c.yMin, c.yMax, c.xDec, c.yDec], [false, 0, 0, 100, 0, 0]);
    assertDeepEqual(c.moduleRefLines, [{ dir: 'h', value: 80, label: 'Ziel-Power: 80%', dash: 'dash', width: 1.5, color: 'var(--color-error)' }]);
    assertEqual(c.series.length, 2);
    assertEqual(c.series[0].name, 'Power');
    assertEqual(c.series[0].x.length, MEAN_TWO.curve.length);
    assertEqual(c.series[1].name, 'n = 42');
    assertDeepEqual([c.series[1].x, c.series[1].y, c.series[1].symbol], [[42], [80], 'diamond']);
    assertEqual(powerChartOf(VAR_ONE, T('en'), 'en').xLabel, 'n');
  });

  test('Power-Kurve am Deckel: ohne Lösungspunkt', () => {
    assertEqual(powerChartOf(OVER, T('de'), 'de').series.length, 1);
  });
});

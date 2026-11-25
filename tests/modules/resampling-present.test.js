/**
 * D.Mike — Resampling module: presenter (summary → display strings and chart configs).
 */

import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import { fmt, fmtP, fmtInterval, statisticKey } from '../../js/modules/resampling/domain/format.js';
import { resultView, bootChartConfig, permChartConfig } from '../../js/modules/resampling/viewmodel/present.js';
import histogramChart from '../../js/widgets/histogram-chart/schema.js';
import { checkValue } from '../../js/core/model.js';

const t = (k) => `[${k}]`;
const BINS = [{ x0: 0, x1: 1, count: 2 }, { x0: 1, x1: 2, count: 5 }];
const CI = { percentile: [1, 2], bca: [1.1, 2.2], bcaFallback: false };

function one(over = {}) {
  return {
    inputsHash: 'h', mode: 'one', statisticId: 'mean', contrast: 'difference', direction: 'two-sided',
    confidence: 0.95, B: 1000, seed: 42, labels: ['X'], n: [20],
    boot: { estimate: 1.5, se: 0.25, bias: -0.01, ci: CI, bins: BINS }, perm: null, k: null, ...over,
  };
}

function two(over = {}) {
  return one({
    mode: 'two', labels: ['A', 'B'], n: [15, 15],
    perm: { observed: 0.8, pValue: 0.0312, exact: false, permutations: 1000, bins: BINS }, ...over,
  });
}

function kSummary() {
  return one({
    mode: 'k', labels: ['A', 'B', 'C'], n: [15, 15, 15], boot: null,
    k: {
      estimate: 30.2, observed: 12.5, pValue: 0.00001, exact: false, permutations: 1000, bins: BINS,
      groups: [{ estimate: 29, ci: CI }, { estimate: 30, ci: CI }, { estimate: 31.5, ci: CI }],
      posthoc: [
        { i: 0, j: 1, contrast: -1, ci: CI, pRaw: 0.2, pHolm: 0.4, exact: false },
        { i: 0, j: 2, contrast: -2.5, ci: CI, pRaw: 0.001, pHolm: 0.003, exact: true },
        { i: 1, j: 2, contrast: -1.5, ci: CI, pRaw: 0.04, pHolm: 0.08, exact: false },
      ],
    },
  });
}

suite('resampling-present — formatting', () => {
  test('fmt, fmtP, fmtInterval', () => {
    assertEqual(fmt(1.23456, 'en'), '1.2346');
    assertEqual(fmt(2, 'en', 1), '2.0');
    assertEqual(fmt(null, 'en'), '–');
    assertEqual(fmt(NaN, 'en'), '–');
    assertEqual(fmt(Infinity, 'en'), '–');
    assertEqual(fmtP(0.03125, 'en'), '0.0313');
    assertEqual(fmtP(0.00001, 'en'), '< 0.0001');
    assertEqual(fmtP(null, 'en'), '–');
    assertEqual(fmtInterval([1, 2.5], 'en'), '[1.0000; 2.5000]');
    assertEqual(fmtInterval(null, 'en'), '–');
  });
  test('de: Dezimalkomma, Gruppierung, Grenzfall p', () => {
    assertEqual(fmt(1.23456, 'de'), '1,2346');
    assertEqual(fmt(1234.5, 'de', 1), '1.234,5');
    assertEqual(fmtP(0.03125, 'de'), '0,0313');
    assertEqual(fmtP(0.00001, 'de'), '< 0,0001');
    assertEqual(fmtInterval([1, 2.5], 'de'), '[1,0000; 2,5000]');
    assertEqual(fmt(null, 'de'), '–');
  });
  test('en: Wert >= 1000 wird gruppiert', () => {
    assertEqual(fmt(1234.5, 'en'), '1,234.5000');
  });
  test('resultView in de', () => {
    const v = resultView(two(), { ciMethod: 'bca', target: '', lang: 'de' });
    assertEqual(v.estimate, '1,5000');
    assertEqual(v.interval, '[1,1000; 2,2000]');
    assertEqual(v.test.pValue, '0,0312');
    assertEqual(resultView(kSummary(), { ciMethod: 'percentile', target: '', lang: 'de' }).test.pValue, '< 0,0001');
  });
  test('statisticKey', () => {
    assertEqual(statisticKey('mean'), 'statMean');
    assertEqual(statisticKey('trimmedMean'), 'statTrimmedMean');
    assertEqual(statisticKey('ppk'), 'statPpk');
  });
});

suite('resampling-present — resultView', () => {
  test('null summary → null', () => {
    assertEqual(resultView(null, { ciMethod: 'bca', target: '', lang: 'en' }), null);
  });
  test('one sample: estimate rows, chosen interval, decision against the target', () => {
    const v = resultView(one(), { ciMethod: 'bca', target: '', lang: 'en' });
    assertEqual(v.hasBoot, true);
    assertEqual(v.hasTest, false);
    assertEqual(v.estimate, '1.5000');
    assertEqual(v.se, '0.2500');
    assertEqual(v.bias, '-0.0100');
    assertEqual(v.interval, '[1.1000; 2.2000]');
    assertEqual(v.decisionKey, null);
    assertEqual(resultView(one(), { ciMethod: 'percentile', target: '', lang: 'en' }).interval, '[1.0000; 2.0000]');
    assertEqual(resultView(one(), { ciMethod: 'bca', target: '3', lang: 'en' }).decisionKey, 'decisionReject');
    assertEqual(resultView(one(), { ciMethod: 'bca', target: '1,5', lang: 'en' }).decisionKey, 'decisionRetain');
    assertEqual(resultView(one(), { ciMethod: 'bca', target: 'abc', lang: 'en' }).decisionKey, null);
  });
  test('BCa fallback flag only shows for the BCa method', () => {
    const s = one({ boot: { estimate: 1, se: 0, bias: 0, ci: { percentile: [1, 1], bca: [1, 1], bcaFallback: true }, bins: BINS } });
    assertEqual(resultView(s, { ciMethod: 'bca', target: '', lang: 'en' }).bcaFallback, true);
    assertEqual(resultView(s, { ciMethod: 'percentile', target: '', lang: 'en' }).bcaFallback, false);
  });
  test('two samples: permutation test block with α = 1 − confidence', () => {
    const v = resultView(two(), { ciMethod: 'bca', target: '', lang: 'en' });
    assertEqual(v.hasTest, true);
    assertEqual(v.test.observed, '0.8000');
    assertEqual(v.test.pValue, '0.0312');
    assertEqual(v.test.methodKey, 'monteCarlo');
    assertEqual(v.test.permutations, '1000');
    assertEqual('decisionKey' in v.test, false, 'the test block carries no decision (unused)');
    const exact = resultView(two({ perm: { observed: 1, pValue: 0.5, exact: true, permutations: 252, bins: BINS } }), { ciMethod: 'bca', target: '', lang: 'en' });
    assertEqual(exact.test.methodKey, 'exact');
  });
  test('the target only decides in mode one (one-sample decision)', () => {
    assertEqual(resultView(two(), { ciMethod: 'bca', target: '3', lang: 'en' }).decisionKey, null);
  });
  test('k samples: groups and Holm-adjusted pairs, no bootstrap block', () => {
    const v = resultView(kSummary(), { ciMethod: 'percentile', target: '5', lang: 'en' });
    assertEqual(v.isK, true);
    assertEqual(v.hasBoot, false);
    assertEqual(v.decisionKey, null);
    assertEqual(v.estimate, '30.2000');
    assertEqual(v.se, '–');
    assertEqual(v.test.pValue, '< 0.0001');
    assertEqual(v.groups.length, 3);
    assertDeepEqual(v.groups[2], { label: 'C', n: '15', estimate: '31.5000', interval: '[1.0000; 2.0000]' });
    assertEqual(v.posthoc.map((h) => h.pair).join('|'), 'A – B|A – C|B – C');
    assertDeepEqual(v.posthoc[1], {
      pair: 'A – C', contrast: '-2.5000', interval: '[1.0000; 2.0000]',
      pRaw: '0.0010', pHolm: '0.0030', methodKey: 'exact',
    });
  });
});

suite('resampling-present — chart configs', () => {
  test('bootstrap chart: bins, interval area, estimate line', () => {
    const cfg = bootChartConfig(one(), 'bca', t);
    assertDeepEqual(cfg.bins, BINS);
    assertTrue(cfg.bins[0] !== BINS[0], 'bins are copied');
    assertEqual(cfg.xLabel, '[chartBootX]');
    assertDeepEqual(cfg.moduleRefAreas, [{ dir: 'x', min: 1.1, max: 2.2, color: 'var(--color-accent-light)', label: '[ciLabel]' }]);
    assertDeepEqual(cfg.moduleRefLines, [{ dir: 'v', value: 1.5, color: 'var(--color-chart-2)', label: 'θ̂', showLabel: true }]);
    assertEqual(bootChartConfig(one(), 'percentile', t).moduleRefAreas[0].min, 1);
    assertEqual(bootChartConfig(kSummary(), 'bca', t), null);
    assertEqual(bootChartConfig(null, 'bca', t), null);
  });
  test('bootstrap chart title names the statistic and the compared samples', () => {
    const tp = (k, p = {}) => `[${k}${Object.entries(p).map(([n, v]) => ` ${n}=${v}`).join('')}]`;
    assertEqual(bootChartConfig(one(), 'bca', tp).title, '[chartBootTitleOne stat=[statMean] a=X]');
    assertEqual(bootChartConfig(two({ statisticId: 'median' }), 'bca', tp).title,
      '[chartBootTitleDiff stat=[statMedian] a=A b=B]');
    assertEqual(bootChartConfig(two({ contrast: 'ratio' }), 'bca', tp).title,
      '[chartBootTitleRatio stat=[statMean] a=A b=B]');
    assertEqual(bootChartConfig(two({ mode: 'paired' }), 'bca', tp).title,
      '[chartBootTitlePaired stat=[statMean] a=A b=B]');
  });
  test('permutation chart title names the statistic and how the data were reshuffled', () => {
    const tp = (k, p = {}) => `[${k}${Object.entries(p).map(([n, v]) => ` ${n}=${v}`).join('')}]`;
    assertEqual(permChartConfig(two({ statisticId: 'median' }), tp).title,
      '[chartPermTitleDiff stat=[statMedian] a=A b=B]');
    assertEqual(permChartConfig(two({ contrast: 'ratio' }), tp).title,
      '[chartPermTitleRatio stat=[statMean] a=A b=B]');
    assertEqual(permChartConfig(two({ mode: 'paired' }), tp).title,
      '[chartPermTitlePaired stat=[statMean] a=A b=B]');
    assertEqual(permChartConfig(kSummary(), tp).title, '[chartPermTitleK groups=A, B, C]');
  });
  test('permutation chart: T, and −T when two-sided', () => {
    const cfg = permChartConfig(two(), t);
    assertDeepEqual(cfg.bins, BINS);
    assertEqual(cfg.xLabel, '[chartPermX]');
    assertEqual(cfg.moduleRefLines.map((l) => l.value).join(','), '0.8,-0.8');
    assertEqual(permChartConfig(two({ direction: 'greater' }), t).moduleRefLines.length, 1);
    assertEqual(permChartConfig(kSummary(), t).moduleRefLines.map((l) => l.value).join(','), '12.5');
    assertEqual(permChartConfig(one(), t), null);
  });
  test('non-finite estimate / observed drops the reference line, empty bins drop the chart', () => {
    const withBoot = (b) => one({ boot: { ...one().boot, ...b } });
    assertDeepEqual(bootChartConfig(withBoot({ estimate: Infinity }), 'bca', t).moduleRefLines, []);
    assertDeepEqual(bootChartConfig(withBoot({ estimate: null }), 'bca', t).moduleRefLines, []);
    assertEqual(bootChartConfig(withBoot({ bins: [] }), 'bca', t), null);
    const withPerm = (p) => two({ perm: { ...two().perm, ...p } });
    assertDeepEqual(permChartConfig(withPerm({ observed: NaN }), t).moduleRefLines, []);
    assertDeepEqual(permChartConfig(withPerm({ observed: null }), t).moduleRefLines, []);
    assertEqual(permChartConfig(withPerm({ bins: [] }), t), null);
  });
});

suite('Diagramm-Konfiguration passt zum Widget', () => {
  test('Bootstrap- und Permutationsdiagramm bestehen die Prüfung', () => {
    const tt = (k) => k;
    const boot = bootChartConfig(two(), 'bca', tt);
    const perm = permChartConfig(two(), tt);
    checkValue(histogramChart.props.config, 'config', JSON.parse(JSON.stringify(boot)));
    checkValue(histogramChart.props.config, 'config', JSON.parse(JSON.stringify(perm)));
    assertEqual(boot.moduleRefLines[0].dir, 'v');
    assertEqual(perm.moduleRefLines[0].dir, 'v');
  });
});

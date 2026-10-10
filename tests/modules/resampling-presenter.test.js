/**
 * D.Mike — Resampling module: presenter (summary → display strings and chart configs).
 */

import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import {
  fmt, fmtP, fmtInterval, statisticKey, resultView, bootChartConfig, permChartConfig,
} from '../../js/modules/resampling/resampling-presenter.js';

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

suite('resampling-presenter — formatting', () => {
  test('fmt, fmtP, fmtInterval', () => {
    assertEqual(fmt(1.23456), '1.2346');
    assertEqual(fmt(2, 1), '2.0');
    assertEqual(fmt(null), '–');
    assertEqual(fmt(NaN), '–');
    assertEqual(fmt(Infinity), '–');
    assertEqual(fmtP(0.03125), '0.0313');
    assertEqual(fmtP(0.00001), '< 0.0001');
    assertEqual(fmtP(null), '–');
    assertEqual(fmtInterval([1, 2.5]), '[1.0000; 2.5000]');
    assertEqual(fmtInterval(null), '–');
  });
  test('statisticKey', () => {
    assertEqual(statisticKey('mean'), 'statMean');
    assertEqual(statisticKey('trimmedMean'), 'statTrimmedMean');
    assertEqual(statisticKey('ppk'), 'statPpk');
  });
});

suite('resampling-presenter — resultView', () => {
  test('null summary → null', () => {
    assertEqual(resultView(null, { ciMethod: 'bca', target: '' }), null);
  });
  test('one sample: estimate rows, chosen interval, decision against the target', () => {
    const v = resultView(one(), { ciMethod: 'bca', target: '' });
    assertEqual(v.hasBoot, true);
    assertEqual(v.hasTest, false);
    assertEqual(v.estimate, '1.5000');
    assertEqual(v.se, '0.2500');
    assertEqual(v.bias, '-0.0100');
    assertEqual(v.interval, '[1.1000; 2.2000]');
    assertEqual(v.decisionKey, null);
    assertEqual(resultView(one(), { ciMethod: 'percentile', target: '' }).interval, '[1.0000; 2.0000]');
    assertEqual(resultView(one(), { ciMethod: 'bca', target: '3' }).decisionKey, 'decisionReject');
    assertEqual(resultView(one(), { ciMethod: 'bca', target: '1,5' }).decisionKey, 'decisionRetain');
    assertEqual(resultView(one(), { ciMethod: 'bca', target: 'abc' }).decisionKey, null);
  });
  test('BCa fallback flag only shows for the BCa method', () => {
    const s = one({ boot: { estimate: 1, se: 0, bias: 0, ci: { percentile: [1, 1], bca: [1, 1], bcaFallback: true }, bins: BINS } });
    assertEqual(resultView(s, { ciMethod: 'bca', target: '' }).bcaFallback, true);
    assertEqual(resultView(s, { ciMethod: 'percentile', target: '' }).bcaFallback, false);
  });
  test('two samples: permutation test block with α = 1 − confidence', () => {
    const v = resultView(two(), { ciMethod: 'bca', target: '' });
    assertEqual(v.hasTest, true);
    assertEqual(v.test.observed, '0.8000');
    assertEqual(v.test.pValue, '0.0312');
    assertEqual(v.test.methodKey, 'monteCarlo');
    assertEqual(v.test.permutations, '1000');
    assertEqual(v.test.decisionKey, 'decisionReject');
    const retain = resultView(two({ confidence: 0.99 }), { ciMethod: 'bca', target: '' });
    assertEqual(retain.test.decisionKey, 'decisionRetain');
    const exact = resultView(two({ perm: { observed: 1, pValue: 0.5, exact: true, permutations: 252, bins: BINS } }), { ciMethod: 'bca', target: '' });
    assertEqual(exact.test.methodKey, 'exact');
  });
  test('the target only decides in mode one (spec: one-sample decision)', () => {
    assertEqual(resultView(two(), { ciMethod: 'bca', target: '3' }).decisionKey, null);
  });
  test('k samples: groups and Holm-adjusted pairs, no bootstrap block', () => {
    const v = resultView(kSummary(), { ciMethod: 'percentile', target: '5' });
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

suite('resampling-presenter — chart configs', () => {
  test('bootstrap chart: bins, interval area, estimate line', () => {
    const cfg = bootChartConfig(one(), 'bca', t);
    assertDeepEqual(cfg.bins, BINS);
    assertTrue(cfg.bins[0] !== BINS[0], 'bins are copied');
    assertEqual(cfg.xLabel, '[chartBootX]');
    assertDeepEqual(cfg.refAreas, [{ dir: 'x', min: 1.1, max: 2.2, color: 'var(--color-accent-light)', label: '[ciLabel]' }]);
    assertDeepEqual(cfg.refLines, [{ value: 1.5, color: 'var(--color-chart-2)', label: 'θ̂', showLabel: true }]);
    assertEqual(bootChartConfig(one(), 'percentile', t).refAreas[0].min, 1);
    assertEqual(bootChartConfig(kSummary(), 'bca', t), null);
    assertEqual(bootChartConfig(null, 'bca', t), null);
  });
  test('permutation chart: T, and −T when two-sided', () => {
    const cfg = permChartConfig(two(), t);
    assertDeepEqual(cfg.bins, BINS);
    assertEqual(cfg.xLabel, '[chartPermX]');
    assertEqual(cfg.refLines.map((l) => l.value).join(','), '0.8,-0.8');
    assertEqual(permChartConfig(two({ direction: 'greater' }), t).refLines.length, 1);
    assertEqual(permChartConfig(kSummary(), t).refLines.map((l) => l.value).join(','), '12.5');
    assertEqual(permChartConfig(one(), t), null);
  });
});

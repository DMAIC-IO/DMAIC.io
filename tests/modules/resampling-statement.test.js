/**
 * D.Mike — Resampling module: plain-language key statement (summary → sentence parts).
 */

import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { statementParts, renderStatement } from '../../js/modules/resampling/resampling-statement.js';

const CI = { percentile: [-3.69, 2.15], bca: [-3.5, 2.3], bcaFallback: false };
const OPTS = { ciMethod: 'percentile', target: '' };

function base(over = {}) {
  return {
    inputsHash: 'h', mode: 'one', statisticId: 'median', contrast: 'difference', direction: 'two-sided',
    confidence: 0.95, B: 10000, seed: 42, labels: ['X'], n: [15],
    boot: { estimate: 22.5, se: 0.5, bias: 0, ci: { percentile: [21, 24], bca: [21, 24], bcaFallback: false }, bins: [] },
    perm: null, k: null, ...over,
  };
}

function two(over = {}, perm = {}) {
  return base({
    mode: 'two', labels: ['Fahrer_A', 'Fahrer_B'], n: [15, 15],
    boot: { estimate: -0.113, se: 1.4, bias: 0, ci: CI, bins: [] },
    perm: { observed: -0.113, pValue: 0.7767, exact: false, permutations: 10000, bins: [], ...perm },
    ...over,
  });
}

const keys = (parts) => parts.map((p) => p.key);

suite('resampling-statement — two samples', () => {
  test('not significant, two-sided: verdict, size of the difference and interval', () => {
    const parts = statementParts(two(), OPTS);
    assertDeepEqual(parts, [
      { key: 'stmtTwoNot', params: { a: 'Fahrer_A', b: 'Fahrer_B', stat: 'stmtStatMedian', p: 'p = 0.7767', alpha: '0.05' } },
      { key: 'stmtDiffBelow', params: { a: 'Fahrer_A', b: 'Fahrer_B', diff: '0.1130' } },
      { key: 'stmtIntervalDiff', params: { lo: '-3.6900', hi: '2.1500', conf: '95' } },
    ]);
  });

  test('significant, two-sided, positive difference', () => {
    const s = two({ boot: { estimate: 4.2, se: 1, bias: 0, ci: { percentile: [2, 6], bca: [2, 6], bcaFallback: false }, bins: [] } },
      { pValue: 0.003 });
    assertDeepEqual(keys(statementParts(s, OPTS)), ['stmtTwoSig', 'stmtDiffAbove', 'stmtIntervalDiff']);
    assertEqual(statementParts(s, OPTS)[1].params.diff, '4.2000');
  });

  test('one-sided directions pick their own verdict keys', () => {
    assertEqual(statementParts(two({ direction: 'greater' }, { pValue: 0.01 }), OPTS)[0].key, 'stmtTwoSigGreater');
    assertEqual(statementParts(two({ direction: 'greater' }), OPTS)[0].key, 'stmtTwoNotGreater');
    assertEqual(statementParts(two({ direction: 'less' }, { pValue: 0.01 }), OPTS)[0].key, 'stmtTwoSigLess');
    assertEqual(statementParts(two({ direction: 'less' }), OPTS)[0].key, 'stmtTwoNotLess');
  });

  test('alpha follows the confidence level', () => {
    const parts = statementParts(two({ confidence: 0.9 }, { pValue: 0.07 }), OPTS);
    assertEqual(parts[0].key, 'stmtTwoSig');
    assertEqual(parts[0].params.alpha, '0.1');
    assertEqual(parts[2].params.conf, '90');
  });

  test('tiny p-values read "p < 0.0001"', () => {
    assertEqual(statementParts(two({}, { pValue: 0.00001 }), OPTS)[0].params.p, 'p < 0.0001');
  });

  test('zero difference reads as level', () => {
    const s = two({ boot: { estimate: 0, se: 1, bias: 0, ci: CI, bins: [] } });
    assertEqual(statementParts(s, OPTS)[1].key, 'stmtDiffEqual');
  });

  test('ratio contrast states a factor', () => {
    const s = two({ contrast: 'ratio', boot: { estimate: 1.2, se: 0.1, bias: 0, ci: { percentile: [1.05, 1.4], bca: [1, 1.5], bcaFallback: false }, bins: [] } });
    const parts = statementParts(s, OPTS);
    assertDeepEqual(parts.slice(1), [
      { key: 'stmtRatio', params: { a: 'Fahrer_A', b: 'Fahrer_B', ratio: '1.2000' } },
      { key: 'stmtIntervalRatio', params: { lo: '1.0500', hi: '1.4000', conf: '95' } },
    ]);
  });

  test('the chosen interval method is used', () => {
    const parts = statementParts(two(), { ciMethod: 'bca', target: '' });
    assertEqual(parts[2].params.lo, '-3.5000');
  });

  test('missing p-value or interval drops that part', () => {
    assertDeepEqual(keys(statementParts(two({}, { pValue: NaN }), OPTS)), ['stmtDiffBelow', 'stmtIntervalDiff']);
    const noCi = two({ boot: { estimate: -0.113, se: 1, bias: 0, ci: { percentile: null, bca: null, bcaFallback: true }, bins: [] } });
    assertDeepEqual(keys(statementParts(noCi, OPTS)), ['stmtTwoNot', 'stmtDiffBelow']);
  });
});

suite('resampling-statement — paired', () => {
  test('verdict on the paired differences, then estimate and interval', () => {
    const s = two({ mode: 'paired', labels: ['Vorher', 'Nachher'] }, { pValue: 0.02 });
    assertDeepEqual(statementParts(s, OPTS), [
      { key: 'stmtPairedSig', params: { a: 'Vorher', b: 'Nachher', stat: 'stmtStatMedian', p: 'p = 0.0200', alpha: '0.05' } },
      { key: 'stmtPairedEstimate', params: { a: 'Vorher', b: 'Nachher', est: '-0.1130' } },
      { key: 'stmtIntervalDiff', params: { lo: '-3.6900', hi: '2.1500', conf: '95' } },
    ]);
  });

  test('one-sided and not significant', () => {
    assertEqual(statementParts(two({ mode: 'paired', direction: 'greater' }), OPTS)[0].key, 'stmtPairedNotGreater');
    assertEqual(statementParts(two({ mode: 'paired', direction: 'less' }, { pValue: 0.001 }), OPTS)[0].key, 'stmtPairedSigLess');
  });
});

suite('resampling-statement — one sample', () => {
  test('without target: estimate and interval only', () => {
    assertDeepEqual(statementParts(base(), OPTS), [
      { key: 'stmtOneEstimate', params: { a: 'X', stat: 'stmtStatMedian', est: '22.5000', lo: '21.0000', hi: '24.0000', conf: '95' } },
    ]);
  });

  test('target outside the interval is a significant deviation', () => {
    const parts = statementParts(base(), { ciMethod: 'percentile', target: '20' });
    assertDeepEqual(parts[1], { key: 'stmtOneReject', params: { target: '20' } });
  });

  test('target inside the interval is retained', () => {
    const parts = statementParts(base(), { ciMethod: 'percentile', target: '22' });
    assertDeepEqual(parts[1], { key: 'stmtOneRetain', params: { target: '22' } });
  });
});

function kSummary(pValue, pHolms) {
  return base({
    mode: 'k', labels: ['A', 'B', 'C'], n: [15, 15, 15], boot: null,
    k: {
      estimate: 30.2, observed: 12.5, pValue, exact: false, permutations: 1000, bins: [],
      groups: [],
      posthoc: [
        { i: 0, j: 1, contrast: -1, ci: CI, pRaw: 0.2, pHolm: pHolms[0], exact: false },
        { i: 0, j: 2, contrast: -2.5, ci: CI, pRaw: 0.001, pHolm: pHolms[1], exact: true },
        { i: 1, j: 2, contrast: -1.5, ci: CI, pRaw: 0.04, pHolm: pHolms[2], exact: false },
      ],
    },
  });
}

suite('resampling-statement — k samples', () => {
  test('significant overall with Holm-significant pairs and their differences', () => {
    assertDeepEqual(statementParts(kSummary(0.001, [0.4, 0.003, 0.04]), OPTS), [
      { key: 'stmtKSig', params: { groups: 'A, B, C', stat: 'stmtStatMedian', p: 'p = 0.0010', alpha: '0.05' } },
      { key: 'stmtKPairs', params: { pairs: 'A – C (-2.5000), B – C (-1.5000)' } },
    ]);
  });

  test('significant overall but no single Holm-significant pair', () => {
    assertDeepEqual(keys(statementParts(kSummary(0.03, [0.4, 0.06, 0.08]), OPTS)), ['stmtKSig', 'stmtKNoPair']);
  });

  test('not significant overall: no pair sentence', () => {
    assertDeepEqual(keys(statementParts(kSummary(0.3, [0.4, 0.5, 0.6]), OPTS)), ['stmtKNot']);
  });
});

suite('resampling-statement — rendering', () => {
  test('null summary yields no parts', () => {
    assertDeepEqual(statementParts(null, OPTS), []);
  });

  test('renderStatement translates each part and the statistic name', () => {
    const dict = { stmtA: '{a}: {stat}.', stmtB: 'Wert {x}.', stmtStatMedian: 'median' };
    const t = (k, params) => dict[k].replace(/\{(\w+)\}/g, (_, n) => params[n]);
    const parts = [{ key: 'stmtA', params: { a: 'X', stat: 'stmtStatMedian' } }, { key: 'stmtB', params: { x: '1' } }];
    assertEqual(renderStatement(parts, t), 'X: median. Wert 1.');
  });
});

/**
 * D.Mike — Resampling module analysis layer: inputs, validation, jobs, hash,
 * persisted summary. Pure — runs in node.
 */

import { suite, test, assertEqual, assertTrue, assertDeepEqual, assertAlmostEqual } from '../test-utils.js';
import { State } from '../../js/modules/resampling/resampling-model.js';
import {
  parseOptionalNumber, readInputs, validateInputs, errorKeyForCode, statParamsFor,
  buildJobs, computeInputsHash, summarize, pickCI, decision,
} from '../../js/modules/resampling/resampling-analysis.js';
import { runJobSync, validateJob } from '../../js/engines/resampling-engine.js';

const ref = (columnId) => ({ instanceId: 'ws', sheetId: 's1', columnId });
const COLUMNS = {
  a: [9.98, 10.02, 10.05, 9.95, 10.01, 9.99, 10.03, 10.07, 9.96, 10.0, 10.04, 9.97],
  b: [10.1, 10.04, 10.12, 10.08, 10.15, 10.06, 10.11, 10.09, 10.13, 10.07, 10.1, 10.05],
  c: [10.2, 10.18, 10.25, 10.22, 10.19, 10.24, 10.21, 10.23, 10.2, 10.26, 10.22, 10.17],
};
const getValues = (r) => COLUMNS[r.columnId] || null;

function stateFor(mode, patch = {}) {
  const s = new State();
  s.mode = mode;
  s.B = 1000;
  s.colRef1 = ref('a');
  s.colRef2 = ref('b');
  s.colRefsK = [ref('a'), ref('b'), ref('c')];
  return Object.assign(s, patch);
}

suite('resampling-analysis — parseOptionalNumber', () => {
  test('empty → null, comma decimal, garbage → NaN', () => {
    assertEqual(parseOptionalNumber(''), null);
    assertEqual(parseOptionalNumber('   '), null);
    assertEqual(parseOptionalNumber(null), null);
    assertEqual(parseOptionalNumber(undefined), null);
    assertEqual(parseOptionalNumber('9,7'), 9.7);
    assertEqual(parseOptionalNumber(' 10.3 '), 10.3);
    assertEqual(parseOptionalNumber(4), 4);
    assertTrue(Number.isNaN(parseOptionalNumber('abc')));
    assertTrue(Number.isNaN(parseOptionalNumber(Infinity)));
  });
});

// Review Focus 1: empty / whitespace / non-numeric cells and incomplete pairs.
suite('resampling-analysis — readInputs ignores what is not a number', () => {
  const dirty = { d: [1, '', '  ', 'abc', null, undefined, '2.5', 3, Infinity, NaN, '4'] };
  const get = (r) => dirty[r.columnId] || null;
  test('one: only finite numbers survive, numeric strings are parsed', () => {
    const s = stateFor('one', { colRef1: ref('d') });
    assertEqual(readInputs(s, get).x.join(','), '1,2.5,3,4');
  });
  test('paired: rows with one side missing are dropped, lengths may differ', () => {
    const cols = { x: [1, 2, '', 4, 5, 6], y: [1.5, 'n/a', 3, 4.5, '  '] };
    const s = stateFor('paired', { colRef1: ref('x'), colRef2: ref('y') });
    const inputs = readInputs(s, (r) => cols[r.columnId]);
    assertEqual(inputs.x.join(','), '1,4');
    assertEqual(inputs.y.join(','), '1.5,4.5');
  });
  test('missing reference or vanished column → empty sample, no throw', () => {
    const s = stateFor('two', { colRef2: null });
    const inputs = readInputs(s, (r) => (r.columnId === 'a' ? COLUMNS.a : null));
    assertEqual(inputs.y.length, 0);
    assertEqual(validateInputs(s, inputs), 'errMinValues');
  });
  test('k: one array per reference', () => {
    const inputs = readInputs(stateFor('k'), getValues);
    assertEqual(inputs.groups.length, 3);
    assertEqual(inputs.groups[2].length, 12);
  });
  test('no NaN reaches a job', () => {
    const s = stateFor('one', { colRef1: ref('d') });
    const [{ job }] = buildJobs(s, readInputs(s, get));
    assertTrue(job.data.x.every(Number.isFinite));
    validateJob(job);
  });
});

suite('resampling-analysis — validateInputs', () => {
  const check = (mode, patch, key, cols = getValues) => {
    const s = stateFor(mode, patch);
    assertEqual(validateInputs(s, readInputs(s, cols)), key, JSON.stringify(patch));
  };
  test('valid inputs → null in every mode', () => {
    for (const mode of ['one', 'two', 'paired', 'k']) check(mode, {}, null);
  });
  test('statistic and its parameters', () => {
    check('paired', { statisticId: 'stddev' }, 'errStatisticMode');
    check('k', { statisticId: 'ppk' }, 'errStatisticMode');
    check('one', { statisticId: 'trimmedMean', statParams: { trim: 0.5, p: 0.95, lsl: '', usl: '' } }, 'errTrim');
    check('one', { statisticId: 'trimmedMean', statParams: { trim: '', p: 0.95, lsl: '', usl: '' } }, 'errTrim');
    check('one', { statisticId: 'quantile', statParams: { trim: 0.1, p: 1, lsl: '', usl: '' } }, 'errQuantileP');
    check('one', { statisticId: 'ppk', statParams: { trim: 0.1, p: 0.95, lsl: '', usl: '' } }, 'errLimitsMissing');
    check('one', { statisticId: 'ppk', statParams: { trim: 0.1, p: 0.95, lsl: 'x', usl: '10.3' } }, 'errLimitsMissing');
    check('one', { statisticId: 'ppk', statParams: { trim: 0.1, p: 0.95, lsl: '10,3', usl: '9.7' } }, 'errLimitsOrder');
    check('one', { statisticId: 'ppk', statParams: { trim: 0.1, p: 0.95, lsl: '', usl: '10,3' } }, null);
  });
  test('confidence, B, seed, target', () => {
    check('one', { confidence: 1 }, 'errConfidence');
    check('one', { confidence: '' }, 'errConfidence');
    check('one', { B: 999 }, 'errB');
    check('one', { B: 100001 }, 'errB');
    check('one', { B: 1500.5 }, 'errB');
    check('one', { seed: -1 }, 'errSeed');
    check('one', { seed: 2147483648 }, 'errSeed');
    check('one', { target: 'ten' }, 'errTarget');
    check('one', { target: '10,0' }, null);
    check('two', { target: 'ten' }, null);
  });
  test('data requirements', () => {
    check('k', { colRefsK: [ref('a'), ref('b')] }, 'errMinGroups');
    check('one', {}, 'errMinValues', () => [1]);
    check('one', { statisticId: 'ppk', statParams: { trim: 0.1, p: 0.95, lsl: '9', usl: '11' } },
      'errMinPpk', () => [10, 10.1, 9.9, 10.2, 9.8, 10, 10.1, 9.9, 10]);
    check('two', { contrast: 'ratio' }, 'errRatioPositive', (r) => (r.columnId === 'a' ? [1, -2, 3] : COLUMNS.b));
    check('two', { contrast: 'ratio' }, null);
  });
  test('engine codes map to i18n keys', () => {
    assertEqual(errorKeyForCode('insufficient-data'), 'errMinValues');
    assertEqual(errorKeyForCode('invalid-limits'), 'errLimitsOrder');
    assertEqual(errorKeyForCode('non-positive-ratio'), 'errRatioPositive');
    assertEqual(errorKeyForCode('invalid-statistic-for-mode'), 'errStatisticMode');
    assertEqual(errorKeyForCode('invalid-options'), 'errOptions');
    assertEqual(errorKeyForCode('degenerate-statistic'), 'errDegenerateStatistic');
    assertEqual(errorKeyForCode('boom'), 'errUnexpected');
  });
});

suite('resampling-analysis — jobs', () => {
  test('statParamsFor parses text inputs', () => {
    assertDeepEqual(statParamsFor(stateFor('one', { statisticId: 'ppk', statParams: { trim: 0.1, p: 0.95, lsl: '9,7', usl: '' } })),
      { lsl: 9.7, usl: null });
    assertDeepEqual(statParamsFor(stateFor('one', { statisticId: 'trimmedMean' })), { trim: 0.1 });
    assertDeepEqual(statParamsFor(stateFor('one', { statisticId: 'quantile' })), { p: 0.95 });
    assertDeepEqual(statParamsFor(stateFor('one')), {});
  });
  test('kinds and options per mode; every job passes engine validation', () => {
    const kinds = (mode, patch) => {
      const s = stateFor(mode, patch);
      const jobs = buildJobs(s, readInputs(s, getValues));
      jobs.forEach(({ job }) => validateJob(job));
      return jobs.map((j) => `${j.role}:${j.job.kind}`).join(',');
    };
    assertEqual(kinds('one'), 'boot:bootstrapOne');
    assertEqual(kinds('two'), 'boot:bootstrapTwo,perm:permutationTwo');
    assertEqual(kinds('paired'), 'boot:bootstrapPaired,perm:permutationPaired');
    assertEqual(kinds('k'), 'k:permutationK');
    const s = stateFor('two', { contrast: 'ratio', direction: 'greater', seed: 9 });
    const [boot, perm] = buildJobs(s, readInputs(s, getValues));
    assertEqual(boot.job.options.contrast, 'ratio');
    assertEqual(perm.job.options.direction, 'greater');
    assertEqual(perm.job.options.seed, 9);
    assertEqual(perm.job.options.B, 1000);
  });
});

suite('resampling-analysis — inputs hash', () => {
  const hash = (mode, patch = {}, cols = getValues) => {
    const s = stateFor(mode, patch);
    return computeInputsHash(s, readInputs(s, cols));
  };
  test('8 hex characters, stable', () => {
    assertTrue(/^[0-9a-f]{8}$/.test(hash('one')));
    assertEqual(hash('one'), hash('one'));
  });
  test('changes with data, statistic, B, seed, confidence, parameters', () => {
    const base = hash('one');
    assertTrue(hash('one', {}, (r) => COLUMNS[r.columnId].map((v) => v + 1)) !== base);
    assertTrue(hash('one', { statisticId: 'median' }) !== base);
    assertTrue(hash('one', { B: 2000 }) !== base);
    assertTrue(hash('one', { seed: 43 }) !== base);
    assertTrue(hash('one', { confidence: 0.9 }) !== base);
    assertTrue(hash('one', { statisticId: 'quantile' }) !== hash('one', { statisticId: 'quantile', statParams: { trim: 0.1, p: 0.9, lsl: '', usl: '' } }));
  });
  test('ignores target, ciMethod, and options the mode does not use', () => {
    const base = hash('one');
    assertEqual(hash('one', { target: '10' }), base);
    assertEqual(hash('one', { ciMethod: 'percentile' }), base);
    assertEqual(hash('one', { contrast: 'ratio', direction: 'less' }), base);
    assertEqual(hash('paired', { contrast: 'ratio' }), hash('paired'));
    assertTrue(hash('paired', { direction: 'less' }) !== hash('paired'));
    assertTrue(hash('two', { contrast: 'ratio' }) !== hash('two'));
  });
});

suite('resampling-analysis — summary', () => {
  function run(mode, patch) {
    const s = stateFor(mode, patch);
    const inputs = readInputs(s, getValues);
    const outcomes = buildJobs(s, inputs).map(({ role, job }) => ({ role, result: runJobSync(job) }));
    const h = computeInputsHash(s, inputs);
    return { s, outcomes, summary: summarize(s, inputs, outcomes, h, ['A', 'B', 'C'].slice(0, mode === 'k' ? 3 : 2)) };
  }
  test('two: boot + perm, bins, plain JSON', () => {
    const { s, outcomes, summary } = run('two');
    assertEqual(summary.mode, 'two');
    assertEqual(summary.inputsHash, computeInputsHash(s, readInputs(s, getValues)));
    assertEqual(summary.n.join(','), '12,12');
    assertAlmostEqual(summary.boot.estimate, outcomes[0].result.estimate, 0);
    assertEqual(summary.boot.bins.reduce((t, b) => t + b.count, 0), 1000);
    assertEqual(summary.perm.exact, false);
    assertEqual(summary.perm.bins.reduce((t, b) => t + b.count, 0), 1000);
    assertEqual(summary.k, null);
    assertDeepEqual(JSON.parse(JSON.stringify(summary)), summary);
    assertTrue(!('replicates' in summary.boot));
  });
  test('one: no permutation part', () => {
    const { summary } = run('one');
    assertEqual(summary.perm, null);
    assertEqual(summary.n.join(','), '12');
    assertTrue(Array.isArray(summary.boot.ci.bca));
  });
  test('k: groups and post-hoc table', () => {
    const { summary } = run('k');
    assertEqual(summary.boot, null);
    assertEqual(summary.k.groups.length, 3);
    assertEqual(summary.k.posthoc.length, 3);
    assertTrue(summary.k.posthoc.every((h) => h.pHolm >= h.pRaw));
    assertEqual(summary.labels.join(','), 'A,B,C');
    assertDeepEqual(JSON.parse(JSON.stringify(summary)), summary);
  });
  test('pickCI and decision', () => {
    const ci = { percentile: [1, 2], bca: [1.1, 2.1], bcaFallback: false };
    assertEqual(pickCI(ci, 'percentile').join(','), '1,2');
    assertEqual(pickCI(ci, 'bca').join(','), '1.1,2.1');
    assertEqual(pickCI(null, 'bca'), null);
    assertEqual(decision([1, 2], 3), 'reject');
    assertEqual(decision([1, 2], 1.5), 'retain');
    assertEqual(decision([1, 2], null), null);
    assertEqual(decision(null, 1), null);
  });
});

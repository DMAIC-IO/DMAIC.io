/**
 * D.Mike — Resampling engine, fixture tier `stochastic`: a full seeded run of
 * ours (B = 10 000, seed 42) against R's reference run (B = 200 000).
 * Deterministic quantities must agree exactly; Monte-Carlo quantities within
 * four Monte-Carlo standard deviations measured in R (50 runs at B = 10 000).
 * Fixture: tests/fixtures/resampling/generate-stochastic.R.
 */

import { suite, test, assertAlmostEqual, assertEqual, assertTrue } from '../test-utils.js';
import { runJobSync } from '../../js/engines/resampling-engine.js';

async function loadFixture(path) {
  const resp = await fetch(new URL(path, import.meta.url));
  return resp.json();
}

const fixture = await loadFixture('../fixtures/resampling/stochastic.json');
const B = 10000;
const SEED = 42;
const K = 4;
const EXACT = { absolute: 1e-12, relative: 1e-12 };

function within(actual, expected, tol, label) {
  assertTrue(Number.isFinite(actual), `${label}: not finite (${actual})`);
  const diff = Math.abs(actual - expected);
  assertTrue(diff <= tol, `${label}: |${actual} − ${expected}| = ${diff} > ${tol}`);
}

function bootstrapJob(c) {
  return {
    kind: c.kind === 'one' ? 'bootstrapOne' : 'bootstrapTwo',
    data: c.kind === 'one' ? { x: c.data } : { x: c.x, y: c.y },
    statistic: c.statistic,
    options: { B, seed: SEED, confidence: c.confidence },
  };
}

suite('resampling — stochastic tier vs. R', () => {
  test('fixture carries the three cases of tier stochastic', () => {
    assertEqual(fixture.cases.map((c) => c.id).join(','), 'bolzen-mean-one,pizza-median-two,pizza-mean-perm');
    for (const c of fixture.cases) assertEqual(c.tier, 'stochastic');
  });

  for (const c of fixture.cases.filter((cs) => cs.kind === 'one' || cs.kind === 'two')) {
    test(`${c.id}: estimate exact, SE and interval bounds within ${K} Monte-Carlo SD`, () => {
      const r = runJobSync(bootstrapJob(c));
      assertAlmostEqual(r.estimate, c.reference.estimate, EXACT);
      const tol = (sd) => K * sd + c.resolution;
      within(r.se, c.reference.se, tol(c.mcSd.se), 'se');
      for (const method of ['percentile', 'bca']) {
        for (const k of [0, 1]) {
          within(r.ci[method][k], c.reference[method][k], tol(c.mcSd[method][k]), `${method}[${k}]`);
        }
      }
      assertEqual(r.ci.bcaFallback, false);
    });
  }

  for (const c of fixture.cases.filter((cs) => cs.kind === 'permutationTwo')) {
    test(`${c.id}: observed T exact, Monte-Carlo p within ${K} binomial SD`, () => {
      const r = runJobSync({
        kind: 'permutationTwo',
        data: { x: c.x, y: c.y },
        statistic: c.statistic,
        options: { B, seed: SEED, confidence: 0.95, contrast: c.contrast, direction: c.direction },
      });
      assertEqual(r.test.exact, false);
      assertEqual(r.test.permutations, B);
      assertAlmostEqual(r.test.observed, c.reference.observed, EXACT);
      const p = c.reference.pValue;
      within(r.test.pValue, p, K * Math.sqrt(p * (1 - p) / B) + 1 / (B + 1), 'pValue');
    });
  }
});

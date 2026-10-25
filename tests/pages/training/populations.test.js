/**
 * Populations: theory values, sampling, summaries, binning.
 */
import { suite, test, assertEqual, assertClose, assertTrue } from '../../test-utils.js';
import { mulberry32 } from '../../../js/engines/random-variates-engine.js';
import {
  POPULATIONS, drawSampleMean, meanSd, mergeSummary, standardError, binValues,
} from '../../../js/pages/training/populations.js';

suite('populations', () => {
  test('theory values', () => {
    assertClose(POPULATIONS.normal.mu, 50, 1e-12);
    assertClose(POPULATIONS.normal.sigma, 10, 1e-12);
    assertClose(POPULATIONS.uniform.mu, 50, 1e-12);
    assertClose(POPULATIONS.uniform.sigma, 60 / Math.sqrt(12), 1e-12);
    assertClose(POPULATIONS.uniform.sigma, 17.3205080756888, 1e-12);
    assertClose(POPULATIONS.skewed.mu, 35, 1e-12);
    assertClose(POPULATIONS.skewed.sigma, 15, 1e-12);
    assertClose(POPULATIONS.bimodal.mu, 52.5, 1e-12);
    assertClose(POPULATIONS.bimodal.sigma, Math.sqrt(36 + 17.5 * 17.5), 1e-12);
    assertClose(POPULATIONS.bimodal.sigma, 18.5, 1e-12);
    assertEqual(POPULATIONS.skewed.range[1], 130);
  });

  for (const name of ['normal', 'uniform', 'skewed', 'bimodal']) {
    test(`draws match theory: ${name}`, () => {
      const pop = POPULATIONS[name];
      const rng = mulberry32(42);
      const values = [];
      for (let i = 0; i < 200000; i++) values.push(pop.draw(rng));
      const { mean, sd } = meanSd(values);
      assertTrue(Math.abs(mean - pop.mu) < 0.15, `${name} mean ${mean}`);
      assertTrue(Math.abs(sd - pop.sigma) < 0.15, `${name} sd ${sd}`);
    });
  }

  test('sample means narrow like sigma/sqrt(n)', () => {
    const rng = mulberry32(7);
    const means = [];
    for (let i = 0; i < 20000; i++) means.push(drawSampleMean(POPULATIONS.skewed, 30, rng));
    const { sd } = meanSd(means);
    const expected = 15 / Math.sqrt(30);
    assertClose(expected, 2.7386, 1e-3);
    assertTrue(Math.abs(sd - expected) / expected < 0.03, `sd of means ${sd}`);
    assertClose(standardError(POPULATIONS.skewed, 30), expected, 1e-12);
  });

  test('meanSd uses n-1 and is NaN below two values', () => {
    const r = meanSd([2, 4, 6]);
    assertClose(r.mean, 4, 1e-12);
    assertClose(r.sd, 2, 1e-12);
    assertTrue(Number.isNaN(meanSd([1]).sd));
    assertTrue(Number.isNaN(meanSd([]).sd));
  });

  test('mergeSummary equals summary of the union', () => {
    const all = Array.from({ length: 20 }, (_, i) => i + 1);
    const a = meanSd(all.slice(0, 7));
    const b = meanSd(all.slice(7));
    const merged = mergeSummary({ ...a, count: 7 }, { ...b, count: 13 });
    const whole = meanSd(all);
    assertClose(merged.mean, whole.mean, 1e-12);
    assertClose(merged.sd, whole.sd, 1e-12);
    assertEqual(merged.count, 20);
    const only = { mean: 3, sd: 1, count: 4 };
    assertEqual(mergeSummary(undefined, only).count, 4);
    assertClose(mergeSummary(undefined, only).mean, 3, 1e-12);
  });

  test('binValues clamps', () => {
    const bins = binValues([-5, 0, 50, 100, 105], [0, 100], 10);
    assertEqual(bins.length, 10);
    assertEqual(bins[0].count, 2);
    assertEqual(bins[9].count, 2);
    assertEqual(bins.reduce((s, b) => s + b.count, 0), 5);
    assertClose(bins[0].x1, 10, 1e-12);
  });

  test('binValues skips non-finite values', () => {
    const bins = binValues([NaN, Infinity, -Infinity, undefined, 50], [0, 100], 10);
    assertEqual(bins.reduce((s, b) => s + b.count, 0), 1);
    assertEqual(bins[5].count, 1);
  });

  test('seeded runs are reproducible', () => {
    const run = () => {
      const rng = mulberry32(1);
      return [drawSampleMean(POPULATIONS.bimodal, 5, rng), drawSampleMean(POPULATIONS.normal, 5, rng)];
    };
    const a = run();
    const b = run();
    assertEqual(a[0], b[0]);
    assertEqual(a[1], b[1]);
  });
});

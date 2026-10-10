#!/usr/bin/env node
/**
 * D.Mike — Resampling coverage study (outside the test suite).
 *
 * Simulates one-sample data sets from known distributions and reports how
 * often the nominal 95 % percentile and BCa intervals of
 * js/engines/resampling-engine.js contain the true parameter. Regenerate the
 * report whenever the engine changes (cwd app/dev; takes a few minutes):
 *
 *   node tools/resampling-coverage/coverage.mjs --reps 1000 --B 2000 --n 20 --seed 20261010 \
 *     > ../../docs/resampling-coverage.md
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runJobSync } from '../../js/engines/resampling-engine.js';
import { mulberry32 } from '../../js/engines/random-variates-engine.js';
import { normalQuantilePrecise } from '../../js/engines/normal-precise.js';

/** Distributions sampled by inverse transform, with their true parameters. */
export const DISTRIBUTIONS = {
  normal: {
    label: 'Normal(0, 1)',
    draw: (u) => normalQuantilePrecise(u),
    truth: { mean: 0, median: 0, stddev: 1 },
  },
  lognormal: {
    label: 'Lognormal(0, 1)',
    draw: (u) => Math.exp(normalQuantilePrecise(u)),
    truth: { mean: Math.exp(0.5), median: 1, stddev: Math.sqrt((Math.E - 1) * Math.E) },
  },
  exponential: {
    label: 'Exponential(1)',
    draw: (u) => -Math.log1p(-u),
    truth: { mean: 1, median: Math.LN2, stddev: 1 },
  },
};

/** Statistics whose coverage is reported. */
export const COVERAGE_STATISTICS = ['mean', 'median', 'stddev'];

const DEFAULTS = { reps: 1000, B: 2000, n: 20, seed: 20261010 };

/**
 * Parse `--reps`, `--B`, `--n`, `--seed` (positive integers).
 * @param {string[]} argv
 * @returns {{ reps: number, B: number, n: number, seed: number }}
 */
export function parseArgs(argv) {
  const opts = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 2) {
    const key = String(argv[i]).replace(/^--/, '');
    if (!Object.hasOwn(opts, key)) throw new Error(`unknown option ${argv[i]}`);
    const value = Number(argv[i + 1]);
    if (!Number.isInteger(value) || value < 1) throw new Error(`${argv[i]} needs a positive integer`);
    opts[key] = value;
  }
  return opts;
}

/** Uniform draw in the open interval (0, 1) — inverse transforms need u > 0. */
function drawUniform(rng) {
  let u = rng();
  while (u <= 0) u = rng();
  return u;
}

/**
 * Run the study. Every distribution × statistic pair sees the same data sets
 * (data PRNG seeded with `seed`); resample `rep` uses job seed `seed + rep + 1`.
 * @param {{ reps: number, B: number, n: number, seed: number, confidence?: number,
 *           distributions?: string[], statistics?: string[] }} opts
 * @returns {Array<{ distribution: string, statistic: string, reps: number,
 *                   percentile: number, bca: number, fallbacks: number, missing: number }>}
 */
export function runCoverage({
  reps, B, n, seed, confidence = 0.95,
  distributions = Object.keys(DISTRIBUTIONS), statistics = COVERAGE_STATISTICS,
}) {
  const rows = [];
  for (const distId of distributions) {
    const dist = DISTRIBUTIONS[distId];
    for (const statId of statistics) {
      const rng = mulberry32(seed);
      const truth = dist.truth[statId];
      const hits = { percentile: 0, bca: 0 };
      let fallbacks = 0;
      let missing = 0;
      for (let rep = 0; rep < reps; rep++) {
        const x = Array.from({ length: n }, () => dist.draw(drawUniform(rng)));
        const r = runJobSync({
          kind: 'bootstrapOne',
          data: { x },
          statistic: { id: statId },
          options: { B, seed: seed + rep + 1, confidence },
        });
        if (!r.ci.percentile) missing++;
        if (r.ci.bcaFallback) fallbacks++;
        for (const method of ['percentile', 'bca']) {
          const ci = r.ci[method];
          if (ci && ci[0] <= truth && truth <= ci[1]) hits[method]++;
        }
      }
      rows.push({
        distribution: distId, statistic: statId, reps,
        percentile: hits.percentile / reps, bca: hits.bca / reps, fallbacks, missing,
      });
    }
  }
  return rows;
}

/**
 * Markdown report for docs/resampling-coverage.md.
 * @param {ReturnType<typeof runCoverage>} rows
 * @param {{ reps: number, B: number, n: number, seed: number }} opts
 * @returns {string}
 */
export function toMarkdown(rows, opts) {
  const se = Math.sqrt(0.95 * 0.05 / opts.reps);
  const cmd = `node tools/resampling-coverage/coverage.mjs --reps ${opts.reps} --B ${opts.B} --n ${opts.n} --seed ${opts.seed}`;
  return [
    '# Resampling coverage study',
    '',
    'Empirical coverage of nominal 95 % one-sample bootstrap intervals from `app/dev/js/engines/resampling-engine.js`.',
    `Parameters: reps = ${opts.reps}, B = ${opts.B}, n = ${opts.n}, seed = ${opts.seed}.`,
    `Monte-Carlo standard error of a coverage near 0.95: ±${se.toFixed(4)}.`,
    '',
    `Regenerate (cwd \`app/dev\`): \`${cmd} > ../../docs/resampling-coverage.md\``,
    '',
    '| Distribution | Statistic | Percentile | BCa | BCa fallbacks | No interval |',
    '|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${DISTRIBUTIONS[r.distribution].label} | ${r.statistic} | ${r.percentile.toFixed(3)} | ${r.bca.toFixed(3)} | ${r.fallbacks} | ${r.missing} |`),
    '',
    'Bootstrap intervals for small n undercover, most for skewed distributions and for the',
    'standard deviation; BCa usually recovers part of the gap. This is expected behaviour of',
    'the methods (Efron & Tibshirani 1993, ch. 14), not an engine defect.',
    '',
    'Coverage values within about 2 Monte Carlo standard errors of the theoretical coverage are',
    'sampling noise; for the normal mean at n = 20 theory gives about 0.929.',
    '',
  ].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2));
  process.stdout.write(toMarkdown(runCoverage(opts), opts));
}

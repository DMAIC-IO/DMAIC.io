import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  parseArgs, runCoverage, toMarkdown, DISTRIBUTIONS, COVERAGE_STATISTICS,
} from './coverage.mjs';

test('parseArgs: defaults, overrides and errors', () => {
  assert.deepEqual(parseArgs([]), { reps: 1000, B: 2000, n: 20, seed: 20261010 });
  assert.deepEqual(parseArgs(['--reps', '5', '--B', '1000']), { reps: 5, B: 1000, n: 20, seed: 20261010 });
  assert.throws(() => parseArgs(['--foo', '1']), /unknown option/);
  assert.throws(() => parseArgs(['--reps', '0']), /positive integer/);
  assert.throws(() => parseArgs(['--n', '2.5']), /positive integer/);
});

test('runCoverage: one row per distribution × statistic, rates in [0, 1], deterministic', () => {
  const opts = { reps: 3, B: 1000, n: 12, seed: 7 };
  const rows = runCoverage(opts);
  assert.equal(rows.length, Object.keys(DISTRIBUTIONS).length * COVERAGE_STATISTICS.length);
  for (const r of rows) {
    assert.equal(r.reps, 3);
    assert.ok(r.percentile >= 0 && r.percentile <= 1, `percentile ${r.percentile}`);
    assert.ok(r.bca >= 0 && r.bca <= 1, `bca ${r.bca}`);
    assert.ok(Number.isInteger(r.fallbacks) && Number.isInteger(r.missing));
  }
  assert.deepEqual(runCoverage(opts), rows);
});

test('runCoverage: the normal mean covers close to the nominal 95 %', () => {
  const [row] = runCoverage({
    reps: 200, B: 1000, n: 30, seed: 11, distributions: ['normal'], statistics: ['mean'],
  });
  // 200 reps → Monte-Carlo SE ≈ 0.015; the bounds are ±4 SE around 0.935.
  assert.ok(row.percentile >= 0.875 && row.percentile <= 0.995, `percentile ${row.percentile}`);
  assert.ok(row.bca >= 0.875 && row.bca <= 0.995, `bca ${row.bca}`);
});

test('toMarkdown: header, parameters, one table line per row', () => {
  const opts = { reps: 3, B: 1000, n: 12, seed: 7 };
  const rows = runCoverage({ ...opts, distributions: ['exponential'], statistics: ['median'] });
  const md = toMarkdown(rows, opts);
  assert.match(md, /^# Resampling coverage study/);
  assert.match(md, /reps = 3, B = 1000, n = 12, seed = 7/);
  assert.match(md, /\| Exponential\(1\) \| median \| \d\.\d{3} \| \d\.\d{3} \| \d+ \| \d+ \|/);
  assert.match(md, /node tools\/resampling-coverage\/coverage\.mjs --reps 3 --B 1000 --n 12 --seed 7/);
});

/**
 * D.Mike — summary of a sharded browser test run (tools/test-browser/run.mjs).
 *
 * Pure, DOM-free: run.mjs collects one outcome per `runner.html?shard=k/n`
 * page, this module adds them up and decides the exit code. Kept apart so the
 * decision is testable without a browser (summary.test.mjs).
 */

/**
 * Number of `runner.html?shard=k/n` pages — the same split as the Playwright
 * unit-test bridge (see `selectShard` in tests/runner.html).
 */
export const SHARDS = 4;

/**
 * @typedef {object} ShardOutcome
 * @property {number} k  1-based shard index
 * @property {number} n  shard count
 * @property {{passed:number, failed:number, skipped:number, todo:number,
 *   suiteCount:number, failures:Array<{suite:string, tests:Array<{name:string, error?:string}>}>}|null} results
 *   `window.__testRunResults` of the page, null when the run did not finish
 * @property {string|null} error  why the shard did not finish (timeout, crash)
 * @property {string[]} pageErrors  uncaught page errors of that page
 */

/**
 * Adds up the shards. Every shard must finish, run at least one suite and
 * fail no test, and no page may throw an uncaught error — one bad shard makes
 * the whole run red.
 * @param {ShardOutcome[]} shards
 * @returns {{passed:number, failed:number, skipped:number, todo:number,
 *   suiteCount:number, failures:Array<{shard:string, suite:string, tests:Array<{name:string, error?:string}>}>,
 *   problems:string[], exitCode:0|1}}
 */
export function summarize(shards) {
  const total = { passed: 0, failed: 0, skipped: 0, todo: 0, suiteCount: 0 };
  const failures = [];
  const problems = [];
  if (shards.length === 0) problems.push('No shards ran.');
  for (const s of shards) {
    const label = `shard ${s.k}/${s.n}`;
    if (s.error || !s.results) {
      problems.push(`${label}: did not finish — ${s.error ?? 'no results'}`);
    } else {
      const r = s.results;
      for (const key of Object.keys(total)) total[key] += r[key] ?? 0;
      for (const f of r.failures ?? []) failures.push({ shard: label, ...f });
      if ((r.failed ?? 0) > 0) problems.push(`${label}: ${r.failed} failed`);
      // A shard that finds nothing means the loader broke, not that all is well.
      if (!(r.suiteCount > 0)) problems.push(`${label}: no suites ran — runner.html loaded nothing.`);
    }
    for (const msg of s.pageErrors ?? []) problems.push(`${label}: uncaught page error: ${msg}`);
  }
  // Guards the sum as well: finished shards that all report zero tests.
  if (total.passed + total.failed + total.skipped + total.todo === 0) {
    problems.push('No tests ran across all shards.');
  }
  return { ...total, failures, problems, exitCode: problems.length > 0 ? 1 : 0 };
}

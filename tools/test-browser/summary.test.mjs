import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHARDS, summarize } from './summary.mjs';

const ok = (k, over = {}) => ({
  k, n: SHARDS, error: null, pageErrors: [],
  results: { passed: 10, failed: 0, skipped: 1, todo: 2, suiteCount: 3, failures: [], ...over },
});

test('vier grüne Shards: Summe aller Zähler, Exit 0', () => {
  const s = summarize([1, 2, 3, 4].map((k) => ok(k)));
  assert.deepEqual(
    [s.passed, s.failed, s.skipped, s.todo, s.suiteCount, s.exitCode],
    [40, 0, 4, 8, 12, 0],
  );
  assert.deepEqual(s.problems, []);
});

test('ein fehlschlagender Test in einem Shard macht den Lauf rot und nennt den Shard', () => {
  const failures = [{ suite: 'S', tests: [{ name: 't', error: 'boom' }] }];
  const s = summarize([ok(1), ok(2, { failed: 1, failures }), ok(3), ok(4)]);
  assert.equal(s.exitCode, 1);
  assert.equal(s.failed, 1);
  assert.deepEqual(s.failures, [{ shard: 'shard 2/4', ...failures[0] }]);
});

test('ein nicht beendeter Shard (Timeout) macht den Lauf rot, die übrigen zählen weiter', () => {
  const s = summarize([ok(1), { k: 2, n: SHARDS, results: null, error: 'Timeout 180000ms exceeded.', pageErrors: [] }, ok(3), ok(4)]);
  assert.equal(s.exitCode, 1);
  assert.equal(s.passed, 30);
  assert.match(s.problems.join('\n'), /shard 2\/4: did not finish — Timeout/);
});

test('ein Shard ohne Suites macht den Lauf rot, auch wenn die anderen laufen', () => {
  const s = summarize([ok(1), ok(2), ok(3, { passed: 0, skipped: 0, todo: 0, suiteCount: 0 }), ok(4)]);
  assert.equal(s.exitCode, 1);
  assert.match(s.problems.join('\n'), /shard 3\/4: no suites ran/);
});

test('ohne einen einzigen Test über alle Shards ist der Lauf rot', () => {
  const empty = { passed: 0, failed: 0, skipped: 0, todo: 0, suiteCount: 1 };
  const s = summarize([1, 2, 3, 4].map((k) => ok(k, empty)));
  assert.equal(s.exitCode, 1);
  assert.match(s.problems.join('\n'), /No tests ran across all shards/);
});

test('kein Shard gelaufen ist rot', () => {
  assert.equal(summarize([]).exitCode, 1);
});

test('ein ungefangener Seitenfehler macht den Lauf rot und nennt den Shard', () => {
  const s = summarize([ok(1), ok(2), ok(3), { ...ok(4), pageErrors: ['x is not a function'] }]);
  assert.equal(s.exitCode, 1);
  assert.deepEqual(s.problems, ['shard 4/4: uncaught page error: x is not a function']);
});

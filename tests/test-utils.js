/**
 * D.Mike — Test Utilities & Assertion Library (test-utils.js)
 * Lightweight test framework for browser-based testing.
 * See docs/TESTING.md for the full specification.
 */

// ─── Registry ──────────────────────────────────────────────────

const _suites = [];
let _currentSuite = null;

/**
 * Define a test suite.
 * @param {string} name
 * @param {function} fn
 */
export function suite(name, fn) {
  const s = {
    name,
    tests: [],
    beforeEach: null,
    afterEach: null,
    beforeAll: null,
    afterAll: null,
  };
  _suites.push(s);
  _currentSuite = s;
  fn();
  _currentSuite = null;
}

/**
 * Define a test case.
 * @param {string} name
 * @param {function} fn
 */
export function test(name, fn) {
  _currentSuite?.tests.push({ name, fn, skip: false, todo: false });
}

test.skip = function(name, fn) {
  _currentSuite?.tests.push({ name, fn, skip: true, todo: false });
};

test.todo = function(name) {
  _currentSuite?.tests.push({ name, fn: null, skip: false, todo: true });
};

export function beforeEach(fn) { if (_currentSuite) _currentSuite.beforeEach = fn; }
export function afterEach(fn)  { if (_currentSuite) _currentSuite.afterEach = fn; }
export function beforeAll(fn)  { if (_currentSuite) _currentSuite.beforeAll = fn; }
export function afterAll(fn)   { if (_currentSuite) _currentSuite.afterAll = fn; }

// ─── Runner ────────────────────────────────────────────────────

/**
 * Run all registered test suites.
 * @returns {Promise<object>} results
 */
export async function runAll() {
  const results = { suites: [], passed: 0, failed: 0, skipped: 0, todo: 0 };
  for (const s of _suites) {
    const r = await runSuite(s);
    results.suites.push(r);
    results.passed  += r.passed;
    results.failed  += r.failed;
    results.skipped += r.skipped;
    results.todo    += r.todo;
  }
  return results;
}

/**
 * Run a single suite.
 * @param {object} suite
 * @returns {Promise<object>}
 */
export async function runSuite(suite) {
  const result = { name: suite.name, tests: [], passed: 0, failed: 0, skipped: 0, todo: 0 };
  try { await suite.beforeAll?.(); } catch { /* no-op: beforeAll hook errors must not abort the suite run */ }

  for (const t of suite.tests) {
    const tr = await runTest(t, suite);
    result.tests.push(tr);
    if (tr.status === 'passed')  result.passed++;
    if (tr.status === 'failed')  result.failed++;
    if (tr.status === 'skipped') result.skipped++;
    if (tr.status === 'todo')    result.todo++;
  }

  try { await suite.afterAll?.(); } catch { /* no-op: afterAll hook errors must not affect the suite result */ }
  return result;
}

/**
 * Run a single test.
 * @param {object} t
 * @param {object} suite
 * @returns {Promise<object>}
 */
export async function runTest(t, suite) {
  if (t.todo)  return { name: t.name, status: 'todo', error: null };
  if (t.skip)  return { name: t.name, status: 'skipped', error: null };

  try {
    await suite.beforeEach?.();
    await t.fn();
    await suite.afterEach?.();
    return { name: t.name, status: 'passed', error: null };
  } catch (err) {
    try { await suite.afterEach?.(); } catch { /* no-op: afterEach cleanup failure must not mask the original test error */ }
    return { name: t.name, status: 'failed', error: err.message ?? String(err) };
  }
}

// ─── Assertions ────────────────────────────────────────────────

const EPSILON = 1e-9;

function fail(message) {
  throw new Error(message);
}

/**
 * Assert a value is truthy.
 */
export function assert(condition, message) {
  if (!condition) {
    fail(message ?? `Expected truthy value, got ${JSON.stringify(condition)}`);
  }
}

/**
 * Assert approximate equality using a plain absolute epsilon.
 * Thin convenience wrapper around assertAlmostEqual for call sites that
 * don't need the relative-tolerance object form.
 */
export function assertClose(actual, expected, eps = EPSILON, message) {
  assertAlmostEqual(actual, expected, eps, message);
}

/**
 * Assert strict equality.
 */
export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(message ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/**
 * Assert deep equality (recursive check for objects and arrays).
 * Handles nested objects/arrays, primitives, and treats key order as irrelevant.
 * @param {*} actual
 * @param {*} expected
 * @param {string} [message]
 */
export function assertDeepEqual(actual, expected, message) {
  function isDeepEqual(a, e) {
    // Use Object.is for primitive comparison (handles NaN, -0, etc.)
    if (Object.is(a, e)) return true;

    // Both must be objects (not null, not primitives)
    if (typeof a !== 'object' || a === null || typeof e !== 'object' || e === null) {
      return false;
    }

    // Check if both are arrays
    const aIsArray = Array.isArray(a);
    const eIsArray = Array.isArray(e);
    if (aIsArray !== eIsArray) return false;

    // For arrays: check length and elements
    if (aIsArray) {
      if (a.length !== e.length) return false;
      return a.every((val, i) => isDeepEqual(val, e[i]));
    }

    // For objects: check keys (ignoring order) and values
    const aKeys = Object.keys(a).sort();
    const eKeys = Object.keys(e).sort();
    if (aKeys.length !== eKeys.length) return false;
    if (!aKeys.every((k, i) => k === eKeys[i])) return false;
    return aKeys.every(k => isDeepEqual(a[k], e[k]));
  }

  if (!isDeepEqual(actual, expected)) {
    fail(message ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/**
 * Assert that a condition is truthy.
 * @param {*} condition
 * @param {string} [message]
 */
export function assertTrue(condition, message) {
  if (!condition) {
    fail(message ?? `Expected truthy value, got ${JSON.stringify(condition)}`);
  }
}

/**
 * Assert approximate equality for floating-point numbers.
 *
 * Tolerance can be either a number (absolute only) or a {absolute, relative}
 * object (passes if either is satisfied). Fixture-driven validation uses the
 * object form so values spanning many orders of magnitude — Cgk near 1.0 vs
 * coefficients near 1e10 — share one tolerance config.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number|{absolute?: number, relative?: number}} [tolerance=1e-9]
 * @param {string} [message]
 */
export function assertAlmostEqual(actual, expected, tolerance = EPSILON, message) {
  // JSON has no Infinity/NaN literals — fixtures store them as string sentinels.
  if (expected === 'Infinity')  expected = Infinity;
  else if (expected === '-Infinity') expected = -Infinity;
  else if (expected === 'NaN')  expected = NaN;
  // Exact match shortcut — covers Infinity vs Infinity, where Math.abs(diff) is NaN.
  if (actual === expected) return;
  if (Number.isNaN(actual) && Number.isNaN(expected)) return;
  const absDiff = Math.abs(actual - expected);
  if (typeof tolerance === 'object' && tolerance !== null) {
    const absTol = tolerance.absolute ?? 0;
    const relTol = tolerance.relative ?? 0;
    if (absDiff <= absTol) return;
    const relDiff = expected !== 0 ? absDiff / Math.abs(expected) : absDiff;
    if (relDiff <= relTol) return;
    fail(message ?? `Expected ${expected} (abs±${absTol} or rel±${relTol}), got ${actual} — absDiff=${absDiff}, relDiff=${relDiff}`);
    return;
  }
  if (absDiff > tolerance) {
    fail(message ?? `Expected ${expected} ± ${tolerance}, got ${actual}`);
  }
}

/**
 * Assert two arrays are element-wise almost equal.
 */
export function assertArrayAlmostEqual(actual, expected, tolerance = EPSILON, message) {
  if (actual.length !== expected.length) {
    fail(message ?? `Array length mismatch: ${actual.length} vs ${expected.length}`);
  }
  actual.forEach((v, i) => assertAlmostEqual(v, expected[i], tolerance, message));
}

/**
 * Assert value is within a range [min, max].
 */
export function assertInRange(value, min, max, message) {
  if (value < min || value > max) {
    fail(message ?? `Expected ${value} to be in [${min}, ${max}]`);
  }
}

/**
 * Assert that a function throws an error.
 */
export function assertThrows(fn, messagePattern, message) {
  let threw = false;
  try { fn(); } catch (err) {
    threw = true;
    if (messagePattern && !messagePattern.test(err.message)) {
      fail(message ?? `Error message "${err.message}" did not match ${messagePattern}`);
    }
  }
  if (!threw) fail(message ?? 'Expected function to throw');
}

/**
 * Assert p-value is significant at alpha level.
 */
export function assertSignificance(pValue, alpha = 0.05, message) {
  if (pValue >= alpha) {
    fail(message ?? `Expected p-value ${pValue} < ${alpha}`);
  }
}

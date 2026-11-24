/**
 * D.Mike — Run Chart Engine Fixture Validation
 * Validates median + runs counts + four p-values from the runs tests.
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import { analyze, computeRunChart, runsAboutMedian, runsUpDown } from '../../js/engines/run-chart-engine.js';

async function loadFixture(path) {
  const resp = await fetch(new URL(path, import.meta.url));
  return resp.json();
}

function getTol(tc, tolerances) {
  const key = tc.tolerance_override;
  return key && tolerances.overrides?.[key]
    ? tolerances.overrides[key]
    : tolerances.default;
}

const data = await loadFixture('../fixtures/control-charts/run-chart.fixtures.json');

suite('Run Chart — median, runs counts, p-values (fixture validation)', () => {
  for (const tc of data.test_cases) {
    if (!tc.expected || Object.keys(tc.expected).length === 0) continue;

    test(`${tc.id}: ${tc.description}`, () => {
      const got = analyze(tc.inputs);
      const tol = getTol(tc, data.tolerances);

      for (const [key, val] of Object.entries(tc.expected)) {
        const actual = got[key];
        if (typeof val === 'number') {
          assertAlmostEqual(actual, val, tol,
            `${tc.id}: ${key} = ${actual}, expected ${val}`);
        } else {
          assertEqual(actual, val,
            `${tc.id}: ${key} = ${actual}, expected ${val}`);
        }
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────
// Runs-test math — median + runs counts (engine, reused)
// ─────────────────────────────────────────────────────────────

suite('Run Chart — median & runs counts', () => {
  test('median of even-length sample (interpolated)', () => {
    // E2E DATA_C1: [10,12,8,15,25,30,5,18,22,14] sorted → 14.5 mid of 14 & 15
    const r = computeRunChart([10, 12, 8, 15, 25, 30, 5, 18, 22, 14]);
    assertEqual(r.median, 14.5);
  });

  test('median of odd-length sample', () => {
    const r = computeRunChart([3, 1, 2]);
    assertEqual(r.median, 2);
  });

  test('runs about median: strict alternation gives N runs', () => {
    // values: below, above, below, above ... median = 5
    // [1, 9, 2, 8] median = (2+8)/2... sorted [1,2,8,9] → 5; signs: -,+,-,+ → 4 runs
    const med = 5;
    const ra = runsAboutMedian([1, 9, 2, 8], med);
    assertEqual(ra.runs, 4);
    assertEqual(ra.m1, 2);
    assertEqual(ra.m2, 2);
  });

  test('runs about median: ties to median count as below (Minitab)', () => {
    // median = 5; the two 5s join the run below
    const ra = runsAboutMedian([1, 5, 9, 5, 2], 5);
    // signs -,-,+,-,- → 3 runs, m1=1 (the 9), m2=4 (1, 5, 5, 2)
    assertEqual(ra.runs, 3);
    assertEqual(ra.m1, 1);
    assertEqual(ra.m2, 4);
  });

  test('runs up/down: strictly increasing series → 1 run', () => {
    const ru = runsUpDown([1, 2, 3, 4, 5]);
    assertEqual(ru.runs, 1);
  });

  test('runs up/down: perfect zig-zag → max runs', () => {
    // diffs: +,-,+,- → 4 runs
    const ru = runsUpDown([1, 5, 2, 6, 3]);
    assertEqual(ru.runs, 4);
  });

  test('runs up/down: ties skipped (no sign contributed)', () => {
    // [1,1,2] → diff(1,1)=tie skipped, diff(1,2)=+ → 1 sign → 1 run
    const ru = runsUpDown([1, 1, 2]);
    assertEqual(ru.runs, 1);
  });
});

// ─────────────────────────────────────────────────────────────
// Runs-test math — Minitab p-value outcomes
// ─────────────────────────────────────────────────────────────

suite('Run Chart — Minitab test p-values', () => {
  test('monotone increasing flags trends & clustering (low p), not mixtures/oscillation', () => {
    // [1..10] — a single up-run and all-below-then-all-above the median.
    const r = computeRunChart([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // Clustering: too few runs about median → small p
    assertEqual(r.pClustering < 0.05, true);
    // Trends: too few runs up/down → small p
    assertEqual(r.pTrends < 0.05, true);
    // Mixtures (too many runs about median) should NOT be flagged
    assertEqual(r.pMixtures < 0.05, false);
    // Oscillation (too many runs up/down) should NOT be flagged
    assertEqual(r.pOscillation < 0.05, false);
  });

  test('p-values are complementary: pClustering + pMixtures ≈ 1', () => {
    const r = computeRunChart([10, 12, 8, 15, 25, 30, 5, 18, 22, 14]);
    assertAlmostEqual(r.pClustering + r.pMixtures, 1, 1e-9);
    assertAlmostEqual(r.pTrends + r.pOscillation, 1, 1e-9);
  });

  test('hand-computed runs-about-median z for alternating data → p≈0.5', () => {
    // m1=m2=2, N=4 → expected = (2*2*2)/4 + 1 = 3; runs=4
    // variance = (2*4*(2*4-4))/(16*3) = (8*4)/48 = 32/48 = 0.6667; sd≈0.8165
    // z = (4-3)/0.8165 ≈ 1.2247 → pMixtures = 1-Φ(1.2247) ≈ 0.1103
    const ra = runsAboutMedian([1, 9, 2, 8], 5);
    assertAlmostEqual(ra.expected, 3, 1e-9);
    assertAlmostEqual(ra.variance, 2 / 3, 1e-9);
    assertAlmostEqual(ra.z, 1 / Math.sqrt(2 / 3), 1e-9);
  });
});

// ─────────────────────────────────────────────────────────────
// computeRunChart — top-level shape
// ─────────────────────────────────────────────────────────────

suite('Run Chart — computeRunChart result shape', () => {
  test('returns median, runs counts, four p-values and index partition', () => {
    const r = computeRunChart([10, 12, 8, 15, 25, 30, 5, 18, 22, 14]);
    assertEqual(typeof r.median, 'number');
    assertEqual(typeof r.runsAboutMedian, 'number');
    assertEqual(typeof r.runsUpDown, 'number');
    assertEqual(typeof r.pClustering, 'number');
    assertEqual(typeof r.pMixtures, 'number');
    assertEqual(typeof r.pTrends, 'number');
    assertEqual(typeof r.pOscillation, 'number');
    assertEqual(Array.isArray(r.indices.above), true);
    assertEqual(Array.isArray(r.indices.below), true);
    assertEqual(Array.isArray(r.indices.onMedian), true);
  });

  test('filters non-numeric input before computing', () => {
    const r = computeRunChart([1, NaN, 2, 'x', 3]);
    assertEqual(r.values.length, 3);
    assertEqual(r.median, 2);
  });
});

/**
 * D.Mike — Control Chart Engine Fixture Validation
 * Validates I-MR, X̄-R, X̄-S control limits, Nelson Rules, and Cp/Cpk.
 */

import { suite, test, assertAlmostEqual, assertEqual, assertDeepEqual } from '../test-utils.js';
import {
  computeIMR,
  computeXbarR,
  computeXbarS,
  evaluateNelsonRules,
  computeCapability,
  capabilitySigma,
} from '../../js/engines/control-chart-engine.js';

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

function getSubchartValue(result, path) {
  const [sub, prop] = path.split('.');
  const v = result?.subcharts?.[sub]?.[prop];
  // Multi-stage results are per-point arrays; collapse to first stage's value
  // so the same fixture shape works for both single- and multi-stage cases.
  return Array.isArray(v) ? v[0] : v;
}

const data = await loadFixture('../fixtures/control-charts/control-chart.fixtures.json');

suite('Control Charts — I-MR / X̄-R / X̄-S (fixture validation)', () => {
  for (const tc of data.test_cases) {
    if (!tc.expected || Object.keys(tc.expected).length === 0) continue;

    const mode = tc.inputs.mode;
    if (mode !== 'i-mr' && mode !== 'xbar-r' && mode !== 'xbar-s') continue;

    test(`${tc.id}: ${tc.description}`, () => {
      let result;
      if (mode === 'i-mr') {
        result = computeIMR(tc.inputs.values, 1, tc.inputs.baselineEnd, tc.inputs.stages, tc.inputs.excludedIndices);
      } else if (mode === 'xbar-r') {
        result = computeXbarR(tc.inputs.values, tc.inputs.n, tc.inputs.baselineEnd, tc.inputs.stages, tc.inputs.excludedIndices);
      } else {
        result = computeXbarS(tc.inputs.values, tc.inputs.n, tc.inputs.baselineEnd, tc.inputs.stages, tc.inputs.excludedIndices);
      }
      const tol = getTol(tc, data.tolerances);

      for (const [key, val] of Object.entries(tc.expected)) {
        const actual = getSubchartValue(result, key);
        if (typeof val === 'number') {
          assertAlmostEqual(actual, val, tol,
            `${tc.id}: ${key} = ${actual}, expected ${val}`);
        }
      }
    });
  }
});

suite('Control Charts — Nelson Rules (fixture validation)', () => {
  for (const tc of data.test_cases) {
    if (!tc.expected || tc.inputs.mode !== 'nelson') continue;

    test(`${tc.id}: ${tc.description}`, () => {
      const violations = evaluateNelsonRules(
        tc.inputs.values,
        tc.inputs.cl,
        tc.inputs.sigma,
        tc.inputs.enabledRules,
      );

      if ('violationCount' in tc.expected) {
        assertEqual(violations.length, tc.expected.violationCount,
          `${tc.id}: violationCount = ${violations.length}, expected ${tc.expected.violationCount}`);
      }
      if ('rulesTriggered' in tc.expected) {
        const triggered = [...new Set(violations.map(v => v.ruleId))].sort((a, b) => a - b);
        const expected = tc.expected.rulesTriggered;
        assertEqual(triggered.length, expected.length,
          `${tc.id}: rulesTriggered count = ${triggered.length}, expected ${expected.length}`);
        for (let i = 0; i < expected.length; i++) {
          assertEqual(triggered[i], expected[i],
            `${tc.id}: rulesTriggered[${i}] = ${triggered[i]}, expected ${expected[i]}`);
        }
      }
      if ('violationIndices' in tc.expected) {
        const indices = [...new Set(violations.map(v => v.index))].sort((a, b) => a - b);
        const expected = tc.expected.violationIndices;
        assertEqual(indices.length, expected.length,
          `${tc.id}: violationIndices count = ${indices.length}, expected ${expected.length}`);
        for (let i = 0; i < expected.length; i++) {
          assertEqual(indices[i], expected[i],
            `${tc.id}: violationIndices[${i}] = ${indices[i]}, expected ${expected[i]}`);
        }
      }
    });
  }
});

suite('Control Charts — Cp/Cpk (fixture validation)', () => {
  for (const tc of data.test_cases) {
    if (!tc.expected || tc.inputs.mode !== 'capability') continue;

    test(`${tc.id}: ${tc.description}`, () => {
      const result = computeCapability(
        null,
        tc.inputs.cl,
        tc.inputs.sigma,
        tc.inputs.usl,
        tc.inputs.lsl,
      );
      const tol = getTol(tc, data.tolerances);

      for (const [key, val] of Object.entries(tc.expected)) {
        if (typeof val === 'number') {
          assertAlmostEqual(result[key], val, tol,
            `${tc.id}: ${key} = ${result[key]}, expected ${val}`);
        }
      }
    });
  }
});

// ── Capability σ: individuals, not subgroup means (Melzer review B1-034) ──
//
// The X̄ subchart carries σ_x̄ = σ/√n for its limits. Cp/Cpk compare the spread
// of individual values with the tolerance, so they need σ = R̄/d2 or S̄/c4.

const piston = await loadFixture('../gold-standards/capability/dataset-pistonrings.json');
const pistonExpected = await loadFixture('../gold-standards/capability/expected-pistonrings.json');

suite('Control Charts — capability σ of individuals', () => {
  const { values, lsl, usl, subgroupSize: n } = piston;

  test('X̄-R: Cp/Cpk from R̄/d2, not from σ_x̄', () => {
    const xbar = computeXbarR(values, n).subcharts.xbar;
    const sigma = capabilitySigma('xbar-r', xbar.sigma, n);
    const cap = computeCapability(xbar.values, xbar.cl, sigma, usl, lsl);
    const e = pistonExpected.withinRbar;
    assertAlmostEqual(sigma, e.sigma, 1e-12, 'R̄/d2');
    assertAlmostEqual(cap.cp, e.cp, 1e-9, 'Cp');
    assertAlmostEqual(cap.cpk, e.cpk, 1e-9, 'Cpk');
  });

  test('X̄-S: Cp from S̄/c4 (table c4, 4 digits)', () => {
    const xbar = computeXbarS(values, n).subcharts.xbar;
    const cap = computeCapability(xbar.values, xbar.cl, capabilitySigma('xbar-s', xbar.sigma, n), usl, lsl);
    // S̄/c4(5) with the exact c4 gives Cp 1.69554; the chart uses c4 = 0.9400.
    assertAlmostEqual(cap.cp, 1.69554, 5e-4, 'Cp');
  });

  test('I-MR: the I-chart σ is already the σ of individuals', () => {
    assertEqual(capabilitySigma('i-mr', 0.25, 1), 0.25);
  });

  test('staged σ arrays are scaled per stage', () => {
    const out = capabilitySigma('xbar-r', [0.1, 0.2], 4);
    assertAlmostEqual(out[0], 0.2, 1e-12);
    assertAlmostEqual(out[1], 0.4, 1e-12);
  });
});

/** Alternating series around 0: +1, -1, +1, … (length n). */
function alternating(n) {
  return Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 1 : -1));
}

/** Sorted, de-duplicated indices flagged for one rule. */
function flagged(values, ruleId) {
  return [...new Set(
    evaluateNelsonRules(values, 0, 1, [ruleId])
      .filter(v => v.ruleId === ruleId)
      .map(v => v.index),
  )].sort((a, b) => a - b);
}

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

suite('Control Charts — Nelson tests 4, 7, 8 (hand cases, Nelson 1984 / Minitab)', () => {
  test('rule 4: 13 alternating points → no signal', () => {
    assertDeepEqual(flagged(alternating(13), 4), []);
  });
  test('rule 4: 14 alternating points → all 14 flagged', () => {
    assertDeepEqual(flagged(alternating(14), 4), range(0, 13));
  });
  test('rule 4: 15 alternating points → all 15 flagged', () => {
    assertDeepEqual(flagged(alternating(15), 4), range(0, 14));
  });
  test('rule 4: a tie in the middle breaks the run', () => {
    // 7 alternating, then a repeat of the previous value, then 7 alternating
    const v = [...alternating(7), 1, ...alternating(7).map(x => -x)];
    assertDeepEqual(flagged(v, 4), []);
  });
  test('rule 4: null breaks the run', () => {
    const v = [...alternating(7), null, ...alternating(7)];
    assertDeepEqual(flagged(v, 4), []);
  });
  test('rule 7: 14 points within 1σ → no signal', () => {
    assertDeepEqual(flagged(Array(14).fill(0.5), 7), []);
  });
  test('rule 7: 15 points within 1σ → all 15 flagged', () => {
    assertDeepEqual(flagged(Array(15).fill(0.5), 7), range(0, 14));
  });
  test('rule 7: a point exactly at 1σ counts as inside', () => {
    const v = [...Array(7).fill(0.5), 1, ...Array(7).fill(-0.5)];
    assertDeepEqual(flagged(v, 7), range(0, 14));
  });
  test('rule 8: 7 points beyond 1σ (both sides) → no signal', () => {
    assertDeepEqual(flagged([1.5, -1.5, 1.5, -1.5, 1.5, -1.5, 1.5], 8), []);
  });
  test('rule 8: 8 points beyond 1σ (both sides) → all 8 flagged', () => {
    assertDeepEqual(flagged([1.5, -1.5, 1.5, -1.5, 1.5, -1.5, 1.5, -1.5], 8), range(0, 7));
  });
  test('rule 8: a point exactly at 1σ is not beyond', () => {
    assertDeepEqual(flagged([1.5, -1.5, 1.5, -1.5, 1, 1.5, -1.5, 1.5, -1.5], 8), []);
  });
});

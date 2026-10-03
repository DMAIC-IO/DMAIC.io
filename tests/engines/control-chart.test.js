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
  secondaryChartRules,
  SECONDARY_CHART_RULES,
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

suite('Control Charts — rules on the MR/R/S chart (Melzer E-023)', () => {
  test('SECONDARY_CHART_RULES is tests 1–4', () => {
    assertDeepEqual(SECONDARY_CHART_RULES, [1, 2, 3, 4]);
  });
  test('all eight enabled → 1–4', () => {
    assertDeepEqual(secondaryChartRules([1, 2, 3, 4, 5, 6, 7, 8]), [1, 2, 3, 4]);
  });
  test('only zone tests enabled → none', () => {
    assertDeepEqual(secondaryChartRules([5, 6]), []);
  });
  test('order is kept and the input is not mutated', () => {
    const input = [4, 2, 6];
    assertDeepEqual(secondaryChartRules(input), [4, 2]);
    assertDeepEqual(input, [4, 2, 6]);
  });
  test('an empty rule list yields no violations', () => {
    assertDeepEqual(evaluateNelsonRules([0, 5, 0, 5], 0, 1, secondaryChartRules([5, 6])), []);
  });
});

// ── Staged charts: every stage judged by its own limits ──
// (Melzer D-001, E-001, E-002; Fig. 5.4. Montgomery SQC §6.)

const fig54s1 = [92.6, 93.1, 93.6, 93.1, 92.95, 91.4, 91.95, 92.6, 91.75, 92.2, 93.6, 92.6, 91.55, 93.0];
const fig54s2 = [93.65, 94.5, 93.35, 95.1, 93.2, 94.75, 93.45, 95.75, 95.3, 93.5, 95.1, 93.65, 93.7, 95.5];
const fig54 = [...fig54s1, ...fig54s2];
const ALL_RULES = [1, 2, 3, 4, 5, 6, 7, 8];

suite('Control Charts — staged I-MR (Melzer Fig. 5.4)', () => {
  const res = computeIMR(fig54, 1, undefined, [14]);
  const i = res.subcharts.i;

  test('each stage has its own limits', () => {
    assertAlmostEqual(i.cl[0], 92.571, 1e-3, 'stage 1 CL');
    assertAlmostEqual(i.ucl[0], 94.740, 1e-3, 'stage 1 UCL');
    assertAlmostEqual(i.lcl[0], 90.403, 1e-3, 'stage 1 LCL');
    assertAlmostEqual(i.cl[14], 94.321, 1e-3, 'stage 2 CL');
    assertAlmostEqual(i.ucl[14], 97.994, 1e-3, 'stage 2 UCL');
    assertAlmostEqual(i.lcl[14], 90.649, 1e-3, 'stage 2 LCL');
  });

  test('the result names its stage segments', () => {
    assertDeepEqual(res.segments, [{ start: 0, end: 14 }, { start: 14, end: 28 }]);
  });

  test('all eight rules, per stage → no signal', () => {
    assertDeepEqual(evaluateNelsonRules(i.values, i.cl, i.sigma, ALL_RULES, res.segments), []);
  });

  test('judged by stage-1 limits the same data would signal (the old bug)', () => {
    const wrong = evaluateNelsonRules(i.values, i.cl[0], i.sigma[0], ALL_RULES);
    assertEqual(wrong.some(v => v.index >= 14), true);
  });
});

suite('Control Charts — Nelson rules on staged limits', () => {
  const cl = [0, 0, 0, 0, 10, 10, 10, 10];
  const sigma = [1, 1, 1, 1, 1, 1, 1, 1];

  test('a point beyond its own stage limits is flagged', () => {
    const v = [0, 0.5, -0.5, 0, 10.5, 10, 9.5, 13.5];
    assertDeepEqual(evaluateNelsonRules(v, cl, sigma, [1]), [{ index: 7, ruleId: 1 }]);
  });

  test('segments are derived from the per-point limits when not given', () => {
    const v = [0, 0.5, -0.5, 0, 10.5, 10, 9.5, 10];
    assertDeepEqual(evaluateNelsonRules(v, cl, sigma, ALL_RULES), []);
  });

  test('a run does not continue across a stage boundary', () => {
    // 5 above CL in stage 1, 4 above CL in stage 2 — never 9 in one stage
    const flat = Array(9).fill(0);
    const v = [1, 1, 1, 1, 1, 1, 1, 1, 1];
    const segs = [{ start: 0, end: 5 }, { start: 5, end: 9 }];
    assertDeepEqual(evaluateNelsonRules(v, flat, Array(9).fill(2), [2], segs), []);
    assertEqual(evaluateNelsonRules(v, 0, 2, [2]).length, 9);
  });

  test('indices of later stages keep their position in the series', () => {
    const v = [0, 0, 5, 5, 5, 9];
    const segs = [{ start: 0, end: 2 }, { start: 2, end: 6 }];
    const out = evaluateNelsonRules(v, [0, 0, 5, 5, 5, 5], [1, 1, 1, 1, 1, 1], [1], segs);
    assertDeepEqual(out, [{ index: 5, ruleId: 1 }]);
  });
});

suite('Control Charts — staged MR at the stage boundary', () => {
  const a = [10, 11, 10, 12, 11, 10, 11, 12, 10, 11, 10, 11];
  const b = [20, 21, 20, 22, 21, 20, 21, 22, 20, 21, 20, 23.5];
  const res = computeIMR([...a, ...b], 1, undefined, [12]);
  const mr = res.subcharts.mr;

  test('the moving range across the boundary is not plotted', () => {
    assertEqual(mr.values[12], null);
    assertEqual(mr.values[0], null);
    assertEqual(mr.values[13], 1);
  });

  test('the MR chart has no signal at the boundary', () => {
    const out = evaluateNelsonRules(mr.values, mr.cl, mr.sigma, [1, 2, 3, 4], res.segments);
    assertEqual(out.some(v => v.index === 12), false);
  });
});

suite('Control Charts — staged X̄-R / X̄-S segments', () => {
  const v = Array.from({ length: 24 }, (_, k) => (k < 12 ? 10 : 20) + (k % 3) * 0.5);

  test('X̄-R segments are in subgroup space', () => {
    assertDeepEqual(computeXbarR(v, 3, undefined, [12]).segments,
      [{ start: 0, end: 4 }, { start: 4, end: 8 }]);
  });

  test('X̄-S segments are in subgroup space', () => {
    assertDeepEqual(computeXbarS(v, 3, undefined, [12]).segments,
      [{ start: 0, end: 4 }, { start: 4, end: 8 }]);
  });

  test('single-stage results carry no segments', () => {
    assertEqual(computeIMR(v).segments, undefined);
  });
});

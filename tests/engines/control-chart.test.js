/**
 * D.Mike — Control Chart Engine Fixture Validation
 * Validates I-MR, X̄-R, X̄-S control limits, Nelson Rules, and Cp/Cpk.
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import {
  computeIMR,
  computeXbarR,
  computeXbarS,
  evaluateNelsonRules,
  computeCapability,
} from '../../js/engines/control-chart-engine.js';

async function loadFixture(path) {
  const resp = await fetch(path);
  return resp.json();
}

function getTol(tc, tolerances) {
  const key = tc.tolerance_override;
  return key && tolerances.overrides?.[key]
    ? tolerances.overrides[key].absolute
    : tolerances.default.absolute;
}

function getSubchartValue(result, path) {
  const [sub, prop] = path.split('.');
  return result?.subcharts?.[sub]?.[prop];
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
        result = computeIMR(tc.inputs.values, 1, tc.inputs.baselineEnd);
      } else if (mode === 'xbar-r') {
        result = computeXbarR(tc.inputs.values, tc.inputs.n, tc.inputs.baselineEnd);
      } else {
        result = computeXbarS(tc.inputs.values, tc.inputs.n, tc.inputs.baselineEnd);
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

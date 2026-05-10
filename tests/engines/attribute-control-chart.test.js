/**
 * D.Mike — Attribute Control Chart Engine Fixture Validation
 * Validates p, np, c, u control limits and attribute-rule violations.
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import { analyze } from '../../js/engines/attribute-control-chart-engine.js';

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

const data = await loadFixture('../fixtures/control-charts/attribute-control-chart.fixtures.json');

suite('Attribute Control Charts — p / np / c / u (fixture validation)', () => {
  for (const tc of data.test_cases) {
    if (!tc.expected || Object.keys(tc.expected).length === 0) continue;
    const mode = tc.inputs.mode;
    if (!['p', 'np', 'c', 'u'].includes(mode)) continue;

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

suite('Attribute Control Charts — Nelson Rules (fixture validation)', () => {
  for (const tc of data.test_cases) {
    if (!tc.expected || tc.inputs.mode !== 'nelson') continue;

    test(`${tc.id}: ${tc.description}`, () => {
      const got = analyze(tc.inputs);

      if ('violationCount' in tc.expected) {
        assertEqual(got.violationCount, tc.expected.violationCount,
          `${tc.id}: violationCount = ${got.violationCount}, expected ${tc.expected.violationCount}`);
      }
      if ('rulesTriggered' in tc.expected) {
        const expected = tc.expected.rulesTriggered;
        assertEqual(got.rulesTriggered.length, expected.length,
          `${tc.id}: rulesTriggered count`);
        for (let i = 0; i < expected.length; i++) {
          assertEqual(got.rulesTriggered[i], expected[i],
            `${tc.id}: rulesTriggered[${i}]`);
        }
      }
      if ('violationIndices' in tc.expected) {
        const expected = tc.expected.violationIndices;
        assertEqual(got.violationIndices.length, expected.length,
          `${tc.id}: violationIndices count`);
        for (let i = 0; i < expected.length; i++) {
          assertEqual(got.violationIndices[i], expected[i],
            `${tc.id}: violationIndices[${i}]`);
        }
      }
    });
  }
});

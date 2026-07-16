/**
 * DMAIC.io — MSA Typ 6 Engine Tests (msa-typ6-engine.test.js)
 * Unit tests for validate() — all error codes for the SPC-based Stability
 * MSA engine. analyze() itself is filled in incrementally by Tasks 3–6.
 * See docs/superpowers/specs/2026-07-16-msa-typ6-design.md for the module spec.
 */

import { suite, test, assert, assertClose, assertDeepEqual } from '../test-utils.js';
import { validate, analyze } from '../../js/engines/msa-typ6-engine.js';
import fixtures from '../fixtures/msa/msa-typ6-stability.fixtures.json' with { type: 'json' };

const CASE = (id) => fixtures.test_cases.find(c => c.id === id);

const OK = {
  chartType: 'i-mr',
  values: Array.from({ length: 20 }, (_, i) => i),
  limitsMode: 'from-study',
  baselineK: 10,
  alpha: 0.05,
  enabledRules: [1, 2, 3, 4, 5, 6],
};

suite('msa-typ6-engine — validate', () => {
  test('OK case returns ok=true', () => {
    const r = validate(OK);
    assert(r.ok, `expected ok, got ${r.code}`);
  });

  test('E_NO_VALUES: empty values array', () => {
    const r = validate({ ...OK, values: [] });
    assert(r.code === 'E_NO_VALUES', r.code);
  });

  test('E_TOO_FEW_POINTS: I-MR with < 10 points', () => {
    const r = validate({ ...OK, values: [1, 2, 3, 4, 5] });
    assert(r.code === 'E_TOO_FEW_POINTS', r.code);
  });

  test('E_INVALID_CHART_TYPE', () => {
    const r = validate({ ...OK, chartType: 'p-chart' });
    assert(r.code === 'E_INVALID_CHART_TYPE', r.code);
  });

  test('E_SUBGROUP_MISMATCH: xbar-r with subgroups length ≠ values length', () => {
    const r = validate({
      ...OK, chartType: 'xbar-r',
      values: Array.from({ length: 10 }, (_, i) => i),
      subgroups: [1, 1, 1],
    });
    assert(r.code === 'E_SUBGROUP_MISMATCH', r.code);
  });

  test('E_UNEQUAL_SUBGROUP_SIZES', () => {
    const r = validate({
      ...OK, chartType: 'xbar-r',
      values: [1, 2, 3, 4, 5, 6, 7], subgroups: [1, 1, 2, 2, 2, 3, 3],
    });
    assert(r.code === 'E_UNEQUAL_SUBGROUP_SIZES', r.code);
  });

  test('E_SUBGROUP_SIZE_OUT_OF_RANGE', () => {
    const r1 = validate({
      ...OK, chartType: 'xbar-r', values: [1, 2, 3, 4, 5, 6],
      subgroups: [1, 2, 3, 4, 5, 6],
    });
    assert(r1.code === 'E_SUBGROUP_SIZE_OUT_OF_RANGE', r1.code);
  });

  test('E_GIVEN_LIMITS_INVALID: missing mu0', () => {
    const r = validate({ ...OK, limitsMode: 'given', sigma0: 1, mu0: NaN });
    assert(r.code === 'E_GIVEN_LIMITS_INVALID', r.code);
  });

  test('E_GIVEN_LIMITS_INVALID: sigma0 <= 0', () => {
    const r = validate({ ...OK, limitsMode: 'given', mu0: 0, sigma0: 0 });
    assert(r.code === 'E_GIVEN_LIMITS_INVALID', r.code);
  });

  test('E_BASELINE_TOO_SMALL', () => {
    const r = validate({ ...OK, baselineK: 3 });
    assert(r.code === 'E_BASELINE_TOO_SMALL', r.code);
  });

  test('E_BASELINE_EXCEEDS_DATA', () => {
    const r = validate({ ...OK, values: Array.from({ length: 15 }, (_, i) => i), baselineK: 20 });
    assert(r.code === 'E_BASELINE_EXCEEDS_DATA', r.code);
  });

  test('E_INVALID_ALPHA', () => {
    const r = validate({ ...OK, alpha: 0.03 });
    assert(r.code === 'E_INVALID_ALPHA', r.code);
  });
});

suite('msa-typ6-engine — analyze (Grenzen-Berechnung)', () => {
  test('imr-stable: cl matches fixture', () => {
    const c = CASE('imr-stable');
    const r = analyze(c.inputs);
    assertClose(r.primary.cl, c.expected.cl, 1e-9, `cl: ${r.primary.cl} vs ${c.expected.cl}`);
  });

  test('imr-stable: ucl and lcl match fixture', () => {
    const c = CASE('imr-stable');
    const r = analyze(c.inputs);
    assertClose(r.primary.ucl, c.expected.ucl, 1e-9, `ucl: ${r.primary.ucl} vs ${c.expected.ucl}`);
    assertClose(r.primary.lcl, c.expected.lcl, 1e-9, `lcl: ${r.primary.lcl} vs ${c.expected.lcl}`);
  });

  test('xbar-r-stable: cl and sigma match fixture', () => {
    const c = CASE('xbar-r-stable');
    const r = analyze(c.inputs);
    assertClose(r.primary.cl, c.expected.cl, 1e-9, `cl: ${r.primary.cl} vs ${c.expected.cl}`);
    assertClose(r.primary.sigma, c.expected.sigma, 1e-9, `sigma: ${r.primary.sigma} vs ${c.expected.sigma}`);
  });

  test('given-limits: cl equals mu0', () => {
    const c = CASE('given-limits');
    const r = analyze(c.inputs);
    assertClose(r.primary.cl, c.inputs.mu0, 1e-9, `cl: ${r.primary.cl} vs mu0=${c.inputs.mu0}`);
  });
});

suite('msa-typ6-engine — analyze (Nelson-Regel-Aggregation)', () => {
  test('imr-outlier-rule1: single violation at expected index', () => {
    const c = CASE('imr-outlier-rule1');
    const r = analyze(c.inputs);
    const rule1 = r.primary.violations.filter(v => v.ruleId === 1);
    assert(rule1.length === 1, `rule 1 count: ${rule1.length}`);
    assert(rule1[0].index === 25, `rule 1 index: ${rule1[0].index}`);
    assert(r.ruleViolations.length === 1, `ruleViolations length: ${r.ruleViolations.length}`);
    assert(r.ruleViolations[0].primaryIndex === 25, `primaryIndex: ${r.ruleViolations[0].primaryIndex}`);
    assertDeepEqual(r.ruleViolations[0].ruleIds, [1], `ruleIds: ${JSON.stringify(r.ruleViolations[0].ruleIds)}`);
  });

  test('xbar-r-shift: ruleViolations aggregates multiple ruleIds per point', () => {
    const c = CASE('xbar-r-shift');
    const r = analyze(c.inputs);
    assert(r.ruleViolations.length >= 1, 'no violations aggregated');
    const multi = r.ruleViolations.find(v => Array.isArray(v.ruleIds) && v.ruleIds.length >= 1);
    assert(multi, 'ruleIds field missing');
    const bothRules = r.ruleViolations.find(v => Array.isArray(v.ruleIds) && v.ruleIds.length >= 2);
    assert(bothRules, 'expected at least one point with both rule 5 and rule 6 triggered');
  });
});

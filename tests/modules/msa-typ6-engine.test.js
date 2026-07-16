/**
 * DMAIC.io — MSA Typ 6 Engine Tests (msa-typ6-engine.test.js)
 * Unit tests for validate() — all error codes for the SPC-based Stability
 * MSA engine. analyze() itself is filled in incrementally by Tasks 3–6.
 * See docs/superpowers/specs/2026-07-16-msa-typ6-design.md for the module spec.
 */

import { suite, test, assert } from '../test-utils.js';
import { validate } from '../../js/engines/msa-typ6-engine.js';

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

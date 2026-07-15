/**
 * D.Mike — MSA Typ 4 Engine Tests (msa-typ4-engine.test.js)
 * Unit tests for input validation (validate()).
 * See docs/modules/MSA-TYP4.md for the module spec.
 */

import { suite, test, assert, assertClose } from '../test-utils.js';
import { validate, perReferenceStats, regressBiasVsReference, aiagKpis } from '../../js/engines/msa-typ4-engine.js';
import fixtures from '../fixtures/msa/msa-typ4.fixtures.json' with { type: 'json' };

suite('msa-typ4-engine — validate', () => {
  test('leere Eingabe → E_TOO_FEW_REFERENCES', () => {
    const r = validate([], [], { pvMode: 'tolerance', LSL: 0, USL: 10 });
    assert(!r.valid);
    assert(r.errorKey === 'modules.msa-typ4.errTooFewReferences');
  });

  test('unterschiedliche Längen → E_LENGTH_MISMATCH', () => {
    const r = validate([1, 2, 3], [1, 2], { pvMode: 'tolerance', LSL: 0, USL: 10 });
    assert(!r.valid);
    assert(r.errorKey === 'modules.msa-typ4.errLengthMismatch');
  });

  test('nur 4 Referenzen → E_TOO_FEW_REFERENCES', () => {
    const ref = [1,1,1, 2,2,2, 3,3,3, 4,4,4];
    const y   = [1,1,1, 2,2,2, 3,3,3, 4,4,4];
    const r = validate(ref, y, { pvMode: 'tolerance', LSL: 0, USL: 10 });
    assert(!r.valid);
    assert(r.errorKey === 'modules.msa-typ4.errTooFewReferences');
  });

  test('nur 2 Wiederholungen für eine Referenz → E_TOO_FEW_REPEATS', () => {
    const ref = [1,1,1, 2,2,2, 3,3,3, 4,4,4, 5,5];
    const y   = ref.slice();
    const r = validate(ref, y, { pvMode: 'tolerance', LSL: 0, USL: 10 });
    assert(!r.valid);
    assert(r.errorKey === 'modules.msa-typ4.errTooFewRepeats');
  });

  test('PV ≤ 0 (Toleranz negativ) → E_INVALID_PV', () => {
    const ref = [1,1,1, 2,2,2, 3,3,3, 4,4,4, 5,5,5];
    const y   = ref.slice();
    const r = validate(ref, y, { pvMode: 'tolerance', LSL: 10, USL: 5 });
    assert(!r.valid);
    assert(r.errorKey === 'modules.msa-typ4.errInvalidPv');
  });

  test('NaN in Messwerten → E_NAN_VALUES', () => {
    const ref = [1,1,1, 2,2,2, 3,3,3, 4,4,4, 5,5,5];
    const y   = ref.slice(); y[3] = NaN;
    const r = validate(ref, y, { pvMode: 'tolerance', LSL: 0, USL: 10 });
    assert(!r.valid);
    assert(r.errorKey === 'modules.msa-typ4.errNanValues');
  });

  test('sauberer Input → valid', () => {
    const ref = [1,1,1, 2,2,2, 3,3,3, 4,4,4, 5,5,5];
    const y   = ref.slice();
    const r = validate(ref, y, { pvMode: 'tolerance', LSL: 0, USL: 10 });
    assert(r.valid);
    assert(r.errorKey === null);
  });
});

suite('msa-typ4-engine — perReferenceStats', () => {
  test('clean-Fixture: bias ≈ 0, hohe p-Werte', () => {
    const c = fixtures.test_cases.find(x => x.id === 'clean');
    const stats = perReferenceStats(c.inputs.reference, c.inputs.measured, 0.05);
    assertClose(stats.length, c.expected.perReference.length, 0);
    for (let i = 0; i < stats.length; i++) {
      const got = stats[i], want = c.expected.perReference[i];
      assertClose(got.xRef, want.xRef, 1e-9);
      assertClose(got.n, want.n, 0);
      assertClose(got.mean, want.mean, 1e-6);
      assertClose(got.bias, want.bias, 1e-6);
      assertClose(got.sd, want.sd, 1e-6);
      assertClose(got.pValue, want.pValue, 1e-4);
    }
  });

  test('offset-bias-Fixture: alle p-Werte klein', () => {
    const c = fixtures.test_cases.find(x => x.id === 'offset-bias');
    const stats = perReferenceStats(c.inputs.reference, c.inputs.measured, 0.05);
    for (const s of stats) assert(s.pValue < 0.05, `pValue=${s.pValue} @ ref=${s.xRef}`);
  });
});

suite('msa-typ4-engine — regressBiasVsReference', () => {
  test('linear-drift-Fixture: slope > 0, sig.', () => {
    const c = fixtures.test_cases.find(x => x.id === 'linear-drift');
    const r = regressBiasVsReference(c.inputs.reference, c.inputs.measured, 0.05);
    assertClose(r.slope, c.expected.slope, 1e-4);
    assertClose(r.intercept, c.expected.intercept, 1e-4);
    assertClose(r.seSlope, c.expected.seSlope, 1e-5);
    assertClose(r.seIntercept, c.expected.seIntercept, 1e-5);
    assertClose(r.pSlope, c.expected.pSlope, 1e-4);
  });

  test('offset-bias-Fixture: slope ≈ 0, intercept ≈ 0.05', () => {
    const c = fixtures.test_cases.find(x => x.id === 'offset-bias');
    const r = regressBiasVsReference(c.inputs.reference, c.inputs.measured, 0.05);
    assertClose(r.slope, 0, 2e-3);
    assertClose(r.intercept, 0.05, 5e-3);
    assert(r.pSlope > 0.10);
    assert(r.pIntercept < 0.001);
  });

  test('CI-Band bei x̄ gibt schmale Grenzen', () => {
    const c = fixtures.test_cases.find(x => x.id === 'clean');
    const r = regressBiasVsReference(c.inputs.reference, c.inputs.measured, 0.05);
    const xBar = c.inputs.reference.reduce((s, v) => s + v, 0) / c.inputs.reference.length;
    const [lo, hi] = r.ciBand(xBar);
    assert(hi - lo < 0.02);  // schmales Band bei clean-Daten am Mittel
  });
});

suite('msa-typ4-engine — aiagKpis', () => {
  test('linear-drift → percentLinearity > 10, rot', () => {
    const c = fixtures.test_cases.find(x => x.id === 'linear-drift');
    const per = perReferenceStats(c.inputs.reference, c.inputs.measured, 0.05);
    const reg = regressBiasVsReference(c.inputs.reference, c.inputs.measured, 0.05);
    const kpi = aiagKpis(per, reg, c.inputs.params);
    assertClose(kpi.percentLinearity, c.expected.percentLinearity, 1e-3);
    assertClose(kpi.maxPercentBias, c.expected.maxPercentBias, 1e-3);
    assert(kpi.percentLinearity > 10);
    assert(kpi.verdict.color === 'red');
  });

  test('clean → grün', () => {
    const c = fixtures.test_cases.find(x => x.id === 'clean');
    const per = perReferenceStats(c.inputs.reference, c.inputs.measured, 0.05);
    const reg = regressBiasVsReference(c.inputs.reference, c.inputs.measured, 0.05);
    const kpi = aiagKpis(per, reg, c.inputs.params);
    assert(kpi.verdict.color === 'green');
  });
});

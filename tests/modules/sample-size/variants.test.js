/**
 * Stichprobenumfang: Register der Varianten (domain/variants.js) — gleich dem
 * Literal `effect` im Schema, Wahl der Variante und des Verfahrens.
 */
import { suite, test, assertEqual, assertDeepEqual, assertAlmostEqual } from '../../test-utils.js';
import { VARIANTS, VARIANT_IDS, variantOf, algoIdOf } from '../../../js/modules/sample-size/domain/variants.js';
import { State } from '../../../js/modules/sample-size/domain/model.js';

suite('sample-size: Varianten', () => {
  test('Register gleich dem Literal effect im Schema (Regel M6)', () => {
    const e = State.schema.fields.effect;
    assertEqual(e.kind, 'object');
    assertDeepEqual(Object.keys(e.shape), [...VARIANT_IDS]);
    for (const id of VARIANT_IDS) assertDeepEqual(Object.keys(e.shape[id].shape), [...VARIANTS[id].params], id);
  });

  test('variantOf: Kategorie und Testtyp', () => {
    assertEqual(variantOf('variance', 'one'), 'varianceOne');
    assertEqual(variantOf('variance', 'two'), 'varianceTwo');
    assertEqual(variantOf('mean', 'one'), 'mean');
    assertEqual(variantOf('mean', 'two'), 'mean');
  });

  test('algoIdOf: Verfahren wie die Altform', () => {
    assertEqual(algoIdOf('variance', 'one'), 'chi-square-variance');
    assertEqual(algoIdOf('variance', 'two'), 'f-test');
    assertEqual(algoIdOf('mean', 'one'), 'one-sample-t-test');
    assertEqual(algoIdOf('mean', 'two'), 'two-sample-t-test');
  });

  test('Effektgrößen: σ₁²/σ₀², Verhältnis, Cohen’s d', () => {
    assertAlmostEqual(VARIANTS.varianceOne.effectValue({ sigma0: 2, sigmaAlt: 4 }), 4, 1e-12);
    assertEqual(VARIANTS.varianceTwo.effectValue({ ratio: 2.5 }), 2.5);
    assertAlmostEqual(VARIANTS.mean.effectValue({ delta: 0.5, sigma: 0.8 }), 0.625, 1e-12);
    assertEqual(VARIANTS.varianceOne.effectKey, 'varianceRatio');
    assertEqual(VARIANTS.varianceTwo.effectKey, 'varianceRatio');
    assertEqual(VARIANTS.mean.effectKey, 'cohensD');
  });
});

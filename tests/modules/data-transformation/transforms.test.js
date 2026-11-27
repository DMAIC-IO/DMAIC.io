/**
 * Tests for modules/data-transformation/domain/transforms.js — das Register
 * (Reihenfolge, Parameter), die Form von `params` als Literal gleich dem
 * Register, die Rechnung je Transformation samt Fehlerschlüsseln und die
 * Schätzung von λ.
 */
import { suite, test, assertEqual, assertDeepEqual, assertAlmostEqual, assertThrows, assertTrue } from '../../test-utils.js';
import {
  TRANSFORMS, TRANSFORM_IDS, PARAMS_SHAPE, LAMBDA_TRANSFORMS, transformOf, applyTransform, optimizeBoxCox, optimizeYeoJohnson,
} from '../../../js/modules/data-transformation/domain/transforms.js';
import { State } from '../../../js/modules/data-transformation/domain/model.js';

/** @param {() => any} fn @returns {string|null} */
function message(fn) {
  try { fn(); } catch (e) { return /** @type {Error} */ (e).message; }
  return null;
}

suite('data-transformation Register', () => {
  test('neun Transformationen in fester Reihenfolge, gleich der Liste von currentTF', () => {
    assertEqual(TRANSFORM_IDS.join(','), 'boxcox,yeojohnson,johnson_su,johnson_sb,log,log10,sqrt,inverse,square');
    assertDeepEqual([...State.schema.fields.currentTF.values], [...TRANSFORM_IDS]);
    assertDeepEqual([...LAMBDA_TRANSFORMS], ['boxcox', 'yeojohnson']);
  });

  test('Parameter je Transformation wie die Altform', () => {
    assertDeepEqual(transformOf('boxcox')?.params.map((p) => [p.key, p.default, p.min, p.max, p.step]), [['lambda', 0, -5, 5, 0.1]]);
    assertDeepEqual(transformOf('yeojohnson')?.params.map((p) => [p.key, p.default]), [['lambda', 1]]);
    for (const id of ['johnson_su', 'johnson_sb']) {
      assertDeepEqual(transformOf(id)?.params.map((p) => [p.key, p.default, p.min, p.max, p.step]), [
        ['gamma', 0, -5, 5, 0.1], ['delta', 1, 0.1, 10, 0.1], ['xi', 0, -100, 100, 0.5], ['lambdaJ', 1, 0.1, 100, 0.5],
      ], id);
    }
    for (const id of ['log', 'log10', 'sqrt', 'inverse', 'square']) assertEqual(transformOf(id)?.params.length, 0, id);
  });

  test('PARAMS_SHAPE gleicht dem Register: je Transformation mit Parametern dieselben Schlüssel und Grenzen', () => {
    const withParams = TRANSFORMS.filter((t) => t.params.length > 0);
    assertDeepEqual(Object.keys(PARAMS_SHAPE), withParams.map((t) => t.id));
    for (const t of withParams) {
      const shape = /** @type {any} */ (PARAMS_SHAPE)[t.id].shape;
      assertDeepEqual(Object.keys(shape), t.params.map((p) => p.key), t.id);
      for (const p of t.params) {
        const s = shape[p.key];
        assertEqual(s.min, p.min, `${t.id}.${p.key} min`);
        assertEqual(s.max, p.max, `${t.id}.${p.key} max`);
        if (p.key === 'lambda') {
          assertEqual(s.nullable, true, `${t.id}.lambda nullable`);
          assertEqual(s.default, null, `${t.id}.lambda leer`);
        } else {
          assertEqual(s.default, p.default, `${t.id}.${p.key} default`);
        }
      }
    }
  });
});

suite('data-transformation applyTransform', () => {
  const pos = [1, 2, 4, 8];

  test('Box-Cox: λ = 0 ist ln, λ = 1 ist x − 1; Werte ≤ 0 werfen errBoxCoxPositive', () => {
    assertAlmostEqual(applyTransform(pos, 'boxcox', () => 0)[3], Math.log(8), 1e-9);
    assertAlmostEqual(applyTransform(pos, 'boxcox', () => 1)[1], 1, 1e-9);
    assertEqual(message(() => applyTransform([1, 0, 2], 'boxcox', () => 1)), 'errBoxCoxPositive');
  });

  test('Yeo-Johnson nimmt negative Werte; Sonderfälle λ = 0 und λ = 2', () => {
    const out = applyTransform([-1, 0, 1], 'yeojohnson', () => 1);
    assertTrue(out.every((v) => Number.isFinite(v)));
    assertAlmostEqual(applyTransform([1], 'yeojohnson', () => 0)[0], Math.log(2), 1e-9);
    assertAlmostEqual(applyTransform([-1], 'yeojohnson', () => 2)[0], -Math.log(2), 1e-9);
  });

  test('Logarithmen, Wurzel, Inverse, Quadrat und ihre Fehlerschlüssel', () => {
    assertAlmostEqual(applyTransform(pos, 'log', () => 0)[2], Math.log(4), 1e-9);
    assertEqual(message(() => applyTransform([1, -1], 'log', () => 0)), 'errLogPositive');
    assertDeepEqual(applyTransform([10, 100], 'log10', () => 0).map((v) => Math.round(v * 1e9) / 1e9), [1, 2]);
    assertEqual(message(() => applyTransform([1, 0], 'log10', () => 0)), 'errLog10Positive');
    assertAlmostEqual(applyTransform([0, 4, 9], 'sqrt', () => 0)[2], 3, 1e-9);
    assertEqual(message(() => applyTransform([4, -1], 'sqrt', () => 0)), 'errSqrtNonNeg');
    assertAlmostEqual(applyTransform([2, 4], 'inverse', () => 0)[0], 0.5, 1e-9);
    assertEqual(message(() => applyTransform([1, 0], 'inverse', () => 0)), 'errInverseZero');
    assertDeepEqual(applyTransform([2, 3], 'square', () => 0), [4, 9]);
  });

  test('Johnson SU und SB; SB außerhalb von (ξ, ξ+λ) wirft errJohnsonSBRange', () => {
    const p = (o) => (k) => ({ gamma: 0, delta: 1, xi: 0, lambdaJ: 1, ...o })[k];
    assertAlmostEqual(applyTransform([0], 'johnson_su', p({}))[0], 0, 1e-9);
    assertEqual(message(() => applyTransform([5], 'johnson_sb', p({}))), 'errJohnsonSBRange');
    assertTrue(applyTransform([5, 10], 'johnson_sb', p({ lambdaJ: 20 })).every((v) => Number.isFinite(v)));
    assertThrows(() => applyTransform([1], 'unknown', () => 0));
  });
});

suite('data-transformation Schätzung von λ', () => {
  // Spalten des Altprojekts (Task 0); die Altform schätzte −0,35 und 0,8.
  const C1 = [2.3, 3.1, 1.8, 4.6, 2.9, 5.4, 3.7, 2.2, 6.8, 3.3, 4.1, 2.6, 8.9, 3.9, 2.0, 5.1, 3.5, 7.2, 2.8, 4.4];
  const C2 = [-2.5, -1.0, 0, 0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, -0.5, 1.2, 2.2, 3.0, -1.5, 4.0, 0.8, 6.0];

  test('wie die Altform: Box-Cox −0,35 auf C1, Yeo-Johnson 0,8 auf C2', () => {
    assertEqual(optimizeBoxCox(C1), -0.35);
    assertEqual(optimizeYeoJohnson(C2), 0.8);
  });

  test('Box-Cox mit einem Wert ≤ 0 liefert 1; Ergebnisse im Raster und auf 0,01 gerundet', () => {
    assertEqual(optimizeBoxCox([1, 0, -1]), 1);
    const lam = optimizeYeoJohnson([-2, -1, 0, 1, 2, 3]);
    assertTrue(Number.isFinite(lam) && Math.abs(lam) <= 3);
    assertEqual(Math.round(lam * 100) / 100, lam);
  });
});

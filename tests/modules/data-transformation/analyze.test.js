/**
 * Tests for modules/data-transformation/domain/analyze.js — wirksame
 * Transformation (Rückfall Box-Cox → Yeo-Johnson ohne Schreiben), wirksame
 * Parameter (leeres λ geschätzt, gesetztes bleibt), die Rechnung gleich der
 * Altform an den Spalten des Altprojekts und die Fehler.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import {
  analyze, effectiveTransform, effectiveParams, effectiveLambda, describe,
} from '../../../js/modules/data-transformation/domain/analyze.js';
import { State } from '../../../js/modules/data-transformation/domain/model.js';

const C1 = [2.3, 3.1, 1.8, 4.6, 2.9, 5.4, 3.7, 2.2, 6.8, 3.3, 4.1, 2.6, 8.9, 3.9, 2.0, 5.1, 3.5, 7.2, 2.8, 4.4];
const C2 = [-2.5, -1.0, 0, 0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, -0.5, 1.2, 2.2, 3.0, -1.5, 4.0, 0.8, 6.0];

/** Zahlen wie die Kennwert-Tabelle der Altform (`toFixed(4)`). */
const f4 = (v) => (v === null ? '—' : v.toFixed(4));
/** @param {import('../../../js/modules/data-transformation/domain/analyze.js').Descriptives} d */
const row = (d) => [d.mean, d.std, d.median, d.skewness, d.kurtosis, d.min, d.max].map(f4);
/** @param {Partial<{ currentTF: string, params: any }>} o */
function model(o = {}) {
  const m = new State();
  return { currentTF: o.currentTF ?? m.currentTF, params: o.params ?? JSON.parse(JSON.stringify(m.params)) };
}

suite('data-transformation wirksame Transformation', () => {
  test('Box-Cox mit einem Wert ≤ 0 rechnet Yeo-Johnson; unter drei Werten bleibt Box-Cox', () => {
    assertEqual(effectiveTransform('boxcox', C1), 'boxcox');
    assertEqual(effectiveTransform('boxcox', C2), 'yeojohnson');
    assertEqual(effectiveTransform('boxcox', [0, 1]), 'boxcox');
    assertEqual(effectiveTransform('log', C2), 'log');
    assertEqual(effectiveTransform('yeojohnson', C1), 'yeojohnson');
  });

  test('leeres λ wird geschätzt, gesetztes bleibt; unter drei Werten die Vorgabe des Registers', () => {
    assertEqual(effectiveLambda('boxcox', null, C1), -0.35);
    assertEqual(effectiveLambda('boxcox', 0.5, C1), 0.5);
    assertEqual(effectiveLambda('boxcox', null, [1, 2]), 0);
    assertEqual(effectiveLambda('yeojohnson', null, [1, 2]), 1);
    const p = model().params;
    assertDeepEqual(effectiveParams(p, 'yeojohnson', C2), { lambda: 0.8 });
    assertDeepEqual(effectiveParams(p, 'johnson_su', C1), { gamma: 0, delta: 1, xi: 0, lambdaJ: 1 });
    assertDeepEqual(effectiveParams(p, 'log', C1), {});
  });
});

suite('data-transformation analyze — gleich der Altform (Altprojekt, Task 0)', () => {
  test('(a) Box-Cox auf C1: λ −0,35, Kennwerte und Anderson-Darling wie die Altform', () => {
    const out = analyze(C1, model());
    assertTrue(out !== null);
    const { result, transformed } = /** @type {any} */ (out);
    assertEqual(result.n, 20);
    assertEqual(result.transform, 'boxcox');
    assertDeepEqual(result.params, { lambda: -0.35 });
    assertDeepEqual(row(result.original), ['4.0300', '1.8779', '3.6000', '1.1857', '1.0988', '1.8000', '8.9000']);
    assertDeepEqual(row(result.transformed), ['1.0249', '0.2743', '1.0320', '0.0110', '-0.6379', '0.5313', '1.5278']);
    assertDeepEqual([f4(result.original.adStatAdj), f4(result.original.adPValue)], ['0.6846', '0.0738']);
    assertDeepEqual([f4(result.transformed.adStatAdj), f4(result.transformed.adPValue)], ['0.0894', '0.9979']);
    assertEqual(result.original.normal, true);
    assertEqual(transformed.length, 20);
  });

  test('(b) Yeo-Johnson auf C2: λ 0,8, Kennwerte wie die Altform', () => {
    const { result } = /** @type {any} */ (analyze(C2, model({ currentTF: 'yeojohnson' })));
    assertDeepEqual(result.params, { lambda: 0.8 });
    assertDeepEqual(row(result.original), ['2.6100', '3.1092', '2.3500', '0.2648', '-0.8057', '-2.5000', '8.5000']);
    assertDeepEqual(row(result.transformed), ['1.9984', '2.5335', '2.0376', '-0.1083', '-0.6904', '-2.9138', '6.3199']);
    assertDeepEqual([f4(result.transformed.adStatAdj), f4(result.transformed.adPValue)], ['0.0933', '0.9974']);
  });

  test('Rückfall: Box-Cox auf C2 rechnet wie Yeo-Johnson, mit dessen gespeichertem λ', () => {
    const fallback = /** @type {any} */ (analyze(C2, model()));
    const yj = /** @type {any} */ (analyze(C2, model({ currentTF: 'yeojohnson' })));
    assertEqual(fallback.result.transform, 'yeojohnson');
    assertDeepEqual(fallback.result, yj.result);
    const p = model().params;
    p.yeojohnson.lambda = 1.5;
    assertDeepEqual(/** @type {any} */ (analyze(C2, model({ params: p }))).result.params, { lambda: 1.5 });
  });

  test('gesetztes λ bleibt für jede Spalte', () => {
    const p = model().params;
    p.boxcox.lambda = 0.25;
    assertDeepEqual(/** @type {any} */ (analyze(C1, model({ params: p }))).result.params, { lambda: 0.25 });
    assertDeepEqual(/** @type {any} */ (analyze([5, 6, 9, 12], model({ params: p }))).result.params, { lambda: 0.25 });
  });
});

suite('data-transformation analyze — Grenzen und Fehler', () => {
  test('unter drei Werten null', () => {
    assertEqual(analyze([], model()), null);
    assertEqual(analyze([1, 2], model()), null);
  });

  test('Daten außerhalb des Bereichs werfen den Fehlerschlüssel', () => {
    for (const [tf, key] of [['log', 'errLogPositive'], ['log10', 'errLog10Positive'], ['sqrt', 'errSqrtNonNeg'], ['inverse', 'errInverseZero'], ['johnson_sb', 'errJohnsonSBRange']]) {
      let msg = null;
      try { analyze(C2, model({ currentTF: tf })); } catch (e) { msg = /** @type {Error} */ (e).message; }
      assertEqual(msg, key, tf);
    }
  });

  test('Kennwerte gleicher Werte: Streuung leer, kein Urteil', () => {
    const d = describe([2, 2, 2]);
    assertEqual(d.mean, 2);
    assertEqual(d.normal, null);
    assertEqual(d.adStatAdj, null);
  });
});

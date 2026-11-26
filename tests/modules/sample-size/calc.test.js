/**
 * Stichprobenumfang: Rechnung (domain/calc.js) — erforderliches n wie die
 * Altform (`_calculate`), Kurve wie `_buildPowerCurve`, Deckel 5000.
 */
import { suite, test, assertEqual, assertTrue, assertAlmostEqual } from '../../test-utils.js';
import { analyze, powerCurve, N_CAP } from '../../../js/modules/sample-size/domain/calc.js';

const EFFECT = {
  varianceOne: { sigma0: null, sigmaAlt: null },
  varianceTwo: { ratio: null },
  mean: { delta: null, sigma: null },
};
/** @param {object} o */
const inputs = (o) => ({
  category: 'variance', testType: 'one', direction: 'two-sided', alpha: 0.05, power: 0.8,
  ...o, effect: { ...EFFECT, ...o.effect },
});

suite('sample-size: Rechnung', () => {
  test('Werte der Beispiele (festgehalten an der Altform)', () => {
    const m1 = analyze(inputs({ category: 'mean', effect: { mean: { delta: 0.3, sigma: 0.5 } } }));
    assertEqual(m1.nRequired, 24);
    assertEqual(m1.totalN, 24);
    assertEqual(m1.algoId, 'one-sample-t-test');
    assertAlmostEqual(m1.effectValue, 0.6, 1e-12);
    const m2 = analyze(inputs({ category: 'mean', testType: 'two', effect: { mean: { delta: 0.5, sigma: 0.8 } } }));
    assertEqual(m2.nRequired, 42);
    assertEqual(m2.totalN, 84);
    assertEqual(m2.effectKey, 'cohensD');
    const v1 = analyze(inputs({ direction: 'less', effect: { varianceOne: { sigma0: 1.5, sigmaAlt: 1 } } }));
    assertEqual(v1.nRequired, 23);
    assertEqual(v1.algoId, 'chi-square-variance');
    const v2 = analyze(inputs({ testType: 'two', effect: { varianceTwo: { ratio: 2 } } }));
    assertEqual(v2.nRequired, 68);
    assertEqual(v2.algoId, 'f-test');
    assertEqual(v2.effectValue, 2);
  });

  test('„Kleiner“ mit positivem Δ endet am Deckel', () => {
    const a = analyze(inputs({ category: 'mean', testType: 'two', direction: 'less', alpha: 0.01, power: 0.9, effect: { mean: { delta: 0.5, sigma: 0.8 } } }));
    assertEqual(a.nRequired, N_CAP);
    assertEqual(a.totalN, 2 * N_CAP);
  });

  test('fehlende oder nicht positive Angabe der gewählten Variante → null', () => {
    assertEqual(analyze(inputs({})), null);
    assertEqual(analyze(inputs({ effect: { varianceOne: { sigma0: 1, sigmaAlt: null } } })), null);
    assertEqual(analyze(inputs({ effect: { varianceOne: { sigma0: 1, sigmaAlt: 0 } } })), null);
    assertEqual(analyze(inputs({ effect: { varianceOne: { sigma0: -1, sigmaAlt: 2 } } })), null);
    // Angaben anderer Varianten zählen nicht.
    assertEqual(analyze(inputs({ effect: { mean: { delta: 1, sigma: 1 } } })), null);
  });

  test('gleiche Eingaben liefern dasselbe Ergebnis (gemerkt)', () => {
    const i = inputs({ testType: 'two', effect: { varianceTwo: { ratio: 3 } } });
    assertTrue(analyze(i) === analyze({ ...i }));
  });

  test('Kurve: dichte Punkte, Lösung, Stützstellen, sortiert, Ende bei max(2n, 30)', () => {
    const c = powerCurve((n) => n / 100, 42);
    const ns = c.map((p) => p.n);
    assertEqual(ns[0], 4);
    assertEqual(ns[ns.length - 1], 84);
    for (const n of [42, 21, 32, 5, 10, 50, 75]) assertTrue(ns.includes(n), String(n));
    assertTrue(ns.every((n, i) => i === 0 || n > ns[i - 1]));
    assertEqual(c[1].power, ns[1] / 100);
  });

  test('Kurve am Deckel: Ende 5000, ohne Lösungspunkt', () => {
    const ns = powerCurve(() => 0, N_CAP).map((p) => p.n);
    assertEqual(ns[ns.length - 1], N_CAP);
    assertTrue(!ns.includes(2500));
    assertEqual(powerCurve(() => 0, 3).map((p) => p.n).at(-1), 30);
  });
});

import { suite, test, assertEqual, assertClose } from '../test-utils.js';
import { computePower } from '../../js/modules/hypothesis-test/domain/power.js';
import { powerTwoSampleT, powerChiSquare, powerOneSampleT, findRequiredN } from '../../js/engines/hypothesis-test-engine.js';
import { descriptiveStats } from '../../js/engines/normality-test-engine.js';

const a = [10.1, 10.4, 9.8, 10.2, 10.0];
const b = [10.9, 11.2, 10.7, 11.0, 10.8];
const ds = descriptiveStats;

suite('computePower', () => {
  test('zwei Mittelwerte: Cohen d über die gepoolte Streuung', () => {
    const r = computePower({ category: 'mean', testType: 'two', direction: 'two-sided', powerGoal: 0.8, alpha: 0.05, d1: a, d2: b, target: null });
    const delta = Math.abs(ds(a).mean - ds(b).mean);
    const sp = Math.sqrt(((a.length - 1) * ds(a).variance + (b.length - 1) * ds(b).variance) / (a.length + b.length - 2));
    assertEqual(r.effectKind, 'cohenD');
    assertClose(r.effect, delta / sp, 1e-12);
    assertClose(r.power, powerTwoSampleT(5, 5, delta, sp, 0.05, 'two-sided'), 1e-12);
    assertEqual(r.requiredN, findRequiredN(0.8, (n) => powerTwoSampleT(n, n, delta, sp, 0.05, 'two-sided')));
  });

  test('eine Varianz: Verhältnis s² / σ²₀', () => {
    const r = computePower({ category: 'variance', testType: 'one', direction: 'greater', powerGoal: 0.8, alpha: 0.05, d1: a, d2: null, target: 0.1 });
    assertEqual(r.effectKind, 'varianceRatio');
    assertClose(r.effect, ds(a).variance / 0.1, 1e-12);
    assertClose(r.power, powerChiSquare(5, 0.1, ds(a).variance, 0.05, 'greater'), 1e-12);
  });

  test('gepaart: Cohen d_z gegen das Ziel', () => {
    const d = a.map((x, i) => x - b[i]);
    const r = computePower({ category: 'mean', testType: 'paired', direction: 'less', powerGoal: 0.9, alpha: 0.05, d1: d, d2: null, target: 0 });
    const delta = Math.abs(ds(d).mean);
    assertEqual(r.effectKind, 'cohenDz');
    assertClose(r.power, powerOneSampleT(5, delta, ds(d).stdDev, 0.05, 'less'), 1e-12);
  });
});

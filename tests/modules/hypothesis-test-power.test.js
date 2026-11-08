import { suite, test, assertEqual, assertClose, assertTrue } from '../test-utils.js';
import { computePower } from '../../js/modules/hypothesis-test/domain/power.js';
import { powerTwoSampleT, powerChiSquare, powerFTest, powerOneSampleT, findRequiredN } from '../../js/engines/hypothesis-test-engine.js';
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

/** n Werte mit genau Mittelwert `mean` und Standardabweichung `sd` (symmetrische Gestalt, auf s = 1 normiert). */
function exactSample(n, mean, sd) {
  const z = Array.from({ length: n }, (_, i) => i - (n - 1) / 2);
  const s = Math.sqrt(z.reduce((acc, v) => acc + v * v, 0) / (n - 1));
  return z.map((v) => mean + (sd * v) / s);
}

suite('computePower — Referenzwerte', () => {
  // R: power.t.test(n = 10, delta = 1, sd = 1, type = "one.sample") → power 0.8030, n bei 80 %: 9,94
  test('Ein-Stichproben-Mittelwert: Teststärke 0,80310 und nötiger Umfang 10 (R power.t.test)', () => {
    const d1 = exactSample(10, 6, 1);
    const r = computePower({ category: 'mean', testType: 'one', direction: 'two-sided', powerGoal: 0.8, alpha: 0.05, d1, d2: null, target: 5 });
    assertEqual(r.effectKind, 'cohenD');
    assertClose(r.effect, 1, 1e-12);
    assertClose(r.power, 0.8030962, 5e-6);
    assertEqual(r.requiredN, 10);
  });

  // R: power.t.test(n = 20, delta = 1, sd = 1) → power 0.8689528, n je Gruppe bei 80 %: 16,71
  test('Zwei-Stichproben-Mittelwert: Teststärke 0,86895 und nötiger Umfang 17 je Gruppe (R power.t.test)', () => {
    const r = computePower({
      category: 'mean', testType: 'two', direction: 'two-sided', powerGoal: 0.8, alpha: 0.05,
      d1: exactSample(20, 1, 1), d2: exactSample(20, 0, 1), target: null,
    });
    assertClose(r.effect, 1, 1e-12);
    assertClose(r.power, 0.8689528, 5e-7);
    assertEqual(r.requiredN, 17);
  });

  // R: power.t.test(n = 10, delta = 1, sd = 1, type = "one.sample", alternative = "one.sided") → 0.8975
  test('einseitig ist stärker als zweiseitig bei gleicher Wirkung', () => {
    const args = { category: 'mean', testType: 'one', powerGoal: 0.8, alpha: 0.05, d1: exactSample(10, 6, 1), d2: null, target: 5 };
    const two = computePower({ ...args, direction: 'two-sided' }).power;
    const one = computePower({ ...args, direction: 'greater' }).power;
    assertClose(one, 0.8975, 5e-4);
    assertTrue(one > two, 'einseitig > zweiseitig');
  });

  test('Teststärke wächst mit dem Umfang (Ein-Stichproben-Mittelwert), Bereich 0…1', () => {
    const power = (n) => computePower({ category: 'mean', testType: 'one', direction: 'two-sided', powerGoal: 0.8, alpha: 0.05, d1: exactSample(n, 5.5, 1), d2: null, target: 5 }).power;
    let last = 0;
    for (const n of [4, 6, 10, 20, 50, 100]) {
      const p = power(n);
      assertTrue(p > last && p < 1, `n=${n}: ${p}`);
      last = p;
    }
  });
});

suite('computePower — Zwei-Stichproben-Varianz (Engine-Werte, keine Fremdreferenz)', () => {
  // Es gibt keine R-/Minitab-Referenz für die Teststärke des F-Tests im Repo; geprüft werden
  // Eigenschaften, die die Formel erzwingt: Verhältnis 1 → Teststärke α, Symmetrie, Monotonie in n.
  const run = (s1, s2, n1 = 10, n2 = 10, direction = 'two-sided', alpha = 0.05, goal = 0.8) => computePower({
    category: 'variance', testType: 'two', direction, powerGoal: goal, alpha,
    d1: exactSample(n1, 0, Math.sqrt(s1)), d2: exactSample(n2, 0, Math.sqrt(s2)), target: null,
  });

  test('gleiche Varianzen: Teststärke = α, Effekt 1', () => {
    const r = run(2, 2);
    assertEqual(r.effectKind, 'varianceRatio');
    assertClose(r.effect, 1, 1e-12);
    assertClose(r.power, 0.05, 1e-9);
  });

  test('zweiseitig und gleiche Umfänge: Verhältnis r und 1/r geben dieselbe Teststärke', () => {
    assertClose(run(3, 1).power, run(1, 3).power, 1e-9);
    assertClose(run(3, 1).effect, 3, 1e-12);
  });

  test('Teststärke wächst mit n und mit dem Verhältnis, bleibt in (α, 1)', () => {
    let last = 0.05;
    for (const n of [5, 10, 20, 40, 80]) {
      const p = run(3, 1, n, n).power;
      assertTrue(p > last && p < 1, `n=${n}: ${p}`);
      last = p;
    }
    assertTrue(run(4, 1).power > run(2, 1).power, 'größerer Effekt, mehr Teststärke');
  });

  test('stimmt mit der Engine überein; nötiger Umfang ist das kleinste n, das das Ziel erreicht', () => {
    const r = run(3, 1, 10, 10, 'two-sided', 0.05, 0.8);
    assertClose(r.power, powerFTest(10, 10, 3, 0.05, 'two-sided'), 1e-12);
    assertTrue(powerFTest(r.requiredN, r.requiredN, 3, 0.05, 'two-sided') >= 0.8, 'erreicht');
    assertTrue(powerFTest(r.requiredN - 1, r.requiredN - 1, 3, 0.05, 'two-sided') < 0.8, 'eines weniger nicht');
  });

  test('einseitig: größer fängt das große σ²₁, kleiner nicht', () => {
    assertTrue(run(3, 1, 10, 10, 'greater').power > run(3, 1, 10, 10, 'two-sided').power, 'greater');
    assertTrue(run(3, 1, 10, 10, 'less').power < 0.05, 'less: entgegen der Richtung unter α');
  });
});

suite('computePower — Streuung null', () => {
  // Bis zu computePower kommt eine konstante Stichprobe nicht: analyze() fängt sie vorher als
  // „nicht berechenbar“ ab (siehe hypothesis-test-analyze.test.js). Hier wird festgehalten, was die
  // reine Rechnung bei σ = 0 selbst liefert: der Effekt ist 0 (nicht NaN), die Teststärke hat keinen Sinn.
  test('σ = 0 (Ein-Stichproben-Mittelwert): Effekt 0 statt NaN', () => {
    const r = computePower({ category: 'mean', testType: 'one', direction: 'two-sided', powerGoal: 0.8, alpha: 0.05, d1: [5, 5, 5, 5], d2: null, target: 4 });
    assertEqual(r.effect, 0);
  });
  test('sp = 0 (Zwei-Stichproben-Mittelwert): Effekt 0 statt NaN', () => {
    const r = computePower({ category: 'mean', testType: 'two', direction: 'two-sided', powerGoal: 0.8, alpha: 0.05, d1: [5, 5, 5, 5], d2: [6, 6, 6, 6], target: null });
    assertEqual(r.effect, 0);
  });
});

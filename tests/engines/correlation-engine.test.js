/**
 * D.Mike — Correlation Engine — Unit Tests
 *
 * Confidence intervals on the Fisher z scale: Pearson uses se = 1/√(n−3),
 * Spearman the Bonett–Wright (2000) adjustment se = √((1 + r²/2)/(n−3))
 * that Minitab applies (finding C2-010).
 */

import { suite, test, assertAlmostEqual, assertTrue } from '../test-utils.js';
import { fisherCI, spearmanCI } from '../../js/engines/correlation-engine.js';

suite('Correlation Engine — confidence intervals', () => {
  test('Pearson CI: Fisher z with se = 1/√(n−3)', () => {
    // r = 0.8699639, n = 15, α = 0.05 → tanh(atanh(r) ∓ 1.959964/√12)
    const [lo, hi] = fisherCI(0.8699639, 15, 0.05);
    assertAlmostEqual(lo, 0.6452623310256075, 1e-8);
    assertAlmostEqual(hi, 0.9561280879631472, 1e-8);
  });

  test('Spearman CI: Bonett–Wright se (statpsych ci.spear example)', () => {
    // R statpsych::ci.spear(.05, .8699639, 15) → [0.5841, 0.9638]
    const [lo, hi] = spearmanCI(0.8699639, 15, 0.05);
    assertAlmostEqual(lo, 0.5840950833644082, 1e-8);
    assertAlmostEqual(hi, 0.9638296729158542, 1e-8);
  });

  test('Spearman CI is wider than the Pearson CI for the same r and n', () => {
    const [pLo, pHi] = fisherCI(-0.4, 30, 0.05);
    const [sLo, sHi] = spearmanCI(-0.4, 30, 0.05);
    assertTrue(sLo < pLo, `Spearman lower ${sLo} should be below Pearson lower ${pLo}`);
    assertTrue(sHi > pHi, `Spearman upper ${sHi} should be above Pearson upper ${pHi}`);
  });
});

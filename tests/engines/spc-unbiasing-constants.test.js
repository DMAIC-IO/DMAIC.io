/**
 * D.Mike — SPC unbiasing constants (generated table)
 * Minitab's printed values where Minitab publishes them, numerical values
 * beyond. Source: Minitab, Methods and formulas for the Individuals chart.
 */
import { suite, test, assert, assertEqual } from '../test-utils.js';
import { D2, D3, D4, C4_PRIME } from '../../js/engines/spc-unbiasing-constants.js';

suite('SPC unbiasing constants — Minitab table values', () => {
  test('table sizes: n = 2 … 100, N = 2 … 500', () => {
    assertEqual(D2.length, 101);
    assertEqual(D3.length, 101);
    assertEqual(D4.length, 101);
    assertEqual(C4_PRIME.length, 501);
    assertEqual(D2[1], null);
    assertEqual(C4_PRIME[1], null);
  });

  test('printed d2/d3/d4 are used as printed', () => {
    assertEqual(D2[2], 1.128);
    assertEqual(D2[5], 2.326);
    assertEqual(D2[25], 3.931);
    assertEqual(D2[50], 4.498);
    assertEqual(D3[2], 0.8525);
    assertEqual(D3[5], 0.8641);
    assertEqual(D4[2], 0.954);
    assertEqual(D4[21], 3.73);
    assertEqual(D4[25], 3.883);
  });

  test("c4′ spot values", () => {
    assertEqual(C4_PRIME[2], 0.79785);
    assertEqual(C4_PRIME[3], 0.87153);
    assertEqual(C4_PRIME[85], 0.995489);
    assertEqual(C4_PRIME[500], 0.999124);
  });
});

suite('SPC unbiasing constants — numerical continuation', () => {
  test('d2 and d4 rise with n up to 100; d3 falls from n = 4 on', () => {
    for (let n = 3; n <= 100; n++) {
      assert(D2[n] > D2[n - 1], `d2(${n}) > d2(${n - 1})`);
      assert(D4[n] > D4[n - 1], `d4(${n}) > d4(${n - 1})`);
      if (n >= 4) assert(D3[n] < D3[n - 1], `d3(${n}) < d3(${n - 1})`);
    }
  });

  test('values right after the printed table connect smoothly', () => {
    assert(Math.abs(D2[51] - 4.5136) < 1e-4, `d2(51) = ${D2[51]}`);
    assert(Math.abs(D3[26] - 0.7050) < 1e-4, `d3(26) = ${D3[26]}`);
    assert(Math.abs(D4[26] - 3.9159) < 1e-4, `d4(26) = ${D4[26]}`);
  });

  test("c4′ rises towards 1", () => {
    for (let N = 3; N <= 500; N++) assert(C4_PRIME[N] >= C4_PRIME[N - 1], `c4′(${N})`);
    assert(C4_PRIME[500] < 1);
  });
});

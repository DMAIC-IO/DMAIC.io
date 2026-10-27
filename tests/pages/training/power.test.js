/**
 * Power helpers of lesson 6: alarm limits, exact two-sided power, required n,
 * plus seeded alarm shares against theory.
 */
import { suite, test, assertClose, assertEqual, assertTrue } from '../../test-utils.js';
import { mulberry32 } from '../../../js/engines/random-variates-engine.js';
import { drawSample } from '../../../js/pages/training/processes.js';
import { alarmLimits, isAlarm, exactPower, requiredN } from '../../../js/pages/training/power.js';

/** Share of seeded checks (n packs, machine drifted by delta) that raise an alarm at α 5 %. */
function alarmShare(delta, n, seed = 1, checks = 10000) {
  const rng = mulberry32(seed);
  const limits = alarmLimits(500, 2, n, 0.05);
  let alarms = 0;
  for (let i = 0; i < checks; i++) {
    const values = drawSample('fill-a', n, rng);
    const mean = values.reduce((a, b) => a + b, 0) / values.length + delta;
    if (isAlarm(mean, limits)) alarms++;
  }
  return alarms / checks;
}

suite('power', () => {
  test('alarm limits at n 10', () => {
    const { lower, upper } = alarmLimits(500, 2, 10, 0.05);
    assertClose(lower, 498.760, 1e-3);
    assertClose(upper, 501.240, 1e-3);
  });

  test('power matches the reference table', () => {
    const table = {
      10: [0.124, 0.353, 0.660, 0.885],
      20: [0.201, 0.609, 0.918, 0.994],
      40: [0.353, 0.885, 0.997, 1.000],
      43: [0.374, 0.906, 0.998, 1.000],
    };
    for (const [n, row] of Object.entries(table)) {
      [0.5, 1, 1.5, 2].forEach((delta, i) => {
        assertClose(exactPower(delta, 2, Number(n), 0.05), row[i], 1e-3, `n ${n}, δ ${delta}`);
      });
    }
    assertClose(exactPower(1, 2, 10, 0.01), 0.160, 1e-3);
    assertClose(exactPower(1, 2, 10, 0.1), 0.475, 1e-3);
  });

  test('power at zero drift is alpha', () => {
    for (const a of [0.01, 0.05, 0.1]) assertClose(exactPower(0, 2, 10, a), a, 1e-6);
  });

  test('four times the packs act like twice the drift', () => {
    assertClose(exactPower(1, 2, 40, 0.05), exactPower(2, 2, 10, 0.05), 1e-12);
  });

  test('required n rounds up', () => {
    assertEqual(requiredN(1, 2, 0.05, 0.9), 43);
    assertTrue(exactPower(1, 2, 42, 0.05) < 0.9);
    assertTrue(exactPower(1, 2, 43, 0.05) > 0.9);
  });

  test('seeded alarm shares match theory', () => {
    assertClose(alarmShare(0, 10), 0.050, 0.007);
    assertClose(alarmShare(1, 10), 0.353, 0.015);
    assertClose(alarmShare(2, 10), 0.885, 0.01);
    assertClose(alarmShare(1, 43), 0.906, 0.009);
  });
});

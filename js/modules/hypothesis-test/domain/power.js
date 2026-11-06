/**
 * D.Mike — Hypothesentest: Teststärke, Effektstärke und nötiger Umfang
 * (domain/power.js). Reine Rechnung, keine Oberfläche, keine Übersetzung.
 */
import {
  powerChiSquare, powerFTest, powerOneSampleT, powerTwoSampleT, findRequiredN,
} from '../../../engines/hypothesis-test-engine.js';
import { descriptiveStats } from '../../../engines/normality-test-engine.js';

/**
 * Teststärke, Effektstärke und nötiger Umfang als Zahlen.
 * @param {object} p
 * @param {'mean'|'variance'} p.category Fragestellung
 * @param {'one'|'two'|'paired'} p.testType Stichprobenart
 * @param {string} p.direction 'two-sided' | 'less' | 'greater'
 * @param {number} p.powerGoal gewünschte Teststärke
 * @param {number} p.alpha Signifikanzniveau
 * @param {number[]} p.d1 erste Stichprobe
 * @param {number[]|null} p.d2 zweite Stichprobe (nur Zwei-Stichproben)
 * @param {number|null} p.target Sollwert bzw. Sollvarianz
 * @returns {{ power: number, effect: number, effectKind: 'varianceRatio'|'cohenD'|'cohenDz', requiredN: number }}
 */
export function computePower({ category, testType, direction, powerGoal, alpha, d1, d2, target }) {
  const dir = direction;
  const n1 = d1.length;
  const goal = powerGoal;
  const ds = (a) => descriptiveStats(a);
  let power, effect, effectKind, requiredN;

  if (category === 'variance') {
    if (testType === 'one') {
      const s2 = ds(d1).variance;
      effect = s2 / target;
      power = powerChiSquare(n1, target, s2, alpha, dir);
      effectKind = 'varianceRatio';
      requiredN = findRequiredN(goal, n => powerChiSquare(n, target, s2, alpha, dir));
    } else {
      const s1 = ds(d1).variance, s2 = ds(d2).variance;
      effect = s1 / s2;
      power = powerFTest(n1, d2.length, effect, alpha, dir);
      effectKind = 'varianceRatio';
      requiredN = findRequiredN(goal, n => powerFTest(n, n, effect, alpha, dir));
    }
  } else {
    const sigma = ds(d1).stdDev;
    if (testType === 'one' || testType === 'paired') {
      const delta = Math.abs(ds(d1).mean - target);
      effect = sigma > 0 ? delta / sigma : 0;
      power = powerOneSampleT(n1, delta, sigma, alpha, dir);
      effectKind = testType === 'paired' ? 'cohenDz' : 'cohenD';
      requiredN = findRequiredN(goal, n => powerOneSampleT(n, delta, sigma, alpha, dir));
    } else {
      const delta = Math.abs(ds(d1).mean - ds(d2).mean);
      const sp = Math.sqrt(((d1.length - 1) * ds(d1).variance + (d2.length - 1) * ds(d2).variance) / (d1.length + d2.length - 2));
      effect = sp > 0 ? delta / sp : 0;
      power = powerTwoSampleT(n1, d2.length, delta, sp, alpha, dir);
      effectKind = 'cohenD';
      requiredN = findRequiredN(goal, n => powerTwoSampleT(n, n, delta, sp, alpha, dir));
    }
  }

  return { power, effect, effectKind, requiredN };
}

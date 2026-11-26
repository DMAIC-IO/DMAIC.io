/**
 * D.Mike — Stichprobenumfang: Register der Varianten.
 *
 * Kategorie und Testtyp wählen eine Variante; jede hat eigene Effektangaben
 * (Regel M6). Das Literal `effect` im Model-Schema muss genau diese
 * Schlüssel tragen (Unit-Test). Rein, ohne DOM und i18n.
 */
import {
  powerChiSquare, powerFTest, powerOneSampleT, powerTwoSampleT,
} from '../../../engines/hypothesis-test-engine.js';

/**
 * @typedef {'varianceOne'|'varianceTwo'|'mean'} VariantId
 * @typedef {'two-sided'|'greater'|'less'} Direction
 * @typedef {(n: number) => number} PowerFn
 */

/**
 * @typedef {object} Variant
 * @property {readonly string[]} params Schlüssel der Effektangaben unter `effect.<id>`
 * @property {'varianceRatio'|'cohensD'} effectKey Name der Effektgröße (i18n-Schlüssel)
 * @property {(p: Record<string, number>) => number} effectValue Effektgröße aus den Angaben
 * @property {(p: Record<string, number>, two: boolean, alpha: number, dir: Direction) => PowerFn} powerFn
 */

/** @type {Readonly<Record<VariantId, Variant>>} */
export const VARIANTS = Object.freeze({
  varianceOne: Object.freeze({
    params: Object.freeze(['sigma0', 'sigmaAlt']),
    effectKey: 'varianceRatio',
    effectValue: (p) => (p.sigmaAlt * p.sigmaAlt) / (p.sigma0 * p.sigma0),
    powerFn: (p, _two, alpha, dir) => {
      const s0 = p.sigma0 * p.sigma0;
      const s1 = p.sigmaAlt * p.sigmaAlt;
      return (n) => powerChiSquare(n, s0, s1, alpha, dir);
    },
  }),
  varianceTwo: Object.freeze({
    params: Object.freeze(['ratio']),
    effectKey: 'varianceRatio',
    effectValue: (p) => p.ratio,
    powerFn: (p, _two, alpha, dir) => (n) => powerFTest(n, n, p.ratio, alpha, dir),
  }),
  mean: Object.freeze({
    params: Object.freeze(['delta', 'sigma']),
    effectKey: 'cohensD',
    effectValue: (p) => p.delta / p.sigma,
    powerFn: (p, two, alpha, dir) => (two
      ? (n) => powerTwoSampleT(n, n, p.delta, p.sigma, alpha, dir)
      : (n) => powerOneSampleT(n, p.delta, p.sigma, alpha, dir)),
  }),
});

/** Die Ids der Varianten in Schema-Reihenfolge. */
export const VARIANT_IDS = Object.freeze(/** @type {VariantId[]} */ (Object.keys(VARIANTS)));

/**
 * Die Variante zu Kategorie und Testtyp.
 * @param {'variance'|'mean'} category
 * @param {'one'|'two'} testType
 * @returns {VariantId}
 */
export function variantOf(category, testType) {
  if (category === 'mean') return 'mean';
  return testType === 'two' ? 'varianceTwo' : 'varianceOne';
}

/**
 * Das Verfahren im Algorithm Lab zu Kategorie und Testtyp.
 * @param {'variance'|'mean'} category
 * @param {'one'|'two'} testType
 * @returns {'chi-square-variance'|'f-test'|'one-sample-t-test'|'two-sample-t-test'}
 */
export function algoIdOf(category, testType) {
  if (category === 'variance') return testType === 'two' ? 'f-test' : 'chi-square-variance';
  return testType === 'two' ? 'two-sample-t-test' : 'one-sample-t-test';
}

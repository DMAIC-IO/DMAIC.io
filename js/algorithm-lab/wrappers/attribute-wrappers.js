/**
 * D.Mike — Attribute test Algorithm-Lab wrappers (attribute-wrappers.js)
 *
 * Thin adapters between the flat fixture/try-it input shape of the attribute
 * lab entries and engine functions that take an options object. No
 * computation here, only reshaping.
 *
 * The lab maps `signature.parameters` positionally (`mapArgs()` in
 * `lab-exec.js`). An entry with a single parameter whose name is not a key of
 * the inputs receives the whole input object, which is how the wrapper below
 * gets `{ x1, t1, x2, t2, direction, alpha, pooled, diff0 }`.
 */

import { twoPoissonRateTest } from '../../engines/attribute-test-engine.js';

/**
 * 2-sample Poisson rate test from a flat input object.
 * @param {{ x1: number, t1: number, x2: number, t2: number,
 *   direction?: string, alpha?: number, pooled?: boolean, diff0?: number }} inputs
 * @returns {object} result of `twoPoissonRateTest()`
 */
export function twoPoissonRateTestFlat(inputs) {
  const { x1, t1, x2, t2, direction, alpha, pooled, diff0 } = inputs;
  return twoPoissonRateTest(x1, t1, x2, t2, { direction, alpha, pooled, diff0 });
}

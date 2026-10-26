/**
 * D.Mike — DoE Planner: full factorial (designs/full.js)
 * Pure description of the design type; the matrix comes from the engine.
 */
import { OK } from './check.js';

/** @type {import('./index.js').DesignType} */
const full = {
  id: 'full',
  centerPoints: true,
  twoLevelOnly: false,
  dispersion: true,
  /** @returns {{ok: boolean, reason: ?string}} always OK — the type-independent rules suffice */
  check() { return OK; },
  /** @param {object} model @param {{sourceRowCount: number}} env @returns {boolean} */
  isValid(model, env) { return full.check(model, env).ok; },
  /**
   * @param {object} model
   * @returns {number} 2^k for two-level factors, else the product of level counts; +3 with center points
   */
  runs(model) {
    const k = model.factors.length;
    const allTwo = model.factors.every((f) => f.levels.length === 2);
    return (allTwo ? Math.pow(2, k) : model.factors.reduce((p, f) => p * f.levels.length, 1))
      + (model.options.centerPoints ? 3 : 0);
  },
  /** @returns {string} */
  resolution() { return 'Full'; },
};

export default full;

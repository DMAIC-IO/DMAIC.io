/**
 * D.Mike — DoE Planner: central composite design (designs/ccd.js)
 */
import { OK } from './check.js';

/** @type {import('./index.js').DesignType} */
const ccd = {
  id: 'ccd',
  centerPoints: false,
  twoLevelOnly: false,
  dispersion: true,
  /** @returns {{ok: boolean, reason: ?string}} always OK */
  check() { return OK; },
  /** @param {object} model @param {{sourceRowCount: number}} env @returns {boolean} */
  isValid(model, env) { return ccd.check(model, env).ok; },
  /** @param {object} model @returns {number} 2^k + 2k + CCD center points (default 3) */
  runs(model) {
    const k = model.factors.length;
    return Math.pow(2, k) + 2 * k + (model.options.ccdCenterPoints || 3);
  },
  /** @returns {string} */
  resolution() { return 'CCD'; },
};

export default ccd;

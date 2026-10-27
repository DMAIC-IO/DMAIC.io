/**
 * D.Mike — DoE Planner: Box-Behnken (designs/bb.js)
 *
 * Spec: docs/superpowers/specs/2026-10-25-doe-planner-teil-viewmodels-design.md (E2)
 */
import { BOX_BEHNKEN } from '../doe-planner-designs.js';
import { OK, fail } from './check.js';

/** @type {import('./index.js').DesignType} */
const bb = {
  id: 'bb',
  centerPoints: false,
  twoLevelOnly: false,
  dispersion: true,
  /** @param {object} model @returns {{ok: boolean, reason: ?string}} */
  check(model) { return bb.available(model) ? OK : fail('bbUnavailable'); },
  /** @param {object} model @param {{sourceRowCount: number}} env @returns {boolean} */
  isValid(model, env) { return bb.check(model, env).ok; },
  /** @param {object} model @returns {number|'?'} pairs × 4 + BB center points (default 3) */
  runs(model) {
    const pairs = BOX_BEHNKEN[model.factors.length];
    return pairs ? pairs.length * 4 + (model.options.bbCenterPoints || 3) : '?';
  },
  /** @returns {string} */
  resolution() { return 'BB'; },
  /** @param {object} model @returns {boolean} a Box-Behnken table exists for this factor count */
  available(model) { return Boolean(BOX_BEHNKEN[model.factors.length]); },
};

export default bb;

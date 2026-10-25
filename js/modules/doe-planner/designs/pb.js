/**
 * D.Mike — DoE Planner: Plackett-Burman (designs/pb.js)
 *
 * Spec: docs/superpowers/specs/2026-10-25-doe-planner-teil-viewmodels-design.md (E2)
 */
import { OK, fail, hasMultiLevel } from './check.js';

/** @type {import('./index.js').DesignType} */
const pb = {
  id: 'pb',
  centerPoints: true,
  twoLevelOnly: true,
  dispersion: true,
  /** @param {object} model @returns {{ok: boolean, reason: ?string}} */
  check(model) {
    if (hasMultiLevel(model)) return fail('twoLevelOnly');
    if (model.selectedPBIdx === null) return fail('noPBDesign');
    return OK;
  },
  /** @param {object} model @param {{sourceRowCount: number}} env @returns {boolean} */
  isValid(model, env) { return pb.check(model, env).ok; },
  /** @param {object} model @returns {number} next multiple of 4 above k, +3 with center points */
  runs(model) {
    const k = model.factors.length;
    let n = Math.ceil((k + 1) / 4) * 4;
    if (n <= k) n += 4;
    return n + (model.options.centerPoints ? 3 : 0);
  },
  /** @returns {string} */
  resolution() { return 'III'; },
};

export default pb;

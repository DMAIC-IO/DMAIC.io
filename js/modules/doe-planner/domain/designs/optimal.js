/**
 * D.Mike — DoE Planner: D-/A-/G-optimal designs (designs/optimal.js)
 * One module for all three criteria; the criterion is model.designType.
 */
import { minRunsForTerms } from '../../../../engines/doe-planner-engine.js';
import { OK, fail } from './check.js';

const LABELS = { dopt: 'D-Opt', aopt: 'A-Opt', gopt: 'G-Opt' };

/** @type {import('./registry.js').DesignType & Record<string, any>} */
const optimal = {
  id: 'optimal',
  centerPoints: false,
  twoLevelOnly: false,
  dispersion: true,
  /** @param {object} model @param {{sourceRowCount: number}} env @returns {{ok: boolean, reason: ?string}} */
  check(model, env) {
    const nNew = model.options.optimalRuns || 0;
    return nNew < optimal.minNewRuns(model, env) ? fail('tooFewOptimalRuns') : OK;
  },
  /** @param {object} model @param {{sourceRowCount: number}} env @returns {boolean} */
  isValid(model, env) { return optimal.check(model, env).ok; },
  /** @param {object} model @returns {number} the requested runs, else the minimum */
  runs(model) { return model.options.optimalRuns || optimal.minRuns(model); },
  /** @param {object} model @returns {string} 'D-Opt', 'A-Opt' or 'G-Opt' */
  resolution(model) { return LABELS[model.designType] || ''; },

  /** @param {object} model @returns {number} runs the active model terms need */
  minRuns(model) { return minRunsForTerms(model.getActiveTerms()); },
  /**
   * New runs needed on top of a source worksheet (at least 1 when there is one).
   * @param {object} model
   * @param {{sourceRowCount: number}} env
   * @returns {number}
   */
  minNewRuns(model, env) {
    const minRuns = optimal.minRuns(model);
    const m = env.sourceRowCount;
    return m > 0 ? Math.max(1, minRuns - m) : minRuns;
  },
  /**
   * The minimum number of runs the active terms and the source need.
   * @param {object} model
   * @param {{sourceRowCount: number}} env
   * @returns {number}
   */
  minOptimalRuns(model, env) {
    return optimal.minNewRuns(model, env);
  },
};

export default optimal;

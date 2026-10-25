/**
 * D.Mike — DoE Planner: D-/A-/G-optimal designs (designs/optimal.js)
 * One module for all three criteria; the criterion is model.designType.
 *
 * Spec: docs/superpowers/specs/2026-10-25-doe-planner-teil-viewmodels-design.md (E2)
 */
import { minRunsForTerms } from '../../../engines/doe-planner-engine.js';
import { OK, fail } from './check.js';

const LABELS = { dopt: 'D-Opt', aopt: 'A-Opt', gopt: 'G-Opt' };

/** @type {import('./index.js').DesignType} */
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
   * Raise the requested runs to the minimum the active terms and the source
   * need; never lowers them.
   * @param {object} model
   * @param {{sourceRowCount: number}} env
   * @returns {void}
   */
  raiseRunsToMinimum(model, env) {
    const minNew = optimal.minNewRuns(model, env);
    if ((model.options.optimalRuns || 0) < minNew) model.options.optimalRuns = minNew;
  },
};

export default optimal;

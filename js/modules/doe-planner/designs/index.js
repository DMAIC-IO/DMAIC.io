/**
 * D.Mike — DoE Planner: design-type registry (designs/index.js)
 *
 * One pure module per design type describes what makes the type: its
 * validity rule, its run count, its resolution label and its own helpers.
 * Nothing outside designs/ branches on model.designType except assignments
 * and designOf(). The matrices still come from the engine.
 *
 * Spec: docs/superpowers/specs/2026-10-25-doe-planner-teil-viewmodels-design.md (E2)
 */
import full from './full.js';
import frac from './frac.js';
import pb from './pb.js';
import ccd from './ccd.js';
import bb from './bb.js';
import taguchi from './taguchi.js';
import optimal from './optimal.js';
import { fail } from './check.js';

/**
 * @typedef {object} DesignType
 * @property {string} id
 * @property {boolean} centerPoints  the general center-point option applies (+3 runs)
 * @property {boolean} twoLevelOnly  excluded when a factor has more than two levels
 * @property {boolean} dispersion  the dispersion analysis applies
 * @property {function(object, {sourceRowCount: number}): {ok: boolean, reason: ?string}} check
 * @property {function(object, {sourceRowCount: number}): boolean} isValid
 * @property {function(object): (number|'?')} runs  runs before replicates
 * @property {function(object): string} resolution
 */

/** Design type by model.designType, in the order of the type picker. */
export const DESIGNS = Object.freeze({
  full, frac, pb, ccd, bb, taguchi, dopt: optimal, aopt: optimal, gopt: optimal,
});

/** Every valid model.designType. */
export const DESIGN_KEYS = Object.freeze(Object.keys(DESIGNS));

/**
 * @param {{designType: string}} model
 * @returns {?DesignType} the type module, null for an empty or unknown type
 */
export function designOf(model) {
  return Object.prototype.hasOwnProperty.call(DESIGNS, model.designType) ? DESIGNS[model.designType] : null;
}

/**
 * Type-independent rules first, then the type's own check.
 * @param {object} model a State
 * @param {{sourceRowCount: number}} env
 * @returns {{ok: boolean, reason: ?string}}
 */
export function checkConfig(model, env) {
  const m = model;
  if (m.factors.length < 2) return fail('tooFewFactors');
  if (m.hasDuplicateFactorNames()) return fail('duplicateFactorNames');
  if (!m.factors.every((f) =>
    f.name.trim() !== ''
    && f.levels.length >= 2 && f.levels[0] !== '' && f.levels[f.levels.length - 1] !== ''
  )) return fail('incompleteFactor');
  if (m.responses.length < 1) return fail('noResponse');
  if (!m.responses.every((r) => r.name.trim() !== '')) return fail('unnamedResponse');
  const type = designOf(m);
  if (!type) return fail('noDesignType');
  return type.check(m, env);
}

/**
 * Planned runs including replicates.
 * @param {object} model a State
 * @returns {?number} null while the type gives no number (no type, frac without a cell, bb without pairs)
 */
export function plannedRuns(model) {
  const type = designOf(model);
  const runs = type ? type.runs(model) : null;
  if (typeof runs !== 'number') return null;
  return runs * (model.options.replicates || 1);
}

/**
 * D.Mike — DoE Planner: check results shared by the design-type modules (designs/check.js)
 * Pure. Lives apart from designs/index.js so the type modules never import the registry.
 */

/** A passed check. */
export const OK = Object.freeze({ ok: true, reason: null });

/**
 * A failed check with its reason code.
 * @param {string} reason e.g. 'noResolution'
 * @returns {{ok: false, reason: string}}
 */
export function fail(reason) {
  return { ok: false, reason };
}

/**
 * @param {{factors: Array<{levels: string[]}>}} model
 * @returns {boolean} true when any factor has more than two levels
 */
export function hasMultiLevel(model) {
  return model.factors.some((f) => f.levels.length > 2);
}

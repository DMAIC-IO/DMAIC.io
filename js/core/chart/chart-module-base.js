/**
 * D.Mike — Chart-module anchor poll (chart-module-base.js)
 *
 * Remainder of the former shared chart-module lifecycle: only the bounded
 * rAF anchor poll `whenAnchor` is left, for `short-run-chart`. The file goes
 * away with that module's conversion.
 */

/**
 * Bounded rAF-poll for a templated host. Alpine may materialise an x-if / x-for
 * host across several reactive flush cycles, so poll (bounded) until it exists.
 * Aborts if a newer render started (stale-gen guard).
 *
 * @param {object} module   createModule closure object (provides `_container`).
 * @param {object} instance live Alpine instance (provides `_renderGen`).
 * @param {string} selector
 * @param {number} gen
 * @param {number} [maxFrames]
 * @returns {Promise<Element|null>}
 */
export function whenAnchor(module, instance, selector, gen, maxFrames = 30) {
  return new Promise((resolve) => {
    const tick = (left) => {
      if (gen !== instance._renderGen) { resolve(null); return; }
      const el = module._container ? module._container.querySelector(selector) : null;
      if (el) { resolve(el); return; }
      if (left <= 0) { resolve(null); return; }
      requestAnimationFrame(() => tick(left - 1));
    };
    tick(maxFrames);
  });
}

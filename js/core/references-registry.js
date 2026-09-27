/**
 * Module references registry — stable API over the auto-generated REFS map
 * (references-registry.generated.js, produced by tools/build/references-data.mjs).
 * All reference lists are eagerly bundled into app.min.js; no runtime import.
 *
 * A reference entry is a CSL-JSON subset — see
 * docs/superpowers/specs/2026-09-27-module-references-tab-design.md.
 */
import { REFS } from './references-registry.generated.js';

/**
 * Resolve a module's reference list (the `<id>-references.js` default export).
 * Async to mirror the module-help contract at call sites.
 * @param {string} id - module id
 * @returns {Promise<object[]>} the entries, or [] when the module ships none
 */
export function getModuleReferences(id) {
  return Promise.resolve(REFS[id] ?? []);
}

/** @param {string} id @returns {boolean} whether the module ships references. */
export function hasModuleReferences(id) {
  return Object.prototype.hasOwnProperty.call(REFS, id);
}

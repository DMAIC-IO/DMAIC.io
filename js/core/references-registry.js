/**
 * Module references registry — stable API over the auto-generated REFS map
 * (references-registry.generated.js, produced by tools/build/references-data.mjs)
 * for modules in the old form, and over ModuleResources
 * (resources/data/references.json, books resolved) for modules in the new form.
 *
 * A reference entry is a CSL-JSON subset.
 */
import { REFS } from './references-registry.generated.js';

/** @type {{ url(id: string, file: string): string|undefined, references(id: string): Promise<object[]> } | null} */
let resources = null;

/**
 * ModuleResources verbinden (Kernel beim Start); `null` trennt wieder (Tests).
 * @param {{ url(id: string, file: string): string|undefined, references(id: string): Promise<object[]> } | null} r
 */
export function connectReferenceResources(r) {
  resources = r;
}

/**
 * Resolve a module's reference list.
 * @param {string} id - module id
 * @returns {Promise<object[]>} the entries, or [] when the module ships none
 */
export function getModuleReferences(id) {
  if (Object.hasOwn(REFS, id)) return Promise.resolve(REFS[id]);
  if (resources?.url(id, 'data/references.json')) return resources.references(id);
  return Promise.resolve([]);
}

/** @param {string} id @returns {boolean} whether the module ships references. */
export function hasModuleReferences(id) {
  return Object.hasOwn(REFS, id) || Boolean(resources?.url(id, 'data/references.json'));
}

/**
 * Module help registry — stable API over the auto-generated HELP map
 * (help-registry.generated.js, produced by tools/build/help-data.mjs). All
 * handbooks are eagerly bundled into app.min.js; no runtime import.
 */
import { HELP } from './help-registry.generated.js';

/**
 * Resolve a module's handbook (the `<id>-help.js` default export), or null if
 * the module ships no help. Async to preserve the historical `() => help()`
 * contract at call sites.
 * @param {string} id - module id
 * @returns {Promise<object|null>}
 */
export function getModuleHelp(id) {
  return Promise.resolve(HELP[id] ?? null);
}

/** @param {string} id @returns {boolean} whether the module ships a handbook. */
export function hasModuleHelp(id) {
  return Object.prototype.hasOwnProperty.call(HELP, id);
}

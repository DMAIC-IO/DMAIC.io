/**
 * Help registry — stable API over the auto-generated HELP map
 * (help-registry.generated.js, produced by tools/build/help-data.mjs). All
 * handbooks are eagerly bundled into app.min.js; no runtime import.
 *
 * The map holds the module handbooks from `js/modules/<id>/<id>-help.js`.
 * They resolve through the functions below — nobody imports the generated
 * file directly.
 */
import { HELP } from './help-registry.generated.js';

/**
 * Resolve a handbook (the `<id>-help.js` default export), or null if there is
 * none under that id. Async to preserve the historical `() => help()`
 * contract at call sites.
 * @param {string} id - module id
 * @returns {Promise<object|null>}
 */
export function getModuleHelp(id) {
  return Promise.resolve(HELP[id] ?? null);
}

/** @param {string} id @returns {boolean} whether a handbook exists under that id. */
export function hasModuleHelp(id) {
  return Object.prototype.hasOwnProperty.call(HELP, id);
}

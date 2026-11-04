/**
 * Help registry — stable API over the auto-generated HELP map
 * (help-registry.generated.js, produced by tools/build/help-data.mjs) for
 * modules in the old form, and over ModuleResources (resources/i18n/help.<lang>.json)
 * for modules in the new form. The kernel connects ModuleResources at boot.
 */
import { HELP } from './help-registry.generated.js';

/** @type {{ url(id: string, file: string): string|undefined, help(id: string, lang: string): Promise<object|null> } | null} */
let resources = null;

/**
 * ModuleResources verbinden (Kernel beim Start); `null` trennt wieder (Tests).
 * @param {{ url(id: string, file: string): string|undefined, help(id: string, lang: string): Promise<object|null> } | null} r
 */
export function connectHelpResources(r) {
  resources = r;
}

/**
 * Resolve a handbook, or null if there is none under that id.
 * Old form: the `<id>-help.js` default export (all languages). New form: only `lang`.
 * @param {string} id - module id
 * @param {string} [lang] - active language; new form without it: 'en'
 * @returns {Promise<object|null>}
 */
export function getModuleHelp(id, lang) {
  if (Object.hasOwn(HELP, id)) return Promise.resolve(HELP[id]);
  if (resources?.url(id, 'i18n/help.de.json')) return resources.help(id, lang ?? 'en');
  return Promise.resolve(null);
}

/** @param {string} id @returns {boolean} whether a handbook exists under that id. */
export function hasModuleHelp(id) {
  return Object.hasOwn(HELP, id) || Boolean(resources?.url(id, 'i18n/help.de.json'));
}

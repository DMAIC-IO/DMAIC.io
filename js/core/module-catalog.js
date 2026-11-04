/**
 * D.Mike — Modulkatalog zur Laufzeit (module-catalog.js)
 *
 * Macht aus einer Modulbeschreibung (`js/modules/<id>/module.js`)
 * einen Eintrag der ModuleRegistry: dieselben Felder wie ein
 * manifest.js-Eintrag, dazu `form: 'module'`. Die Registry erkennt daran,
 * dass vor dem ersten `init()` Templates, CSS und UI-Texte nachzuladen sind.
 */

/**
 * @param {import('./module-descriptor.js').ModuleDescriptor} descriptor
 * @returns {object} Registry-Eintrag (`tile` heißt dort `loadTile`)
 */
export function fromDescriptor(descriptor) {
  const { tile, ...rest } = descriptor;
  return { ...rest, form: 'module', ...(tile ? { loadTile: tile } : {}) };
}

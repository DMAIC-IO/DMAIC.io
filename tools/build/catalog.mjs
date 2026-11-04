/**
 * Modulkatalog.
 *
 * - `js/modules/catalog.generated.js`: alle Registry-Einträge — die alten aus
 *   manifest.js, die neuen aus `js/modules/<id>/module.js` der Module in
 *   CONVERTED_MODULES (über `fromDescriptor`). Ersetzt manifest.js als
 *   Quelle der Laufzeit; manifest.js entfällt in Teilprojekt G.
 * - `js/modules/catalog.<lang>.json`: je umgestelltem Modul `name`,
 *   `description`, `whenToUse` aus `resources/i18n/ui.<lang>.json` — damit
 *   Menü und `catalog.read` die Namen kennen, ohne das Modul zu laden.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Sprachen, für die catalog.<lang>.json entsteht. */
export const CATALOG_LANGS = Object.freeze(['de', 'en']);

/** Schlüssel aus ui.<lang>.json, die in den Katalog wandern. */
export const CATALOG_TEXT_KEYS = Object.freeze(['name', 'description', 'whenToUse']);

/**
 * Quelltext von js/modules/catalog.generated.js.
 * @param {readonly string[]} converted  Ids, sortiert (CONVERTED_MODULES)
 * @returns {string}
 */
export function renderCatalogModule(converted) {
  const lines = [
    '// ERZEUGT von tools/build/catalog.mjs — nicht von Hand ändern.',
    "import legacy from './manifest.js';",
    "import { fromDescriptor } from '../core/module-catalog.js';",
    ...converted.map((id, i) => `import m${i} from './${id}/module.js';`),
    '',
    '/** Ids der Module in der neuen Form (module.js), sortiert. */',
    `export const CONVERTED = Object.freeze(${JSON.stringify([...converted])});`,
    '',
    '/** Alle Registry-Einträge: alte Form aus manifest.js, neue aus module.js. */',
    `export const MODULES = Object.freeze([...legacy, ...[${converted.map((_, i) => `m${i}`).join(', ')}].map(fromDescriptor)]);`,
  ];
  return `${lines.join('\n')}\n`;
}

/**
 * Katalogtexte einer Sprache aus den ui.<lang>.json der umgestellten Module.
 * @param {string} appDir
 * @param {readonly string[]} converted
 * @param {string} lang
 * @returns {Record<string, { name: string, description: string, whenToUse: string }>}
 */
export function collectCatalogTexts(appDir, converted, lang) {
  const out = {};
  for (const id of converted) {
    const rel = `resources/i18n/ui.${lang}.json`;
    const file = join(appDir, 'js', 'modules', id, ...rel.split('/'));
    if (!existsSync(file)) throw new Error(`catalog: ${id}: ${rel} fehlt`);
    const ui = JSON.parse(readFileSync(file, 'utf8'));
    const texts = {};
    for (const key of CATALOG_TEXT_KEYS) {
      if (typeof ui[key] !== 'string' || ui[key] === '') throw new Error(`catalog: ${id}: ${rel} ohne ${key}`);
      texts[key] = ui[key];
    }
    out[id] = texts;
  }
  return out;
}

/**
 * @param {object} texts  Ergebnis von collectCatalogTexts
 * @returns {string} Inhalt von catalog.<lang>.json
 */
export function renderCatalogTexts(texts) {
  return `${JSON.stringify(texts, null, 2)}\n`;
}

/**
 * Ids, die noch in manifest.js stehen, obwohl sie umgestellt sind.
 * @param {string[]} legacyIds
 * @param {readonly string[]} converted
 * @returns {string[]} Befunde, leer = stimmig
 */
export function catalogConflicts(legacyIds, converted) {
  return converted.filter((id) => legacyIds.includes(id))
    .map((id) => `catalog: ${id}: steht noch in manifest.js — ein umgestelltes Modul hat nur module.js`);
}

/**
 * Ids der manifest.js-Einträge (Import ohne Seiteneffekte: `load` sind Pfeilfunktionen).
 * @param {string} appDir
 * @returns {Promise<string[]>}
 */
export async function readLegacyIds(appDir) {
  const url = pathToFileURL(join(appDir, 'js', 'modules', 'manifest.js')).href;
  const { default: manifest } = await import(url);
  return manifest.map((e) => e.id);
}

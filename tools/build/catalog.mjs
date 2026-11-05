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
 * - `EXAMPLES` / `EXAMPLE_REFS` in catalog.generated.js: wem ein Beispiel
 *   gehört und welche Module es per `exampleRefs` nutzen.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseDescriptor } from './module-gates.mjs';
import { readModuleExamples } from './example-catalog.mjs';

/** Sprachen, für die catalog.<lang>.json entsteht. */
export const CATALOG_LANGS = Object.freeze(['de', 'en']);

/** Schlüssel aus ui.<lang>.json, die in den Katalog wandern. */
export const CATALOG_TEXT_KEYS = Object.freeze(['name', 'description', 'whenToUse']);

/**
 * Menüreihenfolge aller Module — die EINE Quelle, sobald `manifest.js`
 * entfällt (Teilprojekt G). Umgestellte Module behalten ihren alten Platz.
 * Ein neues Modul kommt hier von Hand hinein.
 * @type {readonly string[]}
 */
export const MODULE_ORDER = Object.freeze([
  'worksheet', 'xy-plot', 'pie-chart', 'bar', 'pareto', 'mosaic', 'heatmap', 'contour-plot',
  'histogram', 'boxplot', 'individual-value-plot', 'run-chart', 'probability-plot',
  'chart-suggestion', 'data-import', 'rest-api', 'random-generator', 'model-data-generator',
  'calculator', 'unit-converter', 'data-transformation', 'project-charter', 'dmaic-calendar',
  'todo', 'stakeholder-analysis', 'voc-ctx-tree', 'kano', 'survey-builder', 'raci-matrix', 'sipoc',
  'five-why', 'process-map', 'gage-run-chart', 'msa-typ1', 'msa-typ2', 'msa-typ4', 'msa-typ5',
  'msa-typ6', 'process-capability', 'ce-matrix', 'ishikawa', 'makigami', 'activity-flowchart',
  'opportunity-flowchart', 'deployment-flowchart', 'correlation', 'distribution-fit', 'fmea',
  'hypothesis-test', 'attribute-test', 'resampling', 'multi-vari', 'sample-size',
  'pairwise-comparison', 'outlier-test', 'doe-advisor', 'doe-planner', 'regression',
  'glm-regression', 'response-optimization', 'control-chart', 'attribute-control-chart',
  'time-weighted-chart', 'rare-event-chart', 'multivariate-control-chart', 'short-run-chart',
  'transformed-imr-chart', 'lessons-learned', 'triz-contradiction-matrix', 'triz-9-windows',
  'morphological-box', 'triz-physical-contradiction', 'triz-ifr', 'triz-resources',
  'triz-evolution-trends', 'triz-sufield', 'triz-function-analysis',
]);

/**
 * Quelltext von js/modules/catalog.generated.js.
 * @param {readonly string[]} converted  Ids, sortiert (CONVERTED_MODULES)
 * @param {{ examples?: Record<string, string>, exampleRefs?: Record<string, string[]> }} [exampleCatalog]  collectExampleCatalog(…)
 * @param {readonly string[]} [order]  Menüreihenfolge (MODULE_ORDER)
 * @returns {string}
 */
export function renderCatalogModule(converted, { examples = {}, exampleRefs = {} } = {}, order = MODULE_ORDER) {
  const lines = [
    '// ERZEUGT von tools/build/catalog.mjs — nicht von Hand ändern.',
    "import legacy from './manifest.js';",
    "import { fromDescriptor } from '../core/module-catalog.js';",
    ...converted.map((id, i) => `import m${i} from './${id}/module.js';`),
    '',
    '/** Menüreihenfolge (tools/build/catalog.mjs MODULE_ORDER). */',
    `export const MODULE_ORDER = Object.freeze(${JSON.stringify([...order])});`,
    '',
    '/** Ids der Module in der neuen Form (module.js), sortiert. */',
    `export const CONVERTED = Object.freeze(${JSON.stringify([...converted])});`,
    '',
    '/** Alle Registry-Einträge: alte Form aus manifest.js, neue aus module.js; in Menüreihenfolge. */',
    `export const MODULES = Object.freeze([...legacy, ...[${converted.map((_, i) => `m${i}`).join(', ')}].map(fromDescriptor)]`,
    '  .sort((a, b) => MODULE_ORDER.indexOf(a.id) - MODULE_ORDER.indexOf(b.id)));',
    '',
    '/** Beispiel-Id → Besitzermodul (Module in neuer Form, resources/examples/examples.json). */',
    `export const EXAMPLES = Object.freeze(${JSON.stringify(examples)});`,
    '',
    '/** Beispiel-Id → Module, die es per exampleRefs (module.js) nutzen. */',
    `export const EXAMPLE_REFS = Object.freeze(${JSON.stringify(exampleRefs)});`,
  ];
  return `${lines.join('\n')}\n`;
}

/** @param {Record<string, any>} obj @returns {Record<string, any>} Schlüssel sortiert */
const sortKeys = (obj) => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/**
 * Beispiel-Zuordnung der Module in neuer Form: wem ein Beispiel gehört
 * (resources/examples/examples.json) und welche Module es per `exampleRefs`
 * (module.js) nutzen.
 * @param {string} appDir
 * @param {readonly string[]} converted  sortiert
 * @returns {{ examples: Record<string, string>, exampleRefs: Record<string, string[]> }}
 */
export function collectExampleCatalog(appDir, converted) {
  const examples = {};
  const exampleRefs = {};
  for (const id of converted) {
    for (const e of readModuleExamples(appDir, id)) examples[e.id] = id;
    const file = join(appDir, 'js', 'modules', id, 'module.js');
    const refs = existsSync(file) ? parseDescriptor(readFileSync(file, 'utf8')).fields.get('exampleRefs') : undefined;
    for (const ex of Array.isArray(refs) ? refs : []) {
      if (!Object.hasOwn(exampleRefs, ex)) exampleRefs[ex] = [];
      exampleRefs[ex].push(id);
    }
  }
  return { examples: sortKeys(examples), exampleRefs: sortKeys(exampleRefs) };
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

/** `$schema` von js/modules/catalog.<lang>.json (relativ zu js/modules/). */
export const CATALOG_SCHEMA_REF = '../../schemas/catalog-texts.schema.json';

/**
 * @param {object} texts  Ergebnis von collectCatalogTexts
 * @returns {string} Inhalt von catalog.<lang>.json, `$schema` zuerst
 */
export function renderCatalogTexts(texts) {
  return `${JSON.stringify({ $schema: CATALOG_SCHEMA_REF, ...texts }, null, 2)}\n`;
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
 * Gate Menüreihenfolge: jedes Modul (manifest.js + umgestellte) genau einmal.
 * @param {string[]} legacyIds
 * @param {readonly string[]} converted
 * @param {readonly string[]} [order]
 * @returns {string[]}
 */
export function moduleOrderDiff(legacyIds, converted, order = MODULE_ORDER) {
  const all = new Set([...legacyIds, ...converted]);
  const out = [];
  const seen = new Set();
  for (const id of order) {
    if (seen.has(id)) out.push(`catalog: MODULE_ORDER: ${id} steht mehrfach darin`);
    seen.add(id);
  }
  for (const id of seen) if (!all.has(id)) out.push(`catalog: MODULE_ORDER: ${id} ist kein Modul`);
  for (const id of all) if (!seen.has(id)) out.push(`catalog: MODULE_ORDER: ${id} fehlt`);
  return out;
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

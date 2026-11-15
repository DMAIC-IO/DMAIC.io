/**
 * Loads every source artefact the static handbook generator needs:
 *   - module catalog (`js/modules/catalog.generated.js`) + handbooks: old form
 *     `<id>-help.js`/`<id>-references.js`, new form
 *     `resources/i18n/help.<lang>.json`/`resources/data/references.json`
 *   - algorithm lab index + per-algorithm JSON files
 *   - i18n strings for the page shell (DE/EN)
 *
 * All file access is relative to REPO_ROOT. Nothing is cached on disk —
 * the build reads fresh every run so it is always in sync with the sources.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

import { withoutSchema } from '../../../js/core/json-file.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';
import { resolveReferences } from '../../../js/core/references-books.js';
import { loadGlossary } from './load-glossary.mjs';
import { loadVideos } from './load-videos.mjs';

/**
 * @param {string} repoRoot
 */
export async function loadAllSources(repoRoot) {
  const catalog = await readCatalog(repoRoot);
  const [modules, algorithms, i18n, examples, glossary, videos] = await Promise.all([
    loadModules(repoRoot, catalog),
    loadAlgorithms(repoRoot),
    loadI18n(repoRoot),
    loadExamples(repoRoot, catalog),
    loadGlossary(repoRoot),
    loadVideos(repoRoot),
  ]);
  return { modules, algorithms, i18n, examples, glossary, videos };
}

// ─── Modules ────────────────────────────────────────────────────────

/**
 * Der Modulkatalog: alle Registry-Einträge und die Ids der neuen Form.
 * @param {string} repoRoot
 * @returns {Promise<{ modules: object[], converted: readonly string[], examples: Record<string,string>, exampleRefs: Record<string,string[]> }>}
 */
async function readCatalog(repoRoot) {
  const url = pathToFileURL(path.join(repoRoot, 'js/modules/catalog.generated.js')).href;
  const { MODULES, CONVERTED, EXAMPLES, EXAMPLE_REFS } = await import(url);
  return { modules: MODULES, converted: CONVERTED, examples: EXAMPLES, exampleRefs: EXAMPLE_REFS };
}

/**
 * Load every module's handbook and references.
 * @param {string} repoRoot
 * @param {{ modules: Array<{id: string, phase?: string, cycles?: object}>, converted: readonly string[] }} [catalog] - for tests
 */
export async function loadModules(repoRoot, catalog) {
  const { modules, converted } = catalog ?? await readCatalog(repoRoot);
  const isNew = new Set(converted);
  const results = [];
  for (const entry of modules) {
    const dir = path.join(repoRoot, 'js/modules', entry.id);
    const { help, references } = isNew.has(entry.id)
      ? await loadNewForm(dir, entry.id)
      : await loadLegacy(dir, entry.id);
    if (!help) continue;
    results.push({
      id: entry.id,
      phase: entry.phase,
      cycles: entry.cycles || null,
      help: normalizeHelp(help),
      references,
    });
  }
  return results;
}

/**
 * Alte Form: `<id>-help.js` und `<id>-references.js`.
 * @param {string} dir @param {string} id
 * @returns {Promise<{ help: object|null, references: object[] }>}
 */
async function loadLegacy(dir, id) {
  const flatPath = path.join(dir, `${id}-help.js`);
  const helpPath = !existsSync(flatPath) && existsSync(path.join(dir, 'legacy', `${id}-help.js`)) ? path.join(dir, 'legacy', `${id}-help.js`) : flatPath;
  let help = null;
  try {
    const mod = await import(pathToFileURL(helpPath).href);
    help = mod.default || mod;
  } catch (err) {
    if (err?.code !== 'ERR_MODULE_NOT_FOUND') {
      console.warn(`[handbook] Failed to load ${helpPath}: ${err.message}`);
    }
  }
  return { help, references: help ? await loadReferences(path.join(dir, `${id}-references.js`)) : [] };
}

/**
 * Neue Form: `resources/i18n/help.<lang>.json` (zur Zwei-Sprachen-Form
 * zusammengeführt) und `resources/data/references.json` (Bücher aufgelöst).
 * Eine kaputte Datei gilt wie in der alten Form als fehlend.
 * @param {string} dir @param {string} id
 * @returns {Promise<{ help: object|null, references: object[] }>}
 */
async function loadNewForm(dir, id) {
  const read = async (rel) => {
    const file = path.join(dir, rel);
    if (!existsSync(file)) return undefined;
    try {
      return withoutSchema(await readJson(file));
    } catch (err) {
      console.warn(`[handbook] Failed to load ${file}: ${err.message}`);
      return undefined;
    }
  };
  const files = {};
  for (const lang of ['de', 'en']) {
    const file = await read(`resources/i18n/help.${lang}.json`);
    if (file) files[lang] = file;
  }
  if (Object.keys(files).length === 0) return { help: null, references: [] };
  const refs = await read('resources/data/references.json');
  return { help: helpDefFromFiles(id, files), references: resolveReferences(refs?.references ?? []) };
}

/**
 * A module's `<id>-references.js`, or [] when absent or broken.
 * @param {string} file
 * @returns {Promise<object[]>}
 */
async function loadReferences(file) {
  if (!existsSync(file)) return [];
  try {
    const mod = await import(pathToFileURL(file).href);
    return Array.isArray(mod.default) ? mod.default : [];
  } catch (err) {
    console.warn(`[handbook] Failed to load ${file}: ${err.message}`);
    return [];
  }
}

/**
 * Normalize help module shape.
 *
 * Two schemas exist in the codebase:
 *   A) { sections: { overview: { de: {...}, en: {...} }, ... } }  — standard
 *   B) { de: { overview: {...}, methodology: {...} }, en: {...} } — flipped
 *
 * We always emit shape (A) so downstream rendering has a single path.
 */
function normalizeHelp(help) {
  if (help && typeof help === 'object' && help.sections) return help;
  if (help && (help.de || help.en)) {
    const sections = {};
    const langs = ['de', 'en'];
    const keySet = new Set();
    for (const lang of langs) {
      const tree = help[lang];
      if (!tree) continue;
      for (const k of Object.keys(tree)) keySet.add(k);
    }
    for (const key of keySet) {
      sections[key] = {};
      for (const lang of langs) {
        if (help[lang]?.[key]) sections[key][lang] = help[lang][key];
      }
    }
    return { ...help, sections };
  }
  return help;
}

// ─── Algorithm Lab ──────────────────────────────────────────────────

async function loadAlgorithms(repoRoot) {
  const indexPath = path.join(repoRoot, 'js/algorithm-lab/algorithms/index.json');
  const indexRaw = await readFile(indexPath, 'utf8');
  const index = JSON.parse(indexRaw);

  const categoryById = new Map(
    (index.categories || []).map((c) => [c.id, c]),
  );

  const algorithms = [];
  for (const entry of index.algorithms || []) {
    const absPath = path.join(repoRoot, entry.path);
    try {
      const raw = await readFile(absPath, 'utf8');
      const data = JSON.parse(raw);
      algorithms.push(data);
    } catch (err) {
      console.warn(`[handbook] Failed to load algorithm ${entry.id}: ${err.message}`);
    }
  }

  return {
    categories: index.categories || [],
    categoryById,
    algorithms,
  };
}

// ─── Examples ───────────────────────────────────────────────────────

/**
 * Beispielkatalog des Handbuchs: examples/index.json (alte Form),
 * resources/examples/examples.json der Module in neuer Form und
 * examples/shared/scenarios.json. Jeder Eintrag mit `file` bekommt
 * `sourcePath` (zum Kopieren und für die CSV-Vorschau); `modules` enthält
 * Besitzer und Nutzer aus exampleRefs. Dataset-Einträge bekommen eine kleine
 * Vorschau (die ersten `preview.rows` Zeilen der CSV-Datei). Generatoren
 * werden im Handbuch nur als Spezifikation gezeigt.
 *
 * Fehlender Katalog gibt { entries: [] } ohne Warnung zurück, damit das
 * Handbuch auch ohne Beispiele baut.
 * @param {string} repoRoot
 * @param {{ converted: readonly string[], examples: Record<string,string>, exampleRefs: Record<string,string[]> }} [catalog]
 * @returns {Promise<{ entries: object[] }>}
 */
export async function loadExamples(repoRoot, catalog) {
  const { converted = [], exampleRefs = {} } = catalog ?? await readCatalog(repoRoot);
  const withRefs = (id, mods) => [...new Set([...mods, ...(Object.hasOwn(exampleRefs, id) ? exampleRefs[id] : [])])];
  const sources = [];
  try {
    const index = withoutSchema(await readJson(path.join(repoRoot, 'examples/index.json')));
    for (const ex of index.examples ?? []) {
      sources.push({ ex: { ...ex, modules: withRefs(ex.id, ex.modules ?? []) }, base: path.join(repoRoot, 'examples') });
    }
  } catch (err) {
    if (err?.code !== 'ENOENT') console.warn(`[handbook] Failed to load examples catalog: ${err.message}`);
  }
  for (const id of converted) {
    const base = path.join(repoRoot, 'js/modules', id, 'resources/examples');
    const file = path.join(base, 'examples.json');
    if (!existsSync(file)) continue;
    try {
      for (const ex of withoutSchema(await readJson(file)).examples ?? []) {
        sources.push({ ex: { ...ex, modules: withRefs(ex.id, [id]) }, base, owner: id });
      }
    } catch (err) {
      console.warn(`[handbook] Failed to load ${file}: ${err.message}`);
    }
  }
  try {
    const shared = withoutSchema(await readJson(path.join(repoRoot, 'examples/shared/scenarios.json')));
    for (const ex of shared.scenarios ?? []) sources.push({ ex });
  } catch (err) {
    if (err?.code !== 'ENOENT') console.warn(`[handbook] Failed to load scenarios: ${err.message}`);
  }

  const entries = [];
  for (const { ex, base, owner } of sources) {
    const enriched = { ...ex };
    if (ex.file && base) {
      enriched.sourcePath = path.join(base, ex.file);
      const name = path.basename(ex.file);
      enriched.downloadName = owner ? `${owner}/${name}` : name;
    }
    if (ex.type === 'dataset' && enriched.sourcePath) {
      try {
        enriched.previewData = await readCsvPreview(enriched.sourcePath, ex.preview?.rows || 10);
      } catch (err) {
        console.warn(`[handbook] Could not read preview for ${ex.id}: ${err.message}`);
      }
    }
    entries.push(enriched);
  }
  return { entries };
}

/**
 * Read the first N data rows (plus header) of a CSV file. Tolerates the
 * simple comma-separated, optionally quoted format produced by our
 * example-data generator.
 */
async function readCsvPreview(filePath, rows) {
  const text = await readFile(filePath, 'utf8');
  const lines = text.split('\n').filter(l => l.length > 0);
  if (lines.length === 0) return { header: [], rows: [], totalRows: 0 };
  const splitRow = (l) => l.split(',').map(c => c.replace(/^"(.*)"$/, '$1').trim());
  const header = splitRow(lines[0]);
  const dataLines = lines.slice(1);
  const preview = dataLines.slice(0, rows).map(splitRow);
  return { header, rows: preview, totalRows: dataLines.length };
}

/**
 * Return all examples that declare compatibility with the given moduleId.
 */
export function getExamplesForModule(examples, moduleId) {
  if (!examples?.entries) return [];
  return examples.entries.filter(e => Array.isArray(e.modules) && e.modules.includes(moduleId));
}

// ─── i18n ───────────────────────────────────────────────────────────

/**
 * Sprachdateien des Handbuchs: `i18n/<lang>.json`, dazu die Katalogtexte
 * (`js/modules/catalog.<lang>.json`) unter `modules.<id>` — dort stehen Name,
 * Beschreibung und whenToUse der Module in neuer Form.
 * @param {string} repoRoot
 * @returns {Promise<{ de: object, en: object }>}
 */
export async function loadI18n(repoRoot) {
  const out = {};
  for (const lang of ['de', 'en']) {
    const table = await readJson(path.join(repoRoot, `i18n/${lang}.json`));
    const catalogPath = path.join(repoRoot, `js/modules/catalog.${lang}.json`);
    const catalog = existsSync(catalogPath) ? withoutSchema(await readJson(catalogPath)) : {};
    table.modules ??= {};
    for (const [id, texts] of Object.entries(catalog)) table.modules[id] = { ...table.modules[id], ...texts };
    out[lang] = table;
  }
  return out;
}

async function readJson(p) {
  return JSON.parse(await readFile(p, 'utf8'));
}

/**
 * Find a module name for display, preferring the module's i18n entry.
 */
export function getModuleName(moduleId, i18n, lang) {
  const entry = i18n?.[lang]?.modules?.[moduleId];
  if (entry?.name) return entry.name;
  // Fallback: title-case the id
  return moduleId
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

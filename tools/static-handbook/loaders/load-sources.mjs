/**
 * Loads every source artefact the static handbook generator needs:
 *   - module manifest + handbooks (dynamic import of *-help.js)
 *   - algorithm lab index + per-algorithm JSON files
 *   - i18n strings for the page shell (DE/EN)
 *
 * All file access is relative to REPO_ROOT. Nothing is cached on disk —
 * the build reads fresh every run so it is always in sync with the sources.
 */

import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

/**
 * @param {string} repoRoot
 */
export async function loadAllSources(repoRoot) {
  const [modules, algorithms, i18n, examples] = await Promise.all([
    loadModules(repoRoot),
    loadAlgorithms(repoRoot),
    loadI18n(repoRoot),
    loadExamples(repoRoot),
  ]);
  return { modules, algorithms, i18n, examples };
}

// ─── Modules ────────────────────────────────────────────────────────

async function loadModules(repoRoot) {
  const manifestPath = path.join(repoRoot, 'js/modules/manifest.js');
  const manifestUrl = pathToFileURL(manifestPath).href;
  const { default: manifest } = await import(manifestUrl);

  const results = [];
  for (const entry of manifest) {
    const dir = path.join(repoRoot, 'js/modules', entry.id);
    const helpPath = path.join(dir, `${entry.id}-help.js`);

    let help = null;
    try {
      const mod = await import(pathToFileURL(helpPath).href);
      help = mod.default || mod;
    } catch (err) {
      if (err?.code !== 'ERR_MODULE_NOT_FOUND') {
        console.warn(`[handbook] Failed to load ${helpPath}: ${err.message}`);
      }
    }
    if (!help) continue;

    results.push({
      id: entry.id,
      phase: entry.phase,
      cycles: entry.cycles || null,
      help: normalizeHelp(help),
    });
  }
  return results;
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
 * Load the example data catalog (`app/dev/examples/index.json`) and, for
 * dataset-type entries, attach a small preview (the first `preview.rows`
 * lines of the CSV file). Generator entries materialise their data at
 * runtime in the app — for the handbook we render only the spec.
 *
 * Empty/missing catalog → returns { entries: [] } without warning, so the
 * handbook still builds in environments without examples.
 */
async function loadExamples(repoRoot) {
  const indexPath = path.join(repoRoot, 'examples/index.json');
  let catalog;
  try {
    catalog = JSON.parse(await readFile(indexPath, 'utf8'));
  } catch (err) {
    if (err?.code === 'ENOENT') return { entries: [] };
    console.warn(`[handbook] Failed to load examples catalog: ${err.message}`);
    return { entries: [] };
  }

  const entries = [];
  for (const ex of catalog.examples || []) {
    const enriched = { ...ex };
    if (ex.type === 'dataset' && ex.file) {
      const filePath = path.join(repoRoot, 'examples', ex.file);
      try {
        const previewRows = ex.preview?.rows || 10;
        enriched.previewData = await readCsvPreview(filePath, previewRows);
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

async function loadI18n(repoRoot) {
  const [de, en] = await Promise.all([
    readJson(path.join(repoRoot, 'i18n/de.json')),
    readJson(path.join(repoRoot, 'i18n/en.json')),
  ]);
  return { de, en };
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

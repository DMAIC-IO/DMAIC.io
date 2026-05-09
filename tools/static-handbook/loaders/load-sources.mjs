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
  const [modules, algorithms, i18n] = await Promise.all([
    loadModules(repoRoot),
    loadAlgorithms(repoRoot),
    loadI18n(repoRoot),
  ]);
  return { modules, algorithms, i18n };
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

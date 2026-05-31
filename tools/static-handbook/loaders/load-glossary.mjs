/**
 * Loader for the glossary catalog used by the static handbook.
 *
 * Reads `app/dev/glossary/index.json` (categories + term IDs) and each
 * referenced `terms/<id>.json` file. Failures per-term are warned and
 * skipped; missing catalog returns an empty result so the handbook still
 * builds in environments without a glossary.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function loadGlossary(repoRoot) {
  const indexPath = path.join(repoRoot, 'glossary/index.json');
  let catalog;
  try {
    catalog = JSON.parse(await readFile(indexPath, 'utf8'));
  } catch (err) {
    if (err?.code === 'ENOENT') return { categories: [], terms: [], termById: new Map() };
    console.warn(`[handbook] Failed to load glossary catalog: ${err.message}`);
    return { categories: [], terms: [], termById: new Map() };
  }

  const terms = [];
  for (const entry of catalog.terms || []) {
    const filePath = path.join(repoRoot, 'glossary', entry.file);
    try {
      const raw = await readFile(filePath, 'utf8');
      const term = JSON.parse(raw);
      terms.push(term);
    } catch (err) {
      console.warn(`[handbook] Failed to load glossary term ${entry.id}: ${err.message}`);
    }
  }

  return {
    categories: catalog.categories || [],
    terms,
    termById: new Map(terms.map(t => [t.id, t])),
  };
}

/** Terms whose `modules` field includes the given moduleId. */
export function getGlossaryTermsForModule(glossary, moduleId) {
  if (!glossary?.terms) return [];
  return glossary.terms.filter(t => Array.isArray(t.modules) && t.modules.includes(moduleId));
}

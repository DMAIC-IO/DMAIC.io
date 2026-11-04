/**
 * Gates der Beispiele (Spec A2/A3 §5.5), zusätzlich zur Schema-Prüfung
 * (json-schemas.mjs):
 *   - Beispiel- und Szenario-Ids sind global eindeutig,
 *   - jede `file` existiert (relativ zu ihrer Basis),
 *   - jedes `sourceWorksheetFile` existiert,
 *   - jedes Szenario-Item verweist auf ein Beispiel; ein `#modul` ist eines seiner Module.
 * Das `exampleRefs`-Ziel prüft checkDescriptor (module-gates.mjs).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readIndexEntries, readScenarios, readModuleExamples, readJsonFile } from './example-catalog.mjs';
import { collectExampleCatalog } from './catalog.mjs';
import { CONVERTED_MODULES } from './converted-modules.mjs';

const INDEX = 'examples/index.json';
const SCENARIOS = 'examples/shared/scenarios.json';

/**
 * Alle Beispiele mit Quelldatei, Pfadbasis, Besitzer und Modulen (eigene + exampleRefs).
 * @param {string} appDir
 * @param {readonly string[]} converted
 * @returns {Array<{ entry: any, where: string, base: string, owner: string|null, modules: string[] }>}
 */
function allExamples(appDir, converted) {
  const { exampleRefs } = collectExampleCatalog(appDir, converted);
  const withRefs = (id, mods) => [...new Set([...mods, ...(Object.hasOwn(exampleRefs, id) ? exampleRefs[id] : [])])];
  const out = readIndexEntries(appDir).map((entry) => ({
    entry, where: INDEX, base: 'examples', owner: null, modules: withRefs(entry.id, entry.modules ?? []),
  }));
  for (const id of converted) {
    const base = `js/modules/${id}/resources/examples`;
    for (const entry of readModuleExamples(appDir, id)) {
      out.push({ entry, where: `${base}/examples.json`, base, owner: id, modules: withRefs(entry.id, [id]) });
    }
  }
  return out;
}

/**
 * Alle Beispiel-Gates.
 * @param {string} [appDir]
 * @param {readonly string[]} [converted]
 * @returns {string[]} Befunde (Präfix `examples: `), leer = stimmig
 */
export function checkExamples(appDir = join(import.meta.dirname, '..', '..'), converted = CONVERTED_MODULES) {
  const out = [];
  const examples = allExamples(appDir, converted);
  const scenarios = readScenarios(appDir);
  const exists = (rel) => existsSync(join(appDir, ...rel.split('/')));

  const seen = new Map();
  for (const { entry, where } of [...examples, ...scenarios.map((entry) => ({ entry, where: SCENARIOS }))]) {
    if (seen.has(entry.id)) out.push(`examples: Id doppelt: ${entry.id} (${seen.get(entry.id)}, ${where})`);
    else seen.set(entry.id, where);
  }

  for (const { entry, where, base, owner } of examples) {
    if (!entry.file) continue;
    const rel = `${base}/${entry.file}`;
    if (!exists(rel)) { out.push(`examples: ${where}: ${entry.id}: Datei fehlt: ${rel}`); continue; }
    if (entry.format !== 'json') continue;
    const ws = readJsonFile(join(appDir, ...rel.split('/')))?.sourceWorksheetFile;
    if (typeof ws !== 'string') continue;
    const wsRel = owner && !ws.startsWith('shared/') ? `${base}/${ws}` : `examples/${ws}`;
    if (!exists(wsRel)) out.push(`examples: ${where}: ${entry.id}: sourceWorksheetFile fehlt: ${wsRel}`);
  }

  const byId = new Map(examples.map((x) => [x.entry.id, x]));
  for (const s of scenarios) {
    for (const item of s.items ?? []) {
      const [exampleId, moduleId] = String(item).split('#');
      const target = byId.get(exampleId);
      if (!target) out.push(`examples: ${SCENARIOS}: ${s.id}: ${item} — unbekanntes Beispiel`);
      else if (moduleId && !target.modules.includes(moduleId)) {
        out.push(`examples: ${SCENARIOS}: ${s.id}: ${item} — ${moduleId} ist kein Modul von ${exampleId} (${target.modules.join(', ')})`);
      }
    }
  }
  return out;
}

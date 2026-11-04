/**
 * Beispielquellen lesen (Build und Werkzeuge): examples/index.json (alte
 * Form, bis Teilprojekt G), examples/shared/scenarios.json und
 * resources/examples/examples.json der Module in neuer Form. `$schema` wird
 * entfernt. Spec A2/A3 §5.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withoutSchema } from '../../js/core/json-file.js';
import { CONVERTED_MODULES } from './converted-modules.mjs';

/** @param {string} file @returns {any} null ohne Datei */
export function readJsonFile(file) {
  return existsSync(file) ? withoutSchema(JSON.parse(readFileSync(file, 'utf8'))) : null;
}

/**
 * Einträge aus examples/index.json, ohne Szenarien.
 * @param {string} appDir
 * @returns {object[]}
 */
export function readIndexEntries(appDir) {
  return (readJsonFile(join(appDir, 'examples', 'index.json'))?.examples ?? []).filter((e) => e.type !== 'scenario');
}

/**
 * Szenarien aus examples/shared/scenarios.json.
 * @param {string} appDir
 * @returns {object[]}
 */
export function readScenarios(appDir) {
  return readJsonFile(join(appDir, 'examples', 'shared', 'scenarios.json'))?.scenarios ?? [];
}

/**
 * Beispiele eines Moduls in neuer Form (resources/examples/examples.json).
 * @param {string} appDir
 * @param {string} id
 * @returns {object[]}
 */
export function readModuleExamples(appDir, id) {
  return readJsonFile(join(appDir, 'js', 'modules', id, 'resources', 'examples', 'examples.json'))?.examples ?? [];
}

/**
 * Beispiel-Id → Besitzermodul: für index.json das erste Element von
 * `modules`, für Modulbeispiele das Modul selbst.
 * @param {string} appDir
 * @param {readonly string[]} [converted]
 * @returns {Map<string, string>}
 */
export function readExampleOwners(appDir, converted = CONVERTED_MODULES) {
  const out = new Map();
  for (const e of readIndexEntries(appDir)) out.set(e.id, e.modules?.[0]);
  for (const id of converted) for (const e of readModuleExamples(appDir, id)) out.set(e.id, id);
  return out;
}

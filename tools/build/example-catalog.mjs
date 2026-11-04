/**
 * Beispielquellen lesen (Build und Werkzeuge): examples/index.json (alte
 * Form, bis Teilprojekt G), examples/shared/scenarios.json und — ab Task 3 —
 * resources/examples/examples.json der Module in neuer Form. `$schema` wird
 * entfernt. Spec A2/A3 §5.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withoutSchema } from '../../js/core/json-file.js';

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

/**
 * JSON-Schemata der Modul-Dateien (app/dev/schemas/, Draft 2020-12).
 *
 * Jede Datei eines Formats trägt `"$schema": "<relativer Pfad zur Schema-Datei>"`
 * (Editor-Hilfe); geprüft wird hier, dass der Verweis stimmt und der Inhalt
 * das Schema erfüllt. ajv lebt nur in tools/, nie zur Laufzeit.
 * Spec: docs/superpowers/specs/2026-11-04-module-nachladbar-a2-a3-design.md §3.
 */
import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync, readdirSync, globSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Absoluter Pfad zu app/dev/schemas. */
export const SCHEMA_DIR = join(APP_ROOT, 'schemas');

/** Format → Schema-Datei und Glob der Dateien (relativ zur App); `glob: null` = keine Datei. */
export const FORMATS = Object.freeze({
  'module-ui': { schema: 'module-ui.schema.json', glob: 'js/modules/*/resources/i18n/ui.*.json' },
  'module-context-help': { schema: 'module-context-help.schema.json', glob: 'js/modules/*/resources/i18n/context-help.*.json' },
  'module-help': { schema: 'module-help.schema.json', glob: 'js/modules/*/resources/i18n/help.*.json' },
  'module-references': { schema: 'module-references.schema.json', glob: 'js/modules/*/resources/data/references.json' },
  'module-resources': { schema: 'module-resources.schema.json', glob: null },
  'catalog-texts': { schema: 'catalog-texts.schema.json', glob: 'js/modules/catalog.*.json' },
});

/** @type {import('ajv').default | null} */
let ajv = null;
/** @type {Map<string, string>} Schema-Datei → $id */
const ids = new Map();

/** @returns {import('ajv').default} */
function instance() {
  if (ajv) return ajv;
  ajv = new Ajv2020({ allErrors: true, strict: true });
  for (const name of readdirSync(SCHEMA_DIR).filter((n) => n.endsWith('.schema.json')).sort()) {
    const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, name), 'utf8'));
    ajv.addSchema(schema);
    ids.set(name, schema.$id);
  }
  return ajv;
}

/**
 * Einen Wert gegen das Schema eines Formats prüfen.
 * @param {any} value
 * @param {string} format  Schlüssel aus FORMATS
 * @returns {{ ok: boolean, errors: string[] }}  je Fehler `<instancePath oder /> <Meldung>`
 */
export function validateValue(value, format) {
  const def = FORMATS[format];
  if (!def) throw new Error(`json-schemas: unbekanntes Format ${format}`);
  const a = instance();
  const validate = a.getSchema(ids.get(def.schema));
  if (!validate) throw new Error(`json-schemas: ${def.schema} fehlt in ${SCHEMA_DIR}`);
  if (validate(value)) return { ok: true, errors: [] };
  const errors = (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ''}`);
  return { ok: false, errors };
}

/**
 * Erwarteter `$schema`-Wert einer Datei: posix-relativer Pfad zur Schema-Datei.
 * @param {string} file  absoluter Pfad
 * @param {string} format
 * @param {string} [appDir]
 * @returns {string}
 */
export function schemaRef(file, format, appDir = APP_ROOT) {
  return relative(dirname(file), join(appDir, 'schemas', FORMATS[format].schema)).split(sep).join('/');
}

/**
 * Eine Datei prüfen: gültiges JSON, `$schema`-Verweis, Schema.
 * @param {string} file  absoluter Pfad
 * @param {string} format
 * @param {{ appDir?: string }} [opts]
 * @returns {{ ok: boolean, errors: string[] }}  jeder Fehler beginnt mit `<file>: `
 */
export function validateFile(file, format, { appDir = APP_ROOT } = {}) {
  let value;
  try {
    value = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    return { ok: false, errors: [`${file}: kein gültiges JSON (${err.message})`] };
  }
  const errors = [];
  const expected = schemaRef(file, format, appDir);
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.$schema !== expected) {
    errors.push(`${file}: $schema muss "${expected}" sein`);
  }
  errors.push(...validateValue(value, format).errors.map((e) => `${file}: ${e}`));
  return { ok: errors.length === 0, errors };
}

/**
 * Alle Dateien aller Formate mit Glob prüfen.
 * @param {string} [appDir]
 * @returns {string[]} Fehler, leer = alles gültig
 */
export function checkTree(appDir = APP_ROOT) {
  const out = [];
  for (const [format, { glob }] of Object.entries(FORMATS)) {
    if (!glob) continue;
    for (const rel of globSync(glob, { cwd: appDir }).sort()) {
      out.push(...validateFile(join(appDir, rel), format, { appDir }).errors);
    }
  }
  return out;
}

/**
 * i18n-copies.mjs — prüft kopierte Modultexte gegen ihre Quelle.
 *
 * Ein Modul, das Texte eines anderen Moduls wortgleich braucht, kopiert sie in
 * die eigene `ui.<lang>.json` und markiert die Kopie in
 * `resources/i18n/copies.json`:
 *
 *   { "<eigener Schlüssel relativ zu ui.<lang>.json>": "modules.<src>.<rest>" }
 *
 * oder, für einen globalen Text, `"<eigener Schlüssel>": "<Pfad in i18n/<lang>.json>"`.
 *
 * Quelle ist `js/modules/<src>/resources/i18n/ui.<lang>.json` (Schlüssel
 * `<rest>`), wenn das Quellmodul in der neuen Form vorliegt, sonst
 * `i18n/<lang>.json` unter `modules.<src>.<rest>`. Weicht eine Kopie ab oder
 * fehlt eine Seite, ist das ein Befund.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const LANGS = ['de', 'en'];

/** @param {string} file @returns {any|null} */
function readJson(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

/** @param {any} tree @param {string} path  Punktpfad @returns {{found: boolean, value?: any}} */
function lookup(tree, path) {
  let cur = tree;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object' || !Object.hasOwn(cur, part)) return { found: false };
    cur = cur[part];
  }
  return { found: true, value: cur };
}

/**
 * @typedef {object} I18nCopyFinding
 * @property {string} module
 * @property {string} own
 * @property {string} source
 * @property {'de'|'en'} lang
 * @property {'differs'|'missing_own'|'missing_source'} reason
 * @property {string} [ownValue]
 * @property {string} [sourceValue]
 * @property {string} ownFile
 * @property {string} sourceFile
 */

/**
 * @param {string} root  App-Wurzel (enthält `js/` und `i18n/`)
 * @returns {I18nCopyFinding[]}
 */
export function checkI18nCopies(root) {
  const modulesDir = join(root, 'js', 'modules');
  if (!existsSync(modulesDir)) return [];
  const out = [];
  for (const id of readdirSync(modulesDir).sort()) {
    const copies = readJson(join(modulesDir, id, 'resources', 'i18n', 'copies.json'));
    if (!copies) continue;
    for (const [own, source] of Object.entries(copies)) {
      const m = /^modules\.([^.]+)\.(.+)$/.exec(source);
      for (const lang of LANGS) {
        const ownFile = `js/modules/${id}/resources/i18n/ui.${lang}.json`;
        let sourceFile = `i18n/${lang}.json`;
        let sourceLookup;
        if (m) {
          const [, src, rest] = m;
          const target = `js/modules/${src}/resources/i18n/ui.${lang}.json`;
          const targetTree = readJson(join(root, target));
          if (targetTree) { sourceFile = target; sourceLookup = lookup(targetTree, rest); }
          else sourceLookup = lookup(readJson(join(root, sourceFile)), source);
        } else {
          // Globaler Text (ohne `modules.`): Schlüsselpfad in i18n/<lang>.json.
          sourceLookup = lookup(readJson(join(root, sourceFile)), source);
        }
        const ownLookup = lookup(readJson(join(root, ownFile)), own);
        const base = { module: id, own, source, lang, ownFile, sourceFile };
        if (!ownLookup.found) out.push({ ...base, reason: 'missing_own' });
        else if (!sourceLookup.found) out.push({ ...base, reason: 'missing_source', ownValue: ownLookup.value });
        else if (ownLookup.value !== sourceLookup.value) {
          out.push({ ...base, reason: 'differs', ownValue: ownLookup.value, sourceValue: sourceLookup.value });
        }
      }
    }
  }
  return out;
}

/** @param {I18nCopyFinding} f @returns {string} */
export function formatI18nCopyFinding(f) {
  const head = `${f.module}: Kopie „${f.own}“ von „${f.source}“ (${f.lang})`;
  if (f.reason === 'missing_own') return `${head}: eigener Schlüssel fehlt in ${f.ownFile}`;
  if (f.reason === 'missing_source') return `${head}: Quellschlüssel fehlt in ${f.sourceFile}`;
  return `${head} weicht ab: ${f.ownFile} = ${JSON.stringify(f.ownValue)}, ${f.sourceFile} = ${JSON.stringify(f.sourceValue)}`;
}

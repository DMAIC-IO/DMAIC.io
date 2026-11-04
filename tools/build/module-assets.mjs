/**
 * Bestandteile umgestellter Module, die der Browser nachlädt: je Modul EINE
 * Template-Datei `js/chunks/templates/<id>-<hash8>.html` (view.html und
 * tile*.html, mit aufgelöstem @include und eigener <template data-tpl>-Hülle)
 * und EINE CSS-Datei `js/chunks/styles/<id>-<hash8>.css`.
 *
 * js/chunks/ ist gitignored: die Dateien werden bei jedem Build geschrieben,
 * auch im Prüfmodus, und nie als veraltet gemeldet — wie index.html.
 */
import { existsSync, mkdirSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { collectTemplateRecords, renderTemplates } from '../build-templates/build.mjs';

/** sha256, 8 Hex-Zeichen (wie hash8 in build.mjs — hier eigen, sonst Importkreis). */
const hash8 = (text) => createHash('sha256').update(text).digest('hex').slice(0, 8);

/**
 * Schreibt eine Datei atomar (Temp-Datei + rename).
 * @param {string} path @param {string} text
 */
function writeAtomic(path, text) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

/**
 * Löscht in `dir` alles außer `keep` (Dateinamen) und *.tmp.
 * @param {string} dir @param {Set<string>} keep
 */
function prune(dir, keep) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (keep.has(name) || name.endsWith('.tmp')) continue;
    try { unlinkSync(join(dir, name)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}

/**
 * Die Template-Datei eines umgestellten Moduls als Text.
 * @param {string} appDir
 * @param {string} id
 * @param {{key: string, content: string}[]} [records]  alle Templates des js/-Baums (für Partials)
 * @returns {string}
 */
export function renderModuleTemplates(appDir, id, records = collectTemplateRecords(appDir)) {
  const prefix = `js/modules/${id}/resources/`;
  return `${renderTemplates(records, (key) => key.startsWith(prefix)).join('\n')}\n`;
}

/**
 * Template-Dateien aller umgestellten Module schreiben.
 * @param {string} appDir
 * @param {readonly string[]} converted
 * @returns {Record<string, string>} id → URL relativ zur App-Wurzel
 */
export function writeModuleTemplates(appDir, converted) {
  if (!converted.length) return {};
  const dir = join(appDir, 'js', 'chunks', 'templates');
  mkdirSync(dir, { recursive: true });
  const records = collectTemplateRecords(appDir);
  const urls = {};
  const keep = new Set();
  for (const id of converted) {
    const text = renderModuleTemplates(appDir, id, records);
    const name = `${id}-${hash8(text)}.html`;
    writeAtomic(join(dir, name), text);
    keep.add(name);
    urls[id] = `js/chunks/templates/${name}`;
  }
  prune(dir, keep);
  return urls;
}

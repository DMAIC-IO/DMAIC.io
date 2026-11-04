/**
 * Bestandteile umgestellter Module, die der Browser nachlädt: je Modul EINE
 * Template-Datei `js/chunks/templates/<id>-<hash8>.html` (view.html und
 * tile*.html, mit aufgelöstem @include und eigener <template data-tpl>-Hülle)
 * und EINE CSS-Datei `js/chunks/styles/<id>-<hash8>.css`.
 *
 * js/chunks/ ist gitignored: die Dateien werden bei jedem Build geschrieben,
 * auch im Prüfmodus, und nie als veraltet gemeldet — wie index.html.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { transform } from 'esbuild';
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

/**
 * Das CSS eines umgestellten Moduls, minifiziert.
 * @param {string} appDir
 * @param {string} id
 * @returns {Promise<string|null>} null, wenn das Modul kein resources/style.css hat
 */
export async function moduleCss(appDir, id) {
  const file = join(appDir, 'js', 'modules', id, 'resources', 'style.css');
  if (!existsSync(file)) return null;
  const source = readFileSync(file, 'utf8');
  // Die Datei landet in js/chunks/styles/ — relative url() und @import zeigten
  // dort ins Leere. Heute braucht kein Modul-CSS eines von beiden.
  if (/url\(|@import/.test(source)) {
    throw new Error(`${id}: resources/style.css: url( und @import sind nicht erlaubt`);
  }
  return (await transform(source, { loader: 'css', minify: true })).code;
}

/**
 * CSS-Dateien aller umgestellten Module schreiben.
 * @param {string} appDir
 * @param {readonly string[]} converted
 * @returns {Promise<Record<string, string>>} id → URL relativ zur App-Wurzel
 */
export async function writeModuleStyles(appDir, converted) {
  if (!converted.length) return {};
  const dir = join(appDir, 'js', 'chunks', 'styles');
  mkdirSync(dir, { recursive: true });
  const urls = {};
  const keep = new Set();
  for (const id of converted) {
    const css = await moduleCss(appDir, id);
    if (css === null) continue;
    const name = `${id}-${hash8(css)}.css`;
    writeAtomic(join(dir, name), css);
    keep.add(name);
    urls[id] = `js/chunks/styles/${name}`;
  }
  prune(dir, keep);
  return urls;
}

/**
 * STYLES-Links in index.dist.html, die auf ein umgestelltes Modul zeigen.
 * @param {string[]} hrefs  readCssLinks(html)
 * @param {readonly string[]} converted
 * @returns {string[]} Befunde
 */
export function linkedModuleCss(hrefs, converted) {
  const out = [];
  for (const id of converted) {
    for (const href of hrefs) {
      if (href.startsWith(`js/modules/${id}/`)) {
        out.push(`styles: ${id}: index.dist.html verlinkt ${href} — umgestellte Module laden ihr CSS selbst`);
      }
    }
  }
  return out;
}

/**
 * Alle Dateien unter `dir`, rekursiv, als Pfade relativ zu `base` (posix).
 * @param {string} base @param {string} dir @returns {string[]}
 */
function filesBelow(base, dir) {
  const abs = join(base, ...dir.split('/'));
  if (!existsSync(abs)) return [];
  const out = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...filesBelow(base, rel));
    else out.push(rel);
  }
  return out;
}

/**
 * Die Liste `#module-resources`: je umgestelltem Modul die URLs, die der
 * Browser nachlädt.
 * @param {string} appDir
 * @param {readonly string[]} converted
 * @param {{ templates: Record<string, string>, styles: Record<string, string> }} built
 * @returns {Record<string, { templates: string, style?: string, files: Record<string, string> }>}
 */
export function collectModuleResources(appDir, converted, { templates, styles }) {
  const out = {};
  for (const id of converted) {
    const base = join(appDir, 'js', 'modules', id, 'resources');
    const rels = [
      ...filesBelow(base, 'i18n'),
      ...filesBelow(base, 'data'),
      ...filesBelow(base, 'examples'),
    ].sort();
    const files = {};
    for (const rel of rels) {
      const text = readFileSync(join(base, ...rel.split('/')), 'utf8');
      files[rel] = `js/modules/${id}/resources/${rel}?v=${hash8(text)}`;
    }
    out[id] = { templates: templates[id], ...(styles[id] ? { style: styles[id] } : {}), files };
  }
  return out;
}

/**
 * @param {object} resources  collectModuleResources(…)
 * @returns {string} Inhalt des MODULE_RESOURCES-Blocks in index.html
 */
export function buildModuleResourcesBlock(resources) {
  return `  <script type="application/json" id="module-resources">${JSON.stringify(resources)}</script>`;
}

/**
 * @param {object} resources  collectModuleResources(…)
 * @returns {string[]} alle URLs, sortiert (für den Precache)
 */
export function moduleResourceUrls(resources) {
  const urls = [];
  for (const { templates, style, files } of Object.values(resources)) {
    urls.push(templates, ...(style ? [style] : []), ...Object.values(files));
  }
  return urls.sort();
}

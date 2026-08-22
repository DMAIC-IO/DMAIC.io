#!/usr/bin/env node
/**
 * build-icons.mjs — generiert assets/icons/icons.css aus icon-map.json.
 *
 *   node tools/build-icons.mjs            schreibt icons.css
 *   node tools/build-icons.mjs --check    prüft nur, ob icons.css aktuell ist
 *
 * icons.css ist ein committetes Artefakt: nightly zieht den dev-Branch ohne
 * Build-Schritt, also muss die generierte Datei im Repo liegen.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadIconMap } from './build/icon-map.mjs';
import { buildIconsCss } from './build/icons.mjs';
import { readdirSync, statSync } from 'node:fs';
import { collectIconRefs, findUnmappedRefs } from './build/icon-refs.mjs';
import { findInlineSvg, findGlyphs, findPseudoGlyphs } from './build/no-glyphs.mjs';

const APP = join(import.meta.dirname, '..');
const MAP = join(APP, 'assets/icons/icon-map.json');
const OUT = join(APP, 'assets/icons/icons.css');
const check = process.argv.includes('--check');

const DIRS = { lucide: join(APP, 'assets/icons/vendor/lucide'), own: join(APP, 'assets/icons/own') };

function readSource({ kind, file }) {
  const path = join(DIRS[kind], `${file}.svg`);
  if (!existsSync(path)) throw new Error(`Quelldatei fehlt: ${path}`);
  return readFileSync(path, 'utf8');
}

const map = loadIconMap(MAP);
let css;
try {
  css = buildIconsCss(map, readSource);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

if (check) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== css) {
    console.error('icons.css ist nicht aktuell — "npm run icons" ausführen und das Ergebnis mitcommitten.');
    process.exit(1);
  }
  console.log(`icons.css aktuell (${Object.keys(map).length} Icons).`);
} else {
  writeFileSync(OUT, css);
  console.log(`icons.css: ${Object.keys(map).length} Icons -> ${OUT}`);
}

// ── Referenz-Lint: jeder im Quellcode benutzte Name muss in der Map stehen. ──
const JS_DIR = join(APP, 'js');
// css/app.min.css ist aus genau den css/*.css-Quellen gebündelt, die der
// Glyphen-Scan ohnehin einzeln liest — ein Fund darin existiert immer auch
// (mit brauchbarer Zeilennummer) in der Quelle. Die minifizierte, einzeilige
// Kopie zusätzlich zu scannen bringt keine neue Abdeckung, nur eine
// Fundstelle, die sich nicht reparieren lässt.
const SKIP_FILE = /\.(min\.js|min\.css|map)$/;

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) { out.push(...sourceFiles(path)); continue; }
    if (!/\.(js|html)$/.test(entry) || SKIP_FILE.test(entry)) continue;
    out.push({ path, text: readFileSync(path, 'utf8') });
  }
  return out;
}

const unmapped = findUnmappedRefs(map, collectIconRefs(sourceFiles(JS_DIR)));
if (unmapped.length) {
  const list = unmapped.map((r) => `  ${r.path}:${r.line}  ${r.name}`).join('\n');
  const msg = `${unmapped.length} Icon-Referenzen ohne Eintrag in icon-map.json:\n${list}`;
  if (process.argv.includes('--report-only')) {
    console.warn(`WARNUNG: ${msg}`);
  } else {
    console.error(msg);
    process.exit(1);
  }
}

// ── Glyphen-Lint: kein Icon darf am Icon-System vorbei gezeichnet werden. ──

/**
 * Dateien, die ein Icon berechtigt selbst zeichnen: die vier
 * SVG-Export-Generatoren erzeugen Dateien, in denen es keine CSS-Maske gibt,
 * und triz-sufield.html definiert eine Pfeilspitze für sein Diagramm.
 */
const GLYPH_EXEMPT = [
  'js/core/export-utils.js',
  'js/modules/process-map/process-map-export.js',
  'js/modules/makigami/makigami.js',
  'js/modules/response-optimization/response-optimization.js',
  'js/modules/triz-sufield/triz-sufield.html',
];

function walk(dir, ext) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) { out.push(...walk(path, ext)); continue; }
    if (!ext.test(entry) || SKIP_FILE.test(entry)) continue;
    out.push(path);
  }
  return out;
}

const read = (path) => readFileSync(path, 'utf8');

function checkNoGlyphs() {
  const findings = [];
  for (const path of walk(JS_DIR, /\.html$/)) {
    const rel = relative(APP, path);
    if (GLYPH_EXEMPT.includes(rel)) continue;
    for (const hit of findInlineSvg(read(path))) findings.push(`${rel}: inline <svg> — ${hit}`);
  }
  for (const rel of ['i18n/de.json', 'i18n/en.json']) {
    for (const hit of findGlyphs(read(join(APP, rel)))) findings.push(`${rel}:${hit.line}: Icon-Glyphe — ${hit.text}`);
  }
  const cssFiles = [...walk(join(APP, 'css'), /\.css$/), ...walk(JS_DIR, /\.css$/)];
  for (const path of cssFiles) {
    const rel = relative(APP, path);
    for (const hit of findPseudoGlyphs(read(path))) findings.push(`${rel}:${hit.line}: content mit Glyphe — ${hit.text}`);
  }
  if (findings.length) {
    console.error(`Icons außerhalb des Icon-Systems:\n  ${findings.join('\n  ')}`);
    process.exit(1);
  }
}

checkNoGlyphs();

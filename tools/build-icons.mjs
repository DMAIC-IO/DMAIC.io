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
import { join } from 'node:path';
import { loadIconMap } from './build/icon-map.mjs';
import { buildIconsCss } from './build/icons.mjs';

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

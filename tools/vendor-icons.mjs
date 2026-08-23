#!/usr/bin/env node
/**
 * vendor-icons.mjs — kopiert die in icon-map.json benannten Lucide-Quellen aus
 * node_modules/lucide-static nach assets/icons/vendor/lucide/.
 *
 * Nur die tatsächlich verwendeten Dateien landen im Baum; nicht mehr benannte
 * werden entfernt, damit vendor/ exakt die Map spiegelt. Die Dateien sind
 * committete Artefakte — nach jedem Lauf mitcommitten.
 *
 *   node tools/vendor-icons.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadIconMap, lucideNames } from './build/icon-map.mjs';

const APP = join(import.meta.dirname, '..');
const MAP = join(APP, 'assets/icons/icon-map.json');
const SRC = join(APP, 'node_modules/lucide-static/icons');
const OUT = join(APP, 'assets/icons/vendor/lucide');

if (!existsSync(SRC)) {
  console.error(`lucide-static nicht installiert — erwartet unter ${SRC}. Erst "npm install" ausführen.`);
  process.exit(1);
}

const names = lucideNames(loadIconMap(MAP));
mkdirSync(OUT, { recursive: true });

const missing = names.filter((n) => !existsSync(join(SRC, `${n}.svg`)));
if (missing.length) {
  console.error(`icon-map.json nennt Lucide-Icons, die es nicht gibt:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

for (const name of names) {
  writeFileSync(join(OUT, `${name}.svg`), readFileSync(join(SRC, `${name}.svg`)));
}

// Nicht mehr benannte Dateien entfernen, damit vendor/ die Map exakt spiegelt.
const keep = new Set(names.map((n) => `${n}.svg`));
keep.add('LICENSE');
for (const f of readdirSync(OUT)) {
  if (!keep.has(f)) rmSync(join(OUT, f));
}

writeFileSync(join(OUT, 'LICENSE'), readFileSync(join(APP, 'node_modules/lucide-static/LICENSE')));
console.log(`vendor/lucide: ${names.length} Icons kopiert -> ${OUT}`);

/**
 * Vergleich: der Adapter der Beispieldatensätze (parseCsv in examples-registry.js,
 * über den zentralen CSV-Parser) muss für jede ausgelieferte CSV dieselben
 * Spaltentypen und -werte liefern wie der frühere eigene Leser.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { parseCsv } from '../../js/core/examples-registry.js';
import { legacyParseCsv } from './fixtures/legacy-example-csv.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Quellorte der ausgelieferten Beispiel-CSVs, jeweils rekursiv: der zentrale
 * Katalog unter `examples/` und die Beispielordner der umgestellten Module
 * (`js/modules/<id>/resources/examples/`). Das generierte Handbuch
 * (`docs/examples/data/`, gitignoriert) zählt nicht: es enthält nur Kopien
 * und fehlt in jedem frischen Worktree — die Zählung hing sonst vom
 * Arbeitsbaum ab.
 */
async function sourceDirs() {
  const dirs = ['examples'];
  let mods = [];
  try { mods = await readdir(join(root, 'js/modules'), { withFileTypes: true }); } catch { /* fehlt */ }
  for (const m of mods.filter(d => d.isDirectory()).map(d => d.name).sort()) {
    dirs.push(`js/modules/${m}/resources/examples`);
  }
  return dirs;
}

async function listCsv(dir) {
  let entries = [];
  try { entries = await readdir(join(root, dir), { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...await listCsv(rel));
    else if (e.name.endsWith('.csv')) out.push(rel);
  }
  return out;
}

async function loadCsvFiles() {
  const files = [];
  for (const dir of await sourceDirs()) {
    for (const path of await listCsv(dir)) {
      files.push({ path, text: await readFile(join(root, path), 'utf8') });
    }
  }
  return files;
}

const files = await loadCsvFiles();
const catalog = JSON.parse(await readFile(join(root, 'examples/index.json'), 'utf8'));
const catalogCsv = catalog.examples
  .filter(e => typeof e.file === 'string' && e.file.endsWith('.csv'))
  .map(e => `examples/${e.file}`);

suite('Beispiel-CSVs: alter und neuer Leser', () => {
  // 29 = Stand der ausgelieferten Quell-CSVs seit 43104ace/4dc57f87; die frühere
  // Untergrenze 30 wurde nur mit den zwei Handbuch-Kopien erreicht.
  test('mindestens 29 CSV-Dateien gefunden', () => {
    assertEqual(files.length >= 29, true, `nur ${files.length} Dateien gelesen`);
  });

  test('jede im Katalog verlinkte CSV wird geprüft', () => {
    assertEqual(catalogCsv.length > 0, true, 'Katalog ohne CSV-Einträge');
    const read = new Set(files.map(f => f.path));
    assertDeepEqual(catalogCsv.filter(p => !read.has(p)), [], 'nicht gelesen');
  });

  for (const { path, text } of files) {
    test(`${path}: Typen, Werte und Zeilen gleich`, () => {
      const oldRes = legacyParseCsv(text);
      const newRes = parseCsv(text);
      assertEqual(newRes.columns.length, oldRes.columns.length, 'Spaltenzahl');
      assertEqual(newRes.rows.length, oldRes.rows.length, 'Zeilenzahl');
      oldRes.columns.forEach((oc, i) => {
        const nc = newRes.columns[i];
        assertEqual(nc.name, oc.name, `${path}: Name Spalte ${i}`);
        assertEqual(nc.type, oc.type, `${path}: Typ ${oc.name}`);
        assertDeepEqual(nc.values, oc.values, `${path}: Werte ${oc.name}`);
      });
    });
  }
});

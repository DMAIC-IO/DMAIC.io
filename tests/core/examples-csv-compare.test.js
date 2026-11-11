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
const DIRS = ['examples/data', 'docs/examples/data'];

async function loadCsvFiles() {
  const files = [];
  for (const dir of DIRS) {
    let names = [];
    try { names = await readdir(join(root, dir)); } catch { /* Verzeichnis fehlt */ }
    for (const n of names.filter(f => f.endsWith('.csv')).sort()) {
      files.push({ path: `${dir}/${n}`, text: await readFile(join(root, dir, n), 'utf8') });
    }
  }
  return files;
}

const files = await loadCsvFiles();

suite('Beispiel-CSVs: alter und neuer Leser', () => {
  test('mindestens 30 CSV-Dateien gefunden', () => {
    assertEqual(files.length >= 30, true, `nur ${files.length} Dateien gelesen`);
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

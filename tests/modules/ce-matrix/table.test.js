/**
 * Tests for modules/ce-matrix/io/table.js — die Zeilen für `exports.table()`:
 * dieselben Zellen wie der CSV-Download der Altform (Byte-Fixture des
 * Beispiels); der Kern schreibt sie im eigenen CSV-Format.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { toRows } from '../../../js/modules/ce-matrix/io/table.js';
import { State } from '../../../js/modules/ce-matrix/domain/model.js';
import { toCsvText } from '../../../js/core/exporter.js';
import { setModelName } from '../../../js/core/model.js';

setModelName(State, 'ce-matrix');

const EXAMPLE = new URL('../../../js/modules/ce-matrix/resources/examples/projects/ce-matrix-pizza-lieferzeit.json', import.meta.url);

/** Die Zeilen der Byte-Fixture `example-export.csv` der Altform (ohne BOM). */
const LEGACY_CSV_LINES = [
  'sep=;',
  '"Wichtigkeit für Kunden";10;9;7;8;',
  ';"Lieferzeit";"Pizza-Temperatur";"Adress-Trefferquote";"Reklamationsquote";"Σ Zeile"',
  '"Routenplanung";9;4;7;7;231',
  '"Anzahl Bestellungen pro Stunde";8;5;2;6;187',
  '"Backofen-Auslastung";7;8;1;7;205',
  '"Erfahrung des Fahrers";6;2;8;5;174',
  '"Wetter / Verkehr";8;6;3;6;203',
  '"Qualität der Thermo-Verpackung";2;9;1;8;172',
  '"Zeit zwischen Backen und Abfahrt";5;9;0;7;187',
  '"Σ Spalte";450;387;154;368',
  '',
];

/** Stub-Übersetzer mit den deutschen Texten der Altform. @param {string} key */
const T = (key) => ({ weight: 'Wichtigkeit für Kunden', rowSum: 'Σ Zeile', colSum: 'Σ Spalte' })[key] ?? `T:${key}`;

/** @returns {Promise<any>} */
async function example() {
  const res = await fetch(EXAMPLE, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return State.fromJSON(await res.json());
}

/** Eine Zeile der Altform als Zellen: Texte ohne Anführungszeichen, Zahlen als Zahl. @param {string} line */
const cells = (line) => line.split(';').map((c) => (c.startsWith('"') ? c.slice(1, -1) : (c === '' ? '' : Number(c))));

suite('ce-matrix table — toRows', () => {
  test('Beispiel: Zellen gleich der Byte-Fixture der Altform', async () => {
    const rows = toRows(await example(), T);
    assertDeepEqual(rows, LEGACY_CSV_LINES.slice(1, -1).map(cells));
    assertDeepEqual(rows[0], ['Wichtigkeit für Kunden', 10, 9, 7, 8, '']);
    assertDeepEqual(rows.at(-1), ['Σ Spalte', 450, 387, 154, 368]);
  });
  test('als CSV des Kerns (de): Texte in Anführungszeichen, leere Zellen als ""', async () => {
    const lines = toCsvText(toRows(await example(), T), 'de').split('\n');
    assertEqual(lines[0], 'sep=;');
    assertEqual(lines[1], '"Wichtigkeit für Kunden";10;9;7;8;""');
    assertEqual(lines[2], '"";"Lieferzeit";"Pizza-Temperatur";"Adress-Trefferquote";"Reklamationsquote";"Σ Zeile"');
    for (let i = 3; i <= 10; i++) assertEqual(lines[i], LEGACY_CSV_LINES[i], `Zeile ${i}`);
    assertEqual(lines[11], '');
  });
  test('Zelle ohne Eintrag ist 0, Reihenfolge folgt den Listen', () => {
    const m = new State();
    m.setScore({ inputId: 'i2', outputId: 'o3', value: 4 });
    m.removeInput({ inputId: 'i1' });
    assertDeepEqual(toRows(m, T).slice(2), [
      ['Input 2', 0, 0, 4, 4], ['Input 3', 0, 0, 0, 0], ['Σ Spalte', 0, 0, 4],
    ]);
  });
});

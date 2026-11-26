/**
 * Tests for modules/ce-matrix/io/tree.js — der JSON-Wert für `exports.tree()`
 * ist zeichengleich mit dem JSON-Download der Altform (Byte-Fixture des
 * Beispiels, ohne BOM: der Kern lädt JSON ohne BOM herunter).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { toLegacyJSON } from '../../../js/modules/ce-matrix/io/tree.js';
import { State } from '../../../js/modules/ce-matrix/domain/model.js';
import { toJsonText } from '../../../js/core/exporter.js';
import { setModelName } from '../../../js/core/model.js';

setModelName(State, 'ce-matrix');

const EXAMPLE = new URL('../../../js/modules/ce-matrix/resources/examples/projects/ce-matrix-pizza-lieferzeit.json', import.meta.url);

/** Die Zeilen der Byte-Fixture `example-export.json` (ohne BOM, ohne Schluss-Zeilenende). */
const EXAMPLE_JSON_LINES = [
  '{',
  '  "inputs": [',
  '    "Routenplanung",',
  '    "Anzahl Bestellungen pro Stunde",',
  '    "Backofen-Auslastung",',
  '    "Erfahrung des Fahrers",',
  '    "Wetter / Verkehr",',
  '    "Qualität der Thermo-Verpackung",',
  '    "Zeit zwischen Backen und Abfahrt"',
  '  ],',
  '  "outputs": [',
  '    "Lieferzeit",',
  '    "Pizza-Temperatur",',
  '    "Adress-Trefferquote",',
  '    "Reklamationsquote"',
  '  ],',
  '  "scores": {',
  '    "0-0": 9,',
  '    "0-1": 4,',
  '    "0-2": 7,',
  '    "0-3": 7,',
  '    "1-0": 8,',
  '    "1-1": 5,',
  '    "1-2": 2,',
  '    "1-3": 6,',
  '    "2-0": 7,',
  '    "2-1": 8,',
  '    "2-2": 1,',
  '    "2-3": 7,',
  '    "3-0": 6,',
  '    "3-1": 2,',
  '    "3-2": 8,',
  '    "3-3": 5,',
  '    "4-0": 8,',
  '    "4-1": 6,',
  '    "4-2": 3,',
  '    "4-3": 6,',
  '    "5-0": 2,',
  '    "5-1": 9,',
  '    "5-2": 1,',
  '    "5-3": 8,',
  '    "6-0": 5,',
  '    "6-1": 9,',
  '    "6-2": 0,',
  '    "6-3": 7',
  '  },',
  '  "weights": [',
  '    10,',
  '    9,',
  '    7,',
  '    8',
  '  ],',
  '  "scale": "0-10"',
  '}',
];

/** @returns {Promise<any>} */
async function example() {
  const res = await fetch(EXAMPLE, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return State.fromJSON(await res.json());
}

suite('ce-matrix tree — toLegacyJSON', () => {
  test('Beispiel: als JSON-Text des Kerns zeichengleich mit dem Altexport', async () => {
    assertEqual(toJsonText(toLegacyJSON(await example())), EXAMPLE_JSON_LINES.join('\n'));
  });
  test('Positionen folgen den Listen, Reihenfolge der gespeicherten Bewertungen bleibt', () => {
    const m = State.fromJSON({ inputs: ['A', 'B'], outputs: ['X', 'Y'], scores: { '1-1': 3, '0-0': 1 }, weights: [4, 2] });
    m.removeInput({ inputId: 'i1' });
    m.setScore({ inputId: 'i2', outputId: 'o1', value: 9 });
    assertEqual(JSON.stringify(toLegacyJSON(m)), JSON.stringify({
      inputs: ['B'], outputs: ['X', 'Y'], scores: { '0-1': 3, '0-0': 9 }, weights: [4, 2], scale: '0-10',
    }));
  });
  test('Skala und Gewichte aus dem Model, Wert außerhalb der Skala bleibt', () => {
    const m = State.fromJSON({ inputs: ['X'], outputs: ['Y', 'Z'], scores: { '0-1': 5 }, weights: [10], scale: '0-1-3-9' });
    assertDeepEqual(toLegacyJSON(m), { inputs: ['X'], outputs: ['Y', 'Z'], scores: { '0-1': 5 }, weights: [10, 1], scale: '0-1-3-9' });
  });
});

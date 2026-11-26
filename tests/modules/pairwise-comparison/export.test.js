/**
 * Tests for modules/pairwise-comparison/io/export.js — `toRows` gleicht Zeile
 * für Zeile dem CSV-Download der Altform (Byte-Fixture `legacy-export.csv`
 * der E2E-Tests, hier als Literal), `toTree` dem JSON-Download ohne
 * `timestamp`; vor dem Ergebnis gibt es keine Datei (`null`).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { toRows, toTree } from '../../../js/modules/pairwise-comparison/io/export.js';
import { toCsvText } from '../../../js/core/exporter.js';

const CRITERIA = ['Kosten', 'Prüfaufwand; Stufe "B"', 'Lieferzeit', 'Service'];
const LEGACY = {
  criteria: CRITERIA,
  matrix: [[0, 1, 0.5, 1], [0, 0, 0, 1], [0.5, 1, 0, 0], [0, 0, 1, 0]],
  pairs: [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]],
  currentPair: 6,
};
/** Übersetzer mit dem deutschen Kopf der Summenspalte. @param {string} key */
const t = (key) => (key === 'sum' ? 'Summe' : key);

/**
 * Die Zeilen der Byte-Fixture (Altform, ohne BOM und `sep=;`):
 *   ;Kosten;"Prüfaufwand; Stufe ""B""";Lieferzeit;Service;Summe
 *   Kosten;-;1;0.5;1;2.5
 *   "Prüfaufwand; Stufe ""B""";0;-;0;1;1.0
 *   Lieferzeit;0.5;1;-;0;1.5
 *   Service;0;0;1;-;1.0
 */
const LEGACY_ROWS = [
  ['', ...CRITERIA, 'Summe'],
  ['Kosten', '-', 1, 0.5, 1, 2.5],
  ['Prüfaufwand; Stufe "B"', 0, '-', 0, 1, 1],
  ['Lieferzeit', 0.5, 1, '-', 0, 1.5],
  ['Service', 0, 0, 1, '-', 1],
];

/** Der JSON-Download der Altform (`legacy-export.json`) ohne `timestamp`. */
const LEGACY_TREE = {
  tool: 'pairwise-comparison',
  criteria: CRITERIA,
  matrix: LEGACY.matrix,
  scores: [2.5, 1, 1.5, 1],
  ranking: [
    { name: 'Kosten', score: 2.5, rank: 1 },
    { name: 'Lieferzeit', score: 1.5, rank: 2 },
    { name: 'Prüfaufwand; Stufe "B"', score: 1, rank: 3 },
    { name: 'Service', score: 1, rank: 4 },
  ],
};

suite('pairwise-comparison Export — toRows', () => {
  test('gleicht den Zeilen der Byte-Fixture (Zahlen als Zahl, Diagonale -)', () => {
    assertEqual(JSON.stringify(toRows(LEGACY, t)), JSON.stringify(LEGACY_ROWS));
  });

  test('Kern-CSV in de: nur Quoten und Dezimalzeichen weichen von der Altdatei ab', () => {
    assertEqual(toCsvText(/** @type {any} */ (toRows(LEGACY, t)), 'de'), [
      'sep=;',
      '"";"Kosten";"Prüfaufwand; Stufe ""B""";"Lieferzeit";"Service";"Summe"',
      '"Kosten";"-";1;0,5;1;2,5',
      '"Prüfaufwand; Stufe ""B""";0;"-";0;1;1',
      '"Lieferzeit";0,5;1;"-";0;1,5',
      '"Service";0;0;1;"-";1',
      '',
    ].join('\n'));
  });

  test('vor dem Ergebnis null: ohne Lauf und im laufenden Vergleich', () => {
    assertEqual(toRows({ ...LEGACY, matrix: [], pairs: [], currentPair: 0 }, t), null);
    assertEqual(toRows({ ...LEGACY, currentPair: 2 }, t), null);
  });
});

suite('pairwise-comparison Export — toTree', () => {
  test('gleicht dem JSON-Download ohne timestamp, Zeitstempel aus dem Aufruf', () => {
    const tree = /** @type {any} */ (toTree(LEGACY, '2026-06-07T12:00:00.000Z'));
    assertEqual(tree.timestamp, '2026-06-07T12:00:00.000Z');
    const { timestamp, ...rest } = tree;
    assertEqual(JSON.stringify(rest), JSON.stringify(LEGACY_TREE));
    assertDeepEqual(Object.keys(tree), ['tool', 'timestamp', 'criteria', 'matrix', 'scores', 'ranking']);
  });

  test('Kopien statt Bezügen', () => {
    const tree = /** @type {any} */ (toTree(LEGACY, 'x'));
    tree.matrix[0][1] = 9;
    tree.criteria.push('X');
    assertEqual(LEGACY.matrix[0][1], 1);
    assertEqual(LEGACY.criteria.length, 4);
  });

  test('vor dem Ergebnis null', () => {
    assertEqual(toTree({ ...LEGACY, currentPair: 5 }, 'x'), null);
    assertEqual(toTree({ criteria: [], matrix: [], pairs: [], currentPair: 0 }, 'x'), null);
  });
});

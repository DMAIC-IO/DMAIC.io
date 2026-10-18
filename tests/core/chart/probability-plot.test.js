/**
 * D.Mike — Wahrscheinlichkeitsnetz — Referenzgerade (`referenceLineOf`)
 *
 * Die Gerade geht durch die Punkte bei Q1 und Q3 auf der Achse der
 * Normalquantile; Zeichnung und Lesefläche des Moduls rechnen mit derselben
 * Funktion.
 */

import { suite, test, assertEqual, assertTrue, assertClose } from '../../test-utils.js';
import { referenceLineOf } from '../../../js/core/chart/types/probability-plot.js';

suite('probability-plot referenceLineOf', () => {
  test('symmetrische Werte: positive Steigung, Quantil 0 beim Median', () => {
    const line = referenceLineOf([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assertTrue(line.slope > 0, 'slope');
    assertClose(line.slope * 5 + line.intercept, 0, 1e-9, 'z beim Median');
  });

  test('unabhängig von der Reihenfolge', () => {
    const a = referenceLineOf([5, 1, 4, 2, 9, 3, 8, 7, 6]);
    const b = referenceLineOf([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assertEqual(a.slope, b.slope, 'slope');
    assertEqual(a.intercept, b.intercept, 'intercept');
  });

  test('weniger als zwei Werte: keine Gerade', () => {
    assertEqual(referenceLineOf([]), null, 'leer');
    assertEqual(referenceLineOf([3]), null, 'ein Wert');
  });
});

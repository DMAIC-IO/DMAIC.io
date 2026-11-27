/**
 * Tests for modules/data-transformation/io/export.js — die Paare für den
 * Kern-Export (Kopf übersetzt, Zahlen roh, ohne Werte null) und der Text des
 * Exportkastens (`toFixed(6)` zeichengleich mit der Altform).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { toRows, exportText, FILE_NAME } from '../../../js/modules/data-transformation/io/export.js';

suite('data-transformation Export', () => {
  test('Kopf übersetzt, je Paar eine Zeile mit rohen Zahlen; ohne Werte null', () => {
    assertDeepEqual(toRows([2.3, 3.1], [0.722490225852639, 0.934], ['Original', 'Transformed']),
      [['Original', 'Transformed'], [2.3, 0.722490225852639], [3.1, 0.934]]);
    assertDeepEqual(toRows([1], [2], ['Original', 'Transformiert']), [['Original', 'Transformiert'], [1, 2]]);
    assertEqual(toRows([], [], ['a', 'b']), null);
  });

  test('Exportkasten: sechs Nachkommastellen mit Punkt, eine Zeile je Wert, ohne Zeilenende am Schluss', () => {
    assertEqual(exportText([0.7224902258526392, -1.5, 2]), '0.722490\n-1.500000\n2.000000');
    assertEqual(exportText([]), '');
  });

  test('Dateiname wie die Altform', () => {
    assertEqual(FILE_NAME, 'transformation');
  });
});

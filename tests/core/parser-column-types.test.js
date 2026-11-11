/**
 * Tests for core/parser/column-types.js
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import { detectColumnType } from '../../js/core/parser/column-types.js';

suite('parser/column-types — detectColumnType', () => {
  test('Ganzzahlen als Text werden numeric', () => {
    const r = detectColumnType(['1', '2', '3']);
    assertEqual(r.type, 'numeric');
    assertDeepEqual(r.values, [1, 2, 3]);
  });

  test('Dezimalkomma wird gelesen', () => {
    const r = detectColumnType(['1,5', '2,5']);
    assertEqual(r.type, 'numeric');
    assertDeepEqual(r.values, [1.5, 2.5]);
  });

  test('7 von 10 Zahlen: numeric, Wörter werden null', () => {
    const r = detectColumnType(['1', '2', '3', '4', '5', '6', '7', 'a', 'b', 'c']);
    assertEqual(r.type, 'numeric');
    assertDeepEqual(r.values, [1, 2, 3, 4, 5, 6, 7, null, null, null]);
  });

  test('6 von 10 Zahlen: text, alle Werte als String', () => {
    const input = ['1', '2', '3', '4', '5', '6', 'a', 'b', 'c', 'd'];
    const r = detectColumnType(input);
    assertEqual(r.type, 'text');
    assertDeepEqual(r.values, input);
  });

  test('Währung mit 2 Nachkommastellen', () => {
    const r = detectColumnType(['3 €', '4 €', '5 €']);
    assertEqual(r.type, 'currency');
    assertDeepEqual(r.values, [3, 4, 5]);
    assertEqual(r.format.decimals, 2);
  });

  test('Prozent mit 1 Nachkommastelle', () => {
    const r = detectColumnType(['10%', '20%']);
    assertEqual(r.type, 'percent');
    assertEqual(r.format.decimals, 1);
  });

  test('Datum wird ISO', () => {
    const r = detectColumnType(['24.12.2026', '01.01.2027']);
    assertEqual(r.type, 'date');
    assertDeepEqual(r.values, ['2026-12-24', '2027-01-01']);
  });

  test('Uhrzeit', () => {
    assertEqual(detectColumnType(['8:30', '9:15']).type, 'time');
  });

  test('nur null: Ergebnis null', () => {
    assertEqual(detectColumnType([null, null]), null);
    assertEqual(detectColumnType([]), null);
  });

  test('echte Zahlen mit einem Wort: numeric', () => {
    const r = detectColumnType([1, 2, 3, 4, 5, 6, 7, 'x', 'y', 'z']);
    assertEqual(r.type, 'numeric');
    assertDeepEqual(r.values, [1, 2, 3, 4, 5, 6, 7, null, null, null]);
  });

  test('2 von 3 echten Zahlen liegt unter der Schwelle: text', () => {
    assertEqual(detectColumnType([1, 2, 'x']).type, 'text');
  });

  test('vorgegebene Nachkommastellen bleiben', () => {
    const r = detectColumnType(['3 €', '4 €'], { format: { decimals: 3 } });
    assertEqual(r.format.decimals, 3);
  });

  test('Eingaben bleiben unverändert', () => {
    const values = ['3 €', null, '4 €'];
    const format = { unit: 'x' };
    detectColumnType(values, { format });
    assertDeepEqual(values, ['3 €', null, '4 €']);
    assertDeepEqual(format, { unit: 'x' });
  });

  test('null-Werte bleiben null', () => {
    assertDeepEqual(detectColumnType(['1', null, '3']).values, [1, null, 3]);
  });

  test('Textspalte: Zahlen werden zu String', () => {
    const r = detectColumnType(['a', 'b', 1]);
    assertEqual(r.type, 'text');
    assertDeepEqual(r.values, ['a', 'b', '1']);
  });
});

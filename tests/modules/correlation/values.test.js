/**
 * Korrelation: Spaltenwerte als Zahlen (domain/values.js) — Datum, Zeit,
 * Paarung mit Leerwerten.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { toNumeric, pairedValues, numericColumn, countValues } from '../../../js/modules/correlation/domain/values.js';
import { storedSource } from '../../helpers/stored-source.js';

suite('correlation: values', () => {
  test('Zahlenspalten: nur echte Zahlen, Text und NaN zählen nicht', () => {
    assertEqual(toNumeric(2.5, 'numeric'), 2.5);
    assertEqual(toNumeric('2,5', 'numeric'), null);
    assertEqual(toNumeric(NaN, 'currency'), null);
    assertEqual(toNumeric(null, 'numeric'), null);
    assertEqual(toNumeric(7, undefined), 7);
  });

  test('Datum über Date.parse, Zeit h:mm[:ss] in Sekunden', () => {
    assertEqual(toNumeric('2026-01-02', 'date'), Date.parse('2026-01-02'));
    assertEqual(toNumeric('kein Datum', 'date'), null);
    assertEqual(toNumeric(3, 'date'), null);
    assertEqual(toNumeric('1:16', 'time'), 4560);
    assertEqual(toNumeric('01:02:03', 'time'), 3723);
    assertEqual(toNumeric('1:2', 'time'), null);
    assertEqual(toNumeric(60, 'time'), null);
  });

  test('Paarung zeilenweise bis zur kürzeren, Zeilen mit Lücke fallen', () => {
    assertDeepEqual(pairedValues([1, null, 3, 4, 5], [10, 20, null, 40]), { x: [1, 4], y: [10, 40] });
    assertEqual(countValues([1, null, 3]), 2);
  });

  test('Spalte über den Leser: Art aus dem Kopf, gelöscht ergibt null', () => {
    const src = storedSource({ ws1: { sheets: [{ id: 's1', name: 'S', state: { columns: [
      { id: 'c1', name: 'Dauer', shortName: 'C1', type: 'time', values: ['1:00', null, 'x'] },
    ] } }] } });
    assertDeepEqual(numericColumn(src, { instanceId: 'ws1', sheetId: 's1', columnId: 'c1' }), { name: 'Dauer', values: [3600, null, null] });
    assertEqual(numericColumn(src, { instanceId: 'ws1', sheetId: 's1', columnId: 'weg' }), null);
  });
});

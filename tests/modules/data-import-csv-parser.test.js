/**
 * Tests für parseCsv (data-import/csv-parser.js) — Trennzeichenerkennung bei
 * `auto` und Zahlenerkennung mit deutschem Format. DOM-frei.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { parseCsv } from '../../js/modules/data-import/csv-parser.js';

const buf = (s) => new TextEncoder().encode(s).buffer;

suite('Data Import — parseCsv', () => {
  test('deutsches CSV bei auto: Semikolon, Dezimalkomma', async () => {
    const out = await parseCsv(buf('A;B\n1,5;2,5\n3,5;4,5\n'), { delimiter: 'auto' });
    const cols = out.sheets[0].columns;
    assertEqual(cols.length, 2);
    assertEqual(cols[0].name, 'A');
    assertEqual(cols[0].type, 'numeric');
    assertDeepEqual(cols[0].values, [1.5, 3.5]);
    assertDeepEqual(cols[1].values, [2.5, 4.5]);
  });

  test('englisches CSV mit ; im Quote-Text bleibt Komma-getrennt', async () => {
    const out = await parseCsv(buf('Name,Note\nx,"a; b; c"\ny,"d; e"\n'), {});
    const cols = out.sheets[0].columns;
    assertEqual(cols.length, 2);
    assertDeepEqual(cols[1].values, ['a; b; c', 'd; e']);
  });

  test('Tausenderpunkt mit Dezimalkomma: 1.234,5 → 1234.5', async () => {
    const out = await parseCsv(buf('Wert;X\n1.234,5;1\n2,5;2\n'), {});
    const col = out.sheets[0].columns[0];
    assertEqual(col.type, 'numeric');
    assertDeepEqual(col.values, [1234.5, 2.5]);
  });

  test('englische Dezimalpunkte bleiben numerisch', async () => {
    const out = await parseCsv(buf('A,B\n1.5,2e3\n-3.25,4\n'), {});
    const cols = out.sheets[0].columns;
    assertDeepEqual(cols[0].values, [1.5, -3.25]);
    assertDeepEqual(cols[1].values, [2000, 4]);
  });

  test('Text-Spalte bleibt Text', async () => {
    const out = await parseCsv(buf('A;B\nfoo;1\nbar;2\n'), {});
    assertEqual(out.sheets[0].columns[0].type, 'text');
  });
});

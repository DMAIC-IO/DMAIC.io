/**
 * Tests für detectDelimiter und readCsvRecords (core/parser/csv.js) —
 * Trennzeichenerkennung und quote-aware Zerlegung für den CSV-Import im
 * Worksheet und im Datenimport. DOM-frei, läuft auch im node-Runner.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { detectDelimiter, readCsvRecords } from '../../js/core/parser/csv.js';
import { formatCellValue, formatGridNumber, parseNumeric, parseCellInput } from '../../js/core/datagrid/datagrid-utils.js';

suite('detectDelimiter', () => {
  const cases = [
    ['deutsch: Semikolon + Dezimalkomma', 'A;B\n1,5;2,5\n3,5;4,5\n', ';'],
    ['deutsch in Anführungszeichen', '"A";"B"\n"1,5";"2,5"\n"3,5";"4,5"\n', ';'],
    ['englisch mit ; im Quote-Text', 'Name,Note\nx,"a; b; c"\ny,"d; e"\n', ','],
    ['englisch schlicht', 'A,B\n1.5,2.5\n3.5,4.5\n', ','],
    ['Tab', 'A\tB\n1,5\t2,5\n3,5\t4,5\n', '\t'],
    ['Pipe', 'A|B\n1.5|2.5\n3.5|4.5\n', '|'],
    ['BOM vor deutschem CSV', '﻿A;B\n1,5;2,5\n3,5;4,5\n', ';'],
    ['CRLF', 'A;B\r\n1,5;2,5\r\n3,5;4,5\r\n', ';'],
    ['mehrdeutig ohne Kopf → Komma', '1,5\n2,5\n', ','],
  ];
  for (const [name, text, expected] of cases) {
    test(name, () => {
      assertEqual(JSON.stringify(detectDelimiter(text)), JSON.stringify(expected));
    });
  }

  test('eine Spalte mit Dezimalkomma ergibt eine Spalte', () => {
    const text = 'Wert\n1,5\n2,5\n3,5\n';
    const delim = detectDelimiter(text);
    const rows = readCsvRecords(text, { delimiter: delim });
    assertEqual(rows.every(r => r.length === 1), true);
  });

  test('leerer Text ergibt einen Trenner, der nicht vorkommt', () => {
    const delim = detectDelimiter('');
    assertEqual(typeof delim, 'string');
    assertEqual(delim.length, 1);
  });
});

suite('readCsvRecords', () => {
  test('Mehrzeilen-Feld in Anführungszeichen bleibt ein Feld', () => {
    const rows = readCsvRecords('A;B\n"Zeile 1\nZeile 2";2\n', { delimiter: ';' });
    assertDeepEqual(rows, [['A', 'B'], ['Zeile 1\nZeile 2', '2']]);
  });

  test('CRLF und CR trennen Datensätze, "" ist ein escaptes Anführungszeichen', () => {
    const rows = readCsvRecords('A,B\r\n"x ""y""",1\r2,3', { delimiter: ',' });
    assertDeepEqual(rows, [['A', 'B'], ['x "y"', '1'], ['2', '3']]);
  });

  test('leere Zeilen werden übersprungen, BOM entfernt', () => {
    const rows = readCsvRecords('﻿A\n\n  \n1\n', { delimiter: ',' });
    assertDeepEqual(rows, [['A'], ['1']]);
  });

  test('ein " mitten im Feld ist ein Literalzeichen (RFC 4180)', () => {
    const rows = readCsvRecords('A;B\n12" Rohr;3\nx;4', { delimiter: ';' });
    assertDeepEqual(rows, [['A', 'B'], ['12" Rohr', '3'], ['x', '4']]);
  });

  test('ein Zoll-Zeichen verhindert die Erkennung von ; nicht', () => {
    assertEqual(detectDelimiter('A;B\n12" Rohr;3\nx;4\n'), ';');
  });
});

suite('Datentabelle — Zahlen nach App-Sprache anzeigen und lesen', () => {
  test('Anzeige in de mit Komma, in en mit Punkt', () => {
    assertEqual(formatCellValue({ type: 'numeric', format: {} }, 24.5, 'de'), '24,5');
    assertEqual(formatCellValue({ type: 'numeric', format: {} }, 24.5, 'en'), '24.5');
    assertEqual(formatCellValue({ type: 'currency', format: { decimals: 2 } }, 24.5, 'de'), '24,50 €');
    assertEqual(formatCellValue({ type: 'percent', format: {} }, 24.5, 'de'), '24,5 %');
  });
  test('e-Schreibweise bleibt bei sechs gültigen Stellen', () => {
    assertEqual(formatGridNumber(1e-7, null, 'de'), '1,00000e-7');
    assertEqual(formatGridNumber(1e-7, null, 'en'), '1.00000e-7');
  });
  test('parseNumeric: Komma oder Punkt, ungültig ergibt null', () => {
    assertEqual(parseNumeric('1.234'), 1.234);
    assertEqual(parseNumeric('1,234.5'), 1234.5);
    assertEqual(parseNumeric('1.234,5'), 1234.5);
    assertEqual(parseNumeric('1.23,5'), null);
    assertEqual(parseNumeric(''), null);
  });
  test('parseCellInput liest beide Schreibweisen', () => {
    assertEqual(parseCellInput({ type: 'numeric' }, '1,5'), 1.5);
    assertEqual(parseCellInput({ type: 'currency' }, '2,50 €'), 2.5);
  });
});

suite('sep=-Zeile', () => {
  test('detectDelimiter und readCsvRecords lesen und überspringen sie', () => {
    const t = 'sep=;\r\na;b\r\n1,5;2\r\n';
    assertEqual(detectDelimiter(t), ';');
    assertDeepEqual(readCsvRecords(t, { delimiter: ';' }), [['a', 'b'], ['1,5', '2']]);
  });
});

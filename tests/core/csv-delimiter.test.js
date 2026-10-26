/**
 * Tests für detectDelimiter und parseCSVRecords (datagrid-utils.js) —
 * Trennzeichenerkennung und quote-aware Zerlegung für den CSV-Import im
 * Worksheet und im Datenimport. DOM-frei, läuft auch im node-Runner.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { detectDelimiter, parseCSVRecords } from '../../js/core/datagrid/datagrid-utils.js';

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
    const rows = parseCSVRecords(text, delim);
    assertEqual(rows.every(r => r.length === 1), true);
  });

  test('leerer Text ergibt einen Trenner, der nicht vorkommt', () => {
    const delim = detectDelimiter('');
    assertEqual(typeof delim, 'string');
    assertEqual(delim.length, 1);
  });
});

suite('parseCSVRecords', () => {
  test('Mehrzeilen-Feld in Anführungszeichen bleibt ein Feld', () => {
    const rows = parseCSVRecords('A;B\n"Zeile 1\nZeile 2";2\n', ';');
    assertDeepEqual(rows, [['A', 'B'], ['Zeile 1\nZeile 2', '2']]);
  });

  test('CRLF und CR trennen Datensätze, "" ist ein escaptes Anführungszeichen', () => {
    const rows = parseCSVRecords('A,B\r\n"x ""y""",1\r2,3', ',');
    assertDeepEqual(rows, [['A', 'B'], ['x "y"', '1'], ['2', '3']]);
  });

  test('leere Zeilen werden übersprungen, BOM entfernt', () => {
    const rows = parseCSVRecords('﻿A\n\n  \n1\n', ',');
    assertDeepEqual(rows, [['A'], ['1']]);
  });

  test('ein " mitten im Feld ist ein Literalzeichen (RFC 4180)', () => {
    const rows = parseCSVRecords('A;B\n12" Rohr;3\nx;4', ';');
    assertDeepEqual(rows, [['A', 'B'], ['12" Rohr', '3'], ['x', '4']]);
  });

  test('ein Zoll-Zeichen verhindert die Erkennung von ; nicht', () => {
    assertEqual(detectDelimiter('A;B\n12" Rohr;3\nx;4\n'), ';');
  });
});

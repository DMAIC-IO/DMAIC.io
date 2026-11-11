/**
 * Tests für den zentralen CSV-Parser (core/parser/csv.js). DOM-frei.
 * Die Datensatzfälle waren vorab gegen die frühere Satzzerlegung des Grids
 * gemessen; erwartet ist ihr Ergebnis.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import {
  parseCsvText, parseCsv, readCsvRecords, detectDelimiter, stripSepLine, CSV_PRESETS, CSV_OPTIONS,
} from '../../js/core/parser/csv.js';

const cases = [
  ["Anführungszeichen mit Trennzeichen", "A,B\n\"x,y\",2\n3,4", ",", [["A","B"],["x,y","2"],["3","4"]]],
  ["\"\" als Anführungszeichen", "A,B\n\"x \"\"y\"\"\",1\n2,3", ",", [["A","B"],["x \"y\"","1"],["2","3"]]],
  ["Umbruch im Feld", "A;B\n\"Zeile 1\nZeile 2\";2\n", ";", [["A","B"],["Zeile 1\nZeile 2","2"]]],
  ["sep=-Zeile", "sep=;\r\na;b\r\n1,5;2\r\n", ";", [["a","b"],["1,5","2"]]],
  ["BOM", "﻿A\n\n  \n1\n", ",", [["A"],["1"]]],
  ["leere und Leerzeichen-Zeilen", "A,B\n\n   \n1,2\n\n", ",", [["A","B"],["1","2"]]],
  ["Zeile aus Trennzeichen bleibt erhalten", "A,B\n,\n1,2", ",", [["A","B"],["",""],["1","2"]]],
  ["ungleich lange Zeilen", "A,B,C\n1\n2,3\n4,5,6,7", ",", [["A","B","C"],["1"],["2","3"],["4","5","6","7"]]],
  ["Semikolon", "a;b\n1;2", ";", [["a","b"],["1","2"]]],
  ["Tab", "a\tb\n1\t2", "\t", [["a","b"],["1","2"]]],
  ["Pipe", "a|b\n1|2", "|", [["a","b"],["1","2"]]],
  ["12\" Rohr", "A;B\n12\" Rohr;3\nx;4", ";", [["A","B"],["12\" Rohr","3"],["x","4"]]],
  ["nur \\r", "A,B\r1,2\r3,4", ",", [["A","B"],["1","2"],["3","4"]]],
  ["Trennzeichen am Zeilenende", "a|b\n1|2|\n3|4|", "|", [["a","b"],["1","2",""],["3","4",""]]],
  ["gemischte Zeilenenden", "A,B\r\n\"x \"\"y\"\"\",1\r2,3\n4,5", ",", [["A","B"],["x \"y\"","1"],["2","3"],["4","5"]]],
];

suite('CSV-Parser — Datensätze', () => {
  for (const [name, text, delim, expected] of cases) {
    test(name, () => {
      assertDeepEqual(readCsvRecords(text, { delimiter: delim }), expected);
    });
  }

  test('Umbruch im Feld in Anführungszeichen: \\r\\n wird \\n', () => {
    assertDeepEqual(readCsvRecords('A,B\n"x\r\ny",2', { delimiter: ',' }), [['A', 'B'], ['x\ny', '2']]);
  });

  test('detectDelimiter wie bisher', () => {
    assertEqual(detectDelimiter('A;B\n1,5;2,5\n3,5;4,5\n'), ';');
    assertEqual('Wert\n1,5\n2,5\n'.includes(detectDelimiter('Wert\n1,5\n2,5\n')), false);
    assertEqual(detectDelimiter('sep=;\r\na;b\r\n'), ';');
    assertEqual(detectDelimiter('A;B\n12" Rohr;3\nx;4\n'), ';');
    assertEqual(detectDelimiter('').length, 1);
  });

  test('stripSepLine', () => {
    assertDeepEqual(stripSepLine('sep=;\na;b'), { text: 'a;b', delim: ';' });
    assertDeepEqual(stripSepLine('a;b'), { text: 'a;b', delim: null });
  });
});

suite('CSV-Parser — parseCsvText', () => {
  const cols = (text, opts) => parseCsvText(text, opts).sheets[0].columns;

  test("hasHeader 'auto' erkennt Kopf und Daten", () => {
    const a = cols('1;2\n3;4', { hasHeader: 'auto' });
    assertDeepEqual(a.map(c => c.values), [[1, 3], [2, 4]]);
    assertEqual(a[0].name, '');
    const b = cols('A;B\n1;2', { hasHeader: 'auto' });
    assertEqual(b[0].name, 'A');
    assertDeepEqual(b[1].values, [2]);
  });

  test('ohne Kopfzeile: name leer, shortName C<n>', () => {
    const c = cols('x;y\n1;2', { hasHeader: false });
    assertEqual(c[0].name, '');
    assertEqual(c[0].shortName, 'C1');
    assertEqual(c[1].shortName, 'C2');
    assertEqual(parseCsvText('x;y\n1;2', { hasHeader: false }).sheets[0].rowCount, 2);
  });

  test('skipRows verwirft Zeilen vor der Trennzeichenerkennung', () => {
    const c = cols('Meta, mit, Kommas\nnoch Meta\nA;B\n1;2', { skipRows: 2 });
    assertDeepEqual(c.map(x => x.name), ['A', 'B']);
  });

  test('delimiter schlägt die Erkennung', () => {
    const c = cols('A;B,C\n1;2,3', { delimiter: 'comma' });
    assertDeepEqual(c.map(x => x.name), ['A;B', 'C']);
  });

  test('leerer Text wirft errCsvEmpty', () => {
    let code = null;
    try { parseCsvText('  \n '); } catch (e) { code = e.code; }
    assertEqual(code, 'errCsvEmpty');
  });

  test('Textzellen werden getrimmt', () => {
    assertDeepEqual(cols('A\n x \n')[0].values, ['x']);
  });

  test('Schwelle: 7 von 10 Zahlen sind Zahl, 6 von 10 Text', () => {
    const mk = (n) => 'A\n' + [...Array(10)].map((_, i) => (i < n ? String(i + 1) : 'w' + i)).join('\n');
    assertEqual(cols(mk(7))[0].type, 'numeric');
    assertEqual(cols(mk(6))[0].type, 'text');
  });

  test('Währung wird erkannt', () => {
    const c = cols('Preis\n3 €\n4 €')[0];
    assertEqual(c.type, 'currency');
    assertDeepEqual(c.values, [3, 4]);
    assertEqual(c.format.decimals, 2);
  });

  test('Blattname aus dem Dateinamen, Spalte ohne Werte ist Text', () => {
    const s = parseCsvText('A;B\n1;\n2;', { filename: 'daten.csv' }).sheets[0];
    assertEqual(s.name, 'daten');
    assertEqual(s.columns[1].type, 'text');
    assertDeepEqual(s.columns[1].values, [null, null]);
  });

  test('parseCsv liest Bytes mit Kodierung und BOM', async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Ä;B\n1;2')]);
    const out = await parseCsv(bytes.buffer, {});
    assertEqual(out.format, 'csv');
    assertEqual(out.sheets[0].columns[0].name, 'Ä');
    const latin = await parseCsv(new Uint8Array([0xc4, 0x3b, 0x42, 0x0a, 0x31, 0x3b, 0x32]).buffer, { encoding: 'windows-1252' });
    assertEqual(latin.sheets[0].columns[0].name, 'Ä');
  });

  test('CSV_OPTIONS und CSV_PRESETS', () => {
    assertEqual(CSV_OPTIONS.kind, 'object');
    assertDeepEqual(Object.keys(CSV_OPTIONS.shape), ['delimiter', 'encoding', 'hasHeader', 'skipRows', 'preset']);
    assertEqual(CSV_OPTIONS.shape.delimiter.default, 'auto');
    assertEqual(CSV_OPTIONS.shape.encoding.default, 'utf-8');
    assertEqual(CSV_OPTIONS.shape.hasHeader.default, true);
    assertEqual(CSV_OPTIONS.shape.skipRows.default, 0);
    assertEqual(CSV_OPTIONS.shape.preset.default, 'generic');
    assertDeepEqual(CSV_PRESETS['zeiss-calypso'], { delimiter: 'semicolon', encoding: 'windows-1252', skipRows: 4, hasHeader: true });
  });
});

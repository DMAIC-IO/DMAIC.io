/**
 * Tests für die reinen Serialisierer in js/core/exporter.js.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows } from '../test-utils.js';
import { EXPORT_FORMATS, formatsOf, toCsvText, toJsonText, sheetName, svgSize, withStyle } from '../../js/core/exporter.js';

suite('exporter: toCsvText', () => {
  test('sep-Zeile, Anführungszeichen, Trenner, Zeilenende auch am Schluss', () => {
    assertEqual(toCsvText([['Suppliers', 'Inputs'], ['Mühle', 'Er sagt "hi"']]),
      'sep=;\n"Suppliers";"Inputs"\n"Mühle";"Er sagt ""hi"""\n');
  });

  test('null und undefined leer, Zahlen über String', () => {
    assertEqual(toCsvText([[null, undefined, '', 'x']], 'en'), 'sep=;\n"";"";"";"x"\n');
  });

  test('Zahlen im Eingabeprofil, ohne Anführungszeichen, Dezimalzeichen der Sprache', () => {
    assertEqual(toCsvText([['a', 1.5]], 'de'), 'sep=;\n"a";1,5\n');
    assertEqual(toCsvText([['a', 1.5]], 'en'), 'sep=;\n"a";1.5\n');
    assertEqual(toCsvText([[0.1 + 0.2, -2]], 'de'), 'sep=;\n0,30000000000000004;-2\n');
  });

  test('byte-gleich zur bisherigen SIPOC-Ausgabe', () => {
    const rows = [
      ['Suppliers', 'Inputs', 'Process', 'Outputs', 'Customers'],
      ['Mühle', 'Mehl', '', '', ''],
      ['Er sagt "hi"', '', '', '', ''],
    ];
    assertEqual(toCsvText(rows), [
      'sep=;',
      '"Suppliers";"Inputs";"Process";"Outputs";"Customers"',
      '"Mühle";"Mehl";"";"";""',
      '"Er sagt ""hi""";"";"";"";""',
      '',
    ].join('\n'));
  });
});

suite('exporter: toJsonText, sheetName, svgSize, withStyle', () => {
  test('JSON mit zwei Leerzeichen Einzug', () => {
    assertEqual(toJsonText({ a: [1] }), '{\n  "a": [\n    1\n  ]\n}');
  });

  test('Blattname: höchstens 31 Zeichen, ohne []:*?/\\, leer → Sheet1', () => {
    assertEqual(sheetName('SIPOC'), 'SIPOC');
    assertEqual(sheetName('a[b]:c*d?e/f\\g'), 'abcdefg');
    assertEqual(sheetName('x'.repeat(40)), 'x'.repeat(31));
    assertEqual(sheetName(''), 'Sheet1');
  });

  test('svgSize liest width/height am Wurzelelement', () => {
    assertDeepEqual(svgSize('<svg xmlns="http://www.w3.org/2000/svg" width="448" height="170" viewBox="0 0 448 170"><rect width="1" height="2"/></svg>'),
      { width: 448, height: 170 });
    assertDeepEqual(svgSize('<svg width="10.5px" height="3"></svg>'), { width: 10.5, height: 3 });
  });

  test('svgSize ohne width/height ist ein Fehler', () => {
    assertThrows(() => svgSize('<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>'), /^svg: width and height required on the root element$/);
    assertThrows(() => svgSize('kein svg'), /^svg: width and height required on the root element$/);
  });

  test('withStyle legt <defs><style> hinter das öffnende <svg>', () => {
    assertEqual(withStyle('<svg width="1" height="1"><rect/></svg>', '@font-face{}'),
      '<svg width="1" height="1"><defs><style>@font-face{}</style></defs><rect/></svg>');
  });
});

suite('exporter: formatsOf', () => {
  const f = () => [];
  test('feste Reihenfolge, nur vorhandene Mapper', () => {
    assertDeepEqual([...EXPORT_FORMATS], ['xlsx', 'csv', 'json', 'png', 'svg']);
    assertDeepEqual(formatsOf({ table: f, tree: f, image: f }), ['xlsx', 'csv', 'json', 'png', 'svg']);
    assertDeepEqual(formatsOf({ tables: f }), ['xlsx']);
    assertDeepEqual(formatsOf({ tree: f }), ['json']);
    assertDeepEqual(formatsOf({ image: f, fileName: 'x' }), ['png', 'svg']);
  });
});

/**
 * Arbeitsblatt: Datei-Eingabe und CSV-Export der Zielform (io/import.js,
 * io/export.js). Der CSV-Text muss zeichengleich zum Export der Altform sein
 * (`DataGrid.exportToCSV`), verglichen mit dessen echter Ausgabe derselben Daten.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { DataGrid } from '../../../js/core/datagrid/datagrid.js';
import { TableData } from '../../../js/core/table-data.js';
import { sheetCsv } from '../../../js/modules/worksheet/io/export.js';
import { IMPORT_ACCEPT, importKind } from '../../../js/modules/worksheet/io/import.js';

/** Ein Blatt der Zielform aus Köpfen und Spaltenwerten. */
function sheetOf(heads, columns) {
  const rowCount = columns[0].length;
  return {
    columns: heads.map((hd, i) => ({ id: `c${i}`, shortName: `C${i + 1}`, name: '', format: {}, ...hd })),
    data: TableData.fromJSON({ rowCount, columns }),
  };
}

/** Die Ausgabe der Altform für dieselben Daten (echter Code, Attrappe nur als `this`). */
function legacyCsv(sheet, lang) {
  const fake = {
    _lang: () => lang,
    rowCount: sheet.data.rowCount,
    columns: sheet.columns.map((c, i) => ({ name: c.name, shortName: c.shortName, format: { ...c.format }, values: sheet.data.columns[i] })),
  };
  return DataGrid.prototype.exportToCSV.call(fake);
}

const SAMPLE = sheetOf(
  [{ name: 'Länge', format: { decimals: 2 } }, { name: 'Notiz' }, {}, { name: 'Zahl' }],
  [
    [1.5, 1234.5678, null, -0.1],
    ['a;b', 'er sagte "x"', 'Zeile\nUmbruch', 'schlicht'],
    [true, false, null, true],
    [0.1 + 0.2, 1e21, 3, null],
  ],
);

suite('worksheet io: CSV-Export wie die Altform', () => {
  for (const lang of ['de', 'en']) {
    test(`zeichengleich zu DataGrid.exportToCSV (${lang})`, () => {
      assertEqual(sheetCsv(SAMPLE, lang), legacyCsv(SAMPLE, lang));
    });
  }

  test('Form: sep-Zeile, Kopf aus Name oder Kurzname, \\r\\n ohne Schluss-Umbruch, true ohne Anführungszeichen', () => {
    const lines = sheetCsv(SAMPLE, 'de').split('\r\n');
    assertEqual(lines[0], 'sep=;');
    assertEqual(lines[1], 'Länge;Notiz;C3;Zahl');
    assertEqual(lines[2], '1,50;"a;b";true;0,30000000000000004');
    assertEqual(lines.at(-1), '-0,10;schlicht;true;');
  });

  test('ein Kopf mit Trenner oder Anführungszeichen steht in Anführungszeichen', () => {
    const sheet = sheetOf([{ name: 'a;b' }, { name: 'x"y' }], [[1], [2]]);
    assertEqual(sheetCsv(sheet, 'en').split('\r\n')[1], '"a;b";"x""y"');
  });
});

suite('worksheet io: Datei-Eingabe wie die Altform', () => {
  test('nur CSV und TSV werden angeboten und gelesen', () => {
    assertEqual(IMPORT_ACCEPT, '.csv,.tsv');
    assertDeepEqual(importKind('a.CSV'), { kind: 'csv', ext: 'csv' });
    assertDeepEqual(importKind('a.tsv'), { kind: 'csv', ext: 'tsv' });
    assertDeepEqual(importKind('a.xlsx'), { kind: 'unsupported', ext: 'xlsx' });
  });
});

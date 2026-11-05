import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { State } from '../../js/modules/sipoc/domain/model.js';
import { toJSONExport, toCSV, toRows, toImageColumns, FILE_NAMES } from '../../js/modules/sipoc/io/export.js';

const t = (k) => ({ 'col.suppliers': 'Suppliers', 'col.inputs': 'Inputs', 'col.process': 'Process', 'col.outputs': 'Outputs', 'col.customers': 'Customers' }[k] ?? `[${k}]`);
const s = State.fromJSON({ columns: { suppliers: ['Mühle', 'Er sagt "hi"'], inputs: ['Mehl'], process: [], outputs: [], customers: [] } });

suite('SIPOC — Exporte', () => {
  test('JSON: tool, timestamp, sipoc je Spalte', () => {
    const out = JSON.parse(toJSONExport(s, new Date('2026-11-05T10:00:00Z')));
    assertEqual(out.tool, 'SIPOC');
    assertEqual(out.timestamp, '2026-11-05T10:00:00.000Z');
    assertDeepEqual(out.sipoc.suppliers, ['Mühle', 'Er sagt "hi"']);
    assertDeepEqual(Object.keys(out.sipoc), ['suppliers', 'inputs', 'process', 'outputs', 'customers']);
  });
  test('CSV: sep-Zeile, Kopf, Zeilen bis zur längsten Spalte, Anführungszeichen verdoppelt', () => {
    assertEqual(toCSV(s, t), [
      'sep=;',
      '"Suppliers";"Inputs";"Process";"Outputs";"Customers"',
      '"Mühle";"Mehl";"";"";""',
      '"Er sagt ""hi""";"";"";"";""',
      '',
    ].join('\n'));
  });
  test('CSV leer: Kopf plus eine leere Zeile', () => {
    assertEqual(toCSV(new State(), t).split('\n').length, 4);
  });
  test('Zeilen für XLSX', () => {
    assertDeepEqual(toRows(s, t)[0], ['Suppliers', 'Inputs', 'Process', 'Outputs', 'Customers']);
    assertDeepEqual(toRows(s, t)[2], ['Er sagt "hi"', '', '', '', '']);
  });
  test('Bildspalten: Titel groß, Beschreibung, Farbe aus colors', () => {
    const cols = toImageColumns(s, t, { suppliers: 'rgb(1, 2, 3)' });
    assertDeepEqual(cols[0], { title: 'SUPPLIERS', desc: '[colDesc.suppliers]', color: 'rgb(1, 2, 3)', items: ['Mühle', 'Er sagt "hi"'] });
    assertEqual(cols[1].color, '');
  });
  test('Dateinamen', () => {
    assertDeepEqual(FILE_NAMES, { json: 'sipoc.json', csv: 'sipoc.csv', xlsx: 'sipoc.xlsx', png: 'sipoc.png', svg: 'sipoc.svg' });
  });
});

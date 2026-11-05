import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { State } from '../../js/modules/sipoc/domain/model.js';
import { toJSONObject, toRows, toImageColumns } from '../../js/modules/sipoc/io/export.js';
import { toCsvText } from '../../js/core/exporter.js';

const t = (k) => ({ 'col.suppliers': 'Suppliers', 'col.inputs': 'Inputs', 'col.process': 'Process', 'col.outputs': 'Outputs', 'col.customers': 'Customers' }[k] ?? `[${k}]`);
const s = State.fromJSON({ columns: { suppliers: ['Mühle', 'Er sagt "hi"'], inputs: ['Mehl'], process: [], outputs: [], customers: [] } });

suite('SIPOC — Exporte', () => {
  test('JSON-Objekt: tool, timestamp, sipoc je Spalte', () => {
    const out = toJSONObject(s, new Date('2026-11-05T10:00:00Z'));
    assertEqual(out.tool, 'SIPOC');
    assertEqual(out.timestamp, '2026-11-05T10:00:00.000Z');
    assertDeepEqual(out.sipoc.suppliers, ['Mühle', 'Er sagt "hi"']);
    assertDeepEqual(Object.keys(out.sipoc), ['suppliers', 'inputs', 'process', 'outputs', 'customers']);
  });
  test('CSV aus den Zeilen: byte-gleich zur bisherigen Ausgabe', () => {
    assertEqual(toCsvText(toRows(s, t)), [
      'sep=;',
      '"Suppliers";"Inputs";"Process";"Outputs";"Customers"',
      '"Mühle";"Mehl";"";"";""',
      '"Er sagt ""hi""";"";"";"";""',
      '',
    ].join('\n'));
  });
  test('leer: Kopf plus eine leere Zeile', () => {
    assertEqual(toCsvText(toRows(new State(), t)).split('\n').length, 4);
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
});

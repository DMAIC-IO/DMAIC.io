/**
 * Process Capability: Beispielform (io/example.js). Rein, läuft in Node.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows } from '../../test-utils.js';
import { State } from '../../../js/modules/process-capability/domain/model.js';
import { fromExample } from '../../../js/modules/process-capability/io/example.js';

const csvData = { columns: [{ name: 'Durchmesser', type: 'numeric', values: [9.9, 10, 10.1, 'x', NaN] }] };
const csvMeta = {
  id: 'capability-bolzendurchmesser',
  title: { de: 'Bolzendurchmesser (fähig)', en: 'Bolt Diameter (capable)' },
  spec: { lsl: 9.8, usl: 10.2, target: 10 },
  columns: [{ name: 'Durchmesser', type: 'numeric', unit: 'mm' }],
};

suite('process-capability: fromExample', () => {
  test('CSV-Form, Sprache de: deutscher Titel, Grenzen, nur endliche Zahlen', () => {
    const out = State.fromJSON(fromExample(csvData, csvMeta, { lang: 'de' }));
    assertDeepEqual(out.embeddedValues, [9.9, 10, 10.1]);
    assertEqual(out.embeddedLabel, 'Bolzendurchmesser (fähig)');
    assertEqual(out.params.name, 'Bolzendurchmesser (fähig)');
    assertEqual(out.params.lsl, 9.8);
    assertEqual(out.params.usl, 10.2);
    assertEqual(out.params.target, 10);
    assertEqual(out.params.unit, 'mm');
    assertEqual(out.columnRef, null);
  });
  test('Kontext: das Beispiel übernimmt dessen Konfidenzniveau, ohne Kontext 95', () => {
    const ctx = { cycle: 'dmaic', confidenceLevel: 90, power: 80 };
    assertEqual(fromExample(csvData, csvMeta, { lang: 'de', context: ctx }).params.confidence, 90);
    assertEqual(fromExample(csvData, csvMeta, { lang: 'de' }).params.confidence, 95);
  });
  test('unbekannte Sprache: englischer Titel, ohne Titel die id', () => {
    assertEqual(fromExample(csvData, csvMeta, { lang: 'fr' }).embeddedLabel, 'Bolt Diameter (capable)');
    assertEqual(fromExample(csvData, { id: 'x' }, { lang: 'de' }).embeddedLabel, 'x');
  });
  test('Einheit aus der Spalte hat Vorrang', () => {
    const d = { columns: [{ values: [1, 2], unit: 'µm' }] };
    assertEqual(fromExample(d, csvMeta, { lang: 'en' }).params.unit, 'µm');
  });
  test('ohne Zahlen: wirft', () => {
    assertThrows(() => fromExample({ columns: [{ values: ['a'] }] }, csvMeta, { lang: 'de' }), /no numeric values/);
    assertThrows(() => fromExample({}, csvMeta, { lang: 'de' }), /no numeric values/);
  });
  test('Generatorform von capability-shifted: Werte eingebettet', () => {
    const gen = { columns: [{ name: 'Durchmesser', type: 'numeric', values: [10.1, 10.05, 10.12] }], rows: [[10.1], [10.05], [10.12]] };
    const meta = { id: 'capability-shifted', title: { de: 'Verschobener Prozess', en: 'Shifted Process' }, columns: [{ name: 'Durchmesser', unit: 'mm' }] };
    const out = State.fromJSON(fromExample(gen, meta, { lang: 'en' }));
    assertDeepEqual(out.embeddedValues, [10.1, 10.05, 10.12]);
    assertEqual(out.params.name, 'Shifted Process');
    assertEqual(out.params.lsl, null);
  });
});

/**
 * Tortendiagramm: fremde Beispielformen (io/example.js). Rein, läuft in Node.
 */
import { suite, test, assertDeepEqual } from '../../test-utils.js';
import { fromExample } from '../../../js/modules/pie-chart/io/example.js';

const src = (c) => ({ instanceId: '__source__', sheetId: 's1', columnId: c });

suite('pie-chart: fremde Beispielformen', () => {
  test('eigene Form bleibt unverändert', () => {
    const d = { _schema: { version: '1.0' }, datasets: [{ value: src('a'), label: src('b') }], chart: { title: 'T' }, sourceWorksheetData: {} };
    assertDeepEqual(fromExample(d, {}), d);
  });

  test('valueRef, defectsRef, columnRef, colRef → Slot value', () => {
    for (const k of ['valueRef', 'defectsRef', 'columnRef', 'colRef']) {
      assertDeepEqual(fromExample({ [k]: src('a'), sourceWorksheetData: {} }, {}).datasets, [{ value: src('a'), label: null }], k);
    }
  });

  test('Vorrang: valueRef vor defectsRef vor columnRef vor colRef', () => {
    assertDeepEqual(fromExample({ valueRef: src('v'), defectsRef: src('d'), columnRef: src('c'), colRef: src('x') }, {}).datasets[0].value, src('v'));
    assertDeepEqual(fromExample({ defectsRef: src('d'), columnRef: src('c'), colRef: src('x') }, {}).datasets[0].value, src('d'));
    assertDeepEqual(fromExample({ columnRef: src('c'), colRef: src('x') }, {}).datasets[0].value, src('c'));
  });

  test('labelRef → Slot label', () => {
    assertDeepEqual(fromExample({ valueRef: src('a'), labelRef: src('b') }, {}).datasets, [{ value: src('a'), label: src('b') }]);
  });

  test('fremde Schlüssel und chartConfig fallen weg, das Arbeitsblatt bleibt', () => {
    const out = fromExample({ defectsRef: src('a'), sizeRef: src('n'), chartConfig: { innerRadius: 0.5 }, lsl: 1, sourceWorksheetData: { sheets: [] } }, {});
    assertDeepEqual(Object.keys(out).sort(), ['datasets', 'sourceWorksheetData']);
    assertDeepEqual(out.sourceWorksheetData, { sheets: [] });
  });

  test('ohne Spaltenbezug keine Datensätze', () => {
    assertDeepEqual(fromExample({ foo: 1 }, {}), {});
  });
});

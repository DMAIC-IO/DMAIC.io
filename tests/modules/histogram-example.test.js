/**
 * Histogramm: fremde Beispielformen (io/example.js). Rein, läuft in Node.
 */
import { suite, test, assertDeepEqual, assertEqual } from '../test-utils.js';
import { fromExample } from '../../js/modules/histogram/io/example.js';

const src = (c) => ({ instanceId: '__source__', sheetId: 's1', columnId: c });
const csvToWorksheet = (data) => ({ sheets: [{ id: 'sheet-csv' }], activeSheetId: 'sheet-csv', from: data.columns.length });

suite('histogram: fremde Beispielformen', () => {
  test('eigene Form bleibt', () => {
    const d = { datasets: [{ valueRef: src('a'), groupRef: null }], sourceWorksheetData: {} };
    assertDeepEqual(fromExample(d, {}, { csvToWorksheet }), d);
  });
  test('columnRef, colRef, seriesRefs, colRefsK → eine Zeile', () => {
    for (const d of [{ columnRef: src('a') }, { colRef: src('a') }, { seriesRefs: [src('a'), src('b')] }, { colRefsK: [src('a')] }]) {
      assertDeepEqual(fromExample({ ...d, sourceWorksheetData: {} }, {}, { csvToWorksheet }).datasets, [{ valueRef: src('a'), groupRef: null }]);
    }
  });
  test('CSV-Form → Arbeitsblatt und erste Spalte', () => {
    const out = fromExample({ columns: [{ name: 'x', type: 'numeric', values: [1, 2] }] }, { id: 'e' }, { csvToWorksheet });
    assertEqual(out.sourceWorksheetData.activeSheetId, 'sheet-csv');
    assertDeepEqual(out.datasets, [{ valueRef: { instanceId: '__source__', sheetId: 'sheet-csv', columnId: 'c-0' }, groupRef: null }]);
  });
  test('fremde Schlüssel fallen weg', () => {
    const out = fromExample({ columnRef: src('a'), lsl: 1, usl: 2, sourceWorksheetData: {} }, {}, { csvToWorksheet });
    assertDeepEqual(Object.keys(out).sort(), ['datasets', 'sourceWorksheetData']);
  });
});

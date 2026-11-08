/**
 * Diagramm-Vorschlag: Beispielformen (io/example.js). Rein, läuft in Node.
 */
import { suite, test, assertDeepEqual, assertEqual } from '../test-utils.js';
import { fromExample } from '../../js/modules/chart-suggestion/io/example.js';

const FILE = '../../js/modules/chart-suggestion/resources/examples/projects/chart-suggestion-bubble-lieferanten.json';

suite('chart-suggestion: Beispielformen', () => {
  test('Beispiel Lieferanten: selection → columns, selectedChartType → pick', async () => {
    const res = await fetch(new URL(FILE, import.meta.url), { cache: 'no-cache' });
    const data = await res.json();
    const out = fromExample(data, { id: 'chart-suggestion-bubble-lieferanten' });
    assertDeepEqual(out.columns[0], { instanceId: '__source__', sheetId: 'sheet-lieferanten', columnId: 'c-preisindex' });
    assertEqual(out.columns.length, 3);
    assertEqual(out.pick, 'bubble');
    assertEqual(out.sourceWorksheetFile, 'worksheets/chart-suggestion-lieferanten-scorecard.json');
    assertEqual('selection' in out, false);
  });
  test('eigene Form mit columns bleibt, wie sie ist', () => {
    const d = { columns: [{ instanceId: '__source__', sheetId: 's', columnId: 'c' }], pick: 'scatter' };
    assertDeepEqual(fromExample(d, {}), d);
  });
});

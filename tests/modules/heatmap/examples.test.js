/**
 * Heatmap: Beispiele der Modulablage.
 *
 * Das Beispiel liegt unter `resources/examples/` in der Form des Models und
 * lädt ohne Reparatur. Das Raster (`derived.stats`) gleicht dem Wert, den das
 * Altmodul (`read().stats`) für dasselbe Beispiel lieferte.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertDeepClose } from '../../test-utils.js';
import { rewriteColumnRefs } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { State } from '../../../js/modules/heatmap/domain/model.js';
import { storedSource } from '../../helpers/stored-source.js';

const BASE = '../../../js/modules/heatmap/resources/examples/';

/** Raster der Altform, am Altmodul gemessen. */
const LEGACY = {
  'heatmap-zykluszeit-schicht-linie': {
    stats: {
      xCategories: ['L1', 'L2', 'L3'],
      yCategories: ['Früh', 'Spät', 'Nacht'],
      cells: [[42, 58, 73], [47, 62, 77], [53, 68, 82]],
      rowTotals: null,
      colTotals: null,
      total: null,
    },
    chart: { title: 'Mittlere Zykluszeit nach Schicht × Linie (s)', showTitle: true, valueDecimals: 0 },
  },
};

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

suite('heatmap: Beispiele', () => {
  test('das Beispiel steht in der Modulablage', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), Object.keys(LEGACY));
    for (const e of own.examples) {
      assertEqual(e.type, 'project');
      assertEqual(e.format, 'json');
      assertEqual(e.file, `projects/${e.id}.json`);
    }
  });

  for (const [id, want] of Object.entries(LEGACY)) {
    test(`${id}: lädt ohne Reparatur, Raster wie in der Altform`, async () => {
      const { sourceWorksheetFile, ...data } = await fetchJson(`${BASE}projects/${id}.json`);
      assertEqual(sourceWorksheetFile, `worksheets/${id}.json`);
      const ws = await fetchJson(`${BASE}${sourceWorksheetFile}`);
      const model = State.fromJSON(rewriteColumnRefs(State, data, '__source__', 'ws1'));
      assertEqual(model.datasets.length, 1);
      for (const slot of ['x', 'g', 'v']) assertEqual(model.datasets[0][slot].instanceId, 'ws1');
      assertEqual(model.aggregation, 'mean');
      assertDeepEqual(JSON.parse(JSON.stringify(model.chart)), want.chart);
      const derived = evaluateDerived(model, storedSource({ ws1: ws }));
      assertDeepClose(JSON.parse(JSON.stringify(derived.stats)), want.stats);
      assertDeepEqual([...derived.activeParams], ['aggregation']);
    });
  }
});

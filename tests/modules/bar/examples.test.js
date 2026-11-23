/**
 * Balkendiagramm: Beispiele der Modulablage.
 *
 * Das Beispiel liegt unter `resources/examples/` in der Form des Models und
 * lädt ohne Reparatur. Die Balkenwerte (`derived.stats`) gleichen dem Wert,
 * den das Altmodul (`read().stats`) für dasselbe Beispiel lieferte.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { rewriteColumnRefs } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { State } from '../../../js/modules/bar/domain/model.js';
import { storedSource } from '../../helpers/stored-source.js';

const BASE = '../../../js/modules/bar/resources/examples/';

/** Balkenwerte der Altform, am Altmodul gemessen. */
const LEGACY = {
  'bar-defekte-pro-schicht': {
    categories: ['Früh', 'Spät', 'Nacht'],
    groups: [
      { name: 'Kratzer', values: [4, 6, 5] },
      { name: 'Maßabweichung', values: [12, 7, 4] },
      { name: 'Oberfläche', values: [3, 5, 8] },
      { name: 'Sonstige', values: [1, 2, 3] },
    ],
    total: 60,
    stacked: true,
    chart: { title: 'Defekte pro Schicht nach Defektart', showTitle: true },
  },
};

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

suite('bar: Beispiele', () => {
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
    test(`${id}: lädt ohne Reparatur, Balkenwerte wie in der Altform`, async () => {
      const { sourceWorksheetFile, ...data } = await fetchJson(`${BASE}projects/${id}.json`);
      assertEqual(sourceWorksheetFile, `worksheets/${id}.json`);
      const ws = await fetchJson(`${BASE}${sourceWorksheetFile}`);
      const model = State.fromJSON(rewriteColumnRefs(State, data, '__source__', 'ws1'));
      assertEqual(model.datasets.length, 1);
      assertEqual(model.datasets[0].x.instanceId, 'ws1');
      assertEqual(model.datasets[0].y, null);
      assertEqual(model.datasets[0].g.instanceId, 'ws1');
      assertEqual(model.aggregation, 'mean');
      assertEqual(model.stacked, want.stacked);
      assertDeepEqual(JSON.parse(JSON.stringify(model.chart)), want.chart);
      const derived = evaluateDerived(model, storedSource({ ws1: ws }));
      assertDeepEqual(JSON.parse(JSON.stringify(derived.stats)), {
        categories: want.categories,
        groups: want.groups,
        total: want.total,
      });
      assertDeepEqual([...derived.activeParams], ['stacked']);
    });
  }
});

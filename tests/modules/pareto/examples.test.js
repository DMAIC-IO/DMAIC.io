/**
 * Pareto-Diagramm: Beispiele der Modulablage.
 *
 * Das Beispiel liegt unter `resources/examples/` in der Form des Models und
 * lädt ohne Reparatur. Die geordnete Tabelle (`derived.stats`) gleicht dem
 * Wert, den das Altmodul (`read().stats`) für dasselbe Beispiel lieferte.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { rewriteColumnRefs } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { State } from '../../../js/modules/pareto/domain/model.js';
import { storedSource } from '../../helpers/stored-source.js';

const BASE = '../../../js/modules/pareto/resources/examples/';

/** Tabelle der Altform, am Altmodul gemessen. */
const LEGACY = {
  'pareto-reklamationskosten': {
    names: ['Maßabweichung', 'Verspätete Lieferung', 'Transportschaden', 'Falschlieferung', 'Beschädigte Verpackung', 'Sonstige'],
    values: [24970, 7380, 1910, 1505, 310, 60],
    total: 36135,
    chart: { title: 'Reklamationskosten Q2 nach Grund' },
  },
};

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

suite('pareto: Beispiele', () => {
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
    test(`${id}: lädt ohne Reparatur, Tabelle wie in der Altform`, async () => {
      const { sourceWorksheetFile, ...data } = await fetchJson(`${BASE}projects/${id}.json`);
      assertEqual(sourceWorksheetFile, `worksheets/${id}.json`);
      const ws = await fetchJson(`${BASE}${sourceWorksheetFile}`);
      const model = State.fromJSON(rewriteColumnRefs(State, data, '__source__', 'ws1'));
      assertEqual(model.datasets.length, 1);
      assertEqual(model.datasets[0].x.instanceId, 'ws1');
      assertEqual(model.datasets[0].y.instanceId, 'ws1');
      assertEqual(model.datasets[0].g, null);
      assertEqual(model.aggregation, 'sum');
      assertDeepEqual(JSON.parse(JSON.stringify(model.chart)), want.chart);
      const stats = evaluateDerived(model, storedSource({ ws1: ws })).stats;
      assertEqual(stats.total, want.total);
      assertDeepEqual(stats.rows.map((r) => r.name), want.names);
      assertDeepEqual(stats.rows.map((r) => r.value), want.values);
      assertEqual(stats.rows.at(-1).cumPct, 100);
    });
  }
});

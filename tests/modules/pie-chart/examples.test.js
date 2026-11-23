/**
 * Tortendiagramm: Beispiele der Modulablage.
 *
 * Die Beispiele liegen unter `resources/examples/` in der Form des Models und
 * laden ohne Reparatur. Die Segmenttabelle (`derived.stats`) gleicht dem
 * Wert, den das Altmodul (`read().stats`) für dasselbe Beispiel lieferte.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { rewriteColumnRefs } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { State } from '../../../js/modules/pie-chart/domain/model.js';
import { storedSource } from '../../helpers/stored-source.js';

const BASE = '../../../js/modules/pie-chart/resources/examples/';

/** Segmente der Altform, festgehalten vor dem Löschen des Altmoduls. */
const LEGACY = {
  'pie-defekte-ausschuss': {
    names: ['Kratzer', 'Maßabweichung', 'Risse', 'Verfärbung', 'Verschmutzung', 'Sonstige'],
    values: [145, 98, 67, 42, 28, 15],
    total: 395,
    chart: { title: 'Ausschuss nach Defektart', sortSlices: 'desc' },
  },
  'pie-reklamationen-q1': {
    names: ['Verspätete Lieferung', 'Transportschaden', 'Falschlieferung', 'Beschädigte Verpackung', 'Fehlende Bedienungsanleitung', 'Sonstige'],
    values: [87, 64, 41, 28, 18, 10],
    total: 248,
    chart: { title: 'Reklamationsgründe Q1', innerRadius: 0.5, centerLabel: '248', centerSub: 'Reklamationen', sortSlices: 'desc' },
  },
};

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

suite('pie-chart: Beispiele', () => {
  test('beide Beispiele stehen in der Modulablage, nicht im Gesamtkatalog', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), Object.keys(LEGACY));
    for (const e of own.examples) {
      assertEqual(e.type, 'project');
      assertEqual(e.format, 'json');
      assertEqual(e.file, `projects/${e.id}.json`);
    }
    const catalog = await fetchJson('../../../examples/index.json');
    assertEqual(catalog.examples.filter((x) => x.id in LEGACY).length, 0);
  });

  for (const [id, want] of Object.entries(LEGACY)) {
    test(`${id}: lädt ohne Reparatur, Darstellung im Diagramm, Segmente wie in der Altform`, async () => {
      const { sourceWorksheetFile, ...data } = await fetchJson(`${BASE}projects/${id}.json`);
      assertEqual(sourceWorksheetFile, `worksheets/${id}.json`);
      const ws = await fetchJson(`${BASE}${sourceWorksheetFile}`);
      const model = State.fromJSON(rewriteColumnRefs(State, data, '__source__', 'ws1'));
      assertEqual(model.datasets.length, 1);
      assertEqual(model.datasets[0].value.instanceId, 'ws1');
      assertEqual(model.datasets[0].label.instanceId, 'ws1');
      assertDeepEqual(JSON.parse(JSON.stringify(model.chart)), want.chart);
      const stats = evaluateDerived(model, storedSource({ ws1: ws })).stats;
      assertEqual(stats.total, want.total);
      assertDeepEqual(stats.slices.map((s) => s.name), want.names);
      assertDeepEqual(stats.slices.map((s) => s.value), want.values);
      assertDeepEqual(stats.slices.map((s) => s.share), want.values.map((v) => v / want.total));
    });
  }
});

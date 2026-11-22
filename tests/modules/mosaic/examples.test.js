/**
 * Mosaikdiagramm: Beispiel der Modulablage.
 *
 * Das Beispiel liegt unter `resources/examples/` in der Form des Models und
 * lädt ohne Reparatur. Die Kreuztabelle (`derived.stats`) gleicht dem Wert,
 * den das Altmodul (`read().stats`) für dasselbe Beispiel lieferte.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { rewriteColumnRefs } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { State } from '../../../js/modules/mosaic/domain/model.js';
import { storedSource } from '../../helpers/stored-source.js';

const BASE = '../../../js/modules/mosaic/resources/examples/';
const ID = 'mosaic-lieferantenfreigabe';

/** Kreuztabelle der Altform, festgehalten vor dem Löschen des Altmoduls. */
const LEGACY_STATS = {
  categories: ['Werk-A', 'Werk-B', 'Werk-C'],
  groups: [
    { name: 'OK', counts: [24, 12, 4] },
    { name: 'Bedingt', counts: [4, 5, 3] },
    { name: 'Abgelehnt', counts: [2, 3, 3] },
  ],
  rowTotals: [30, 20, 10],
  colTotals: [40, 12, 8],
  total: 60,
};

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

suite('mosaic: Beispiele', () => {
  test('das Beispiel steht in der Modulablage, nicht im Gesamtkatalog', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), [ID]);
    const [e] = own.examples;
    assertEqual(e.type, 'project');
    assertEqual(e.format, 'json');
    assertEqual(e.file, `projects/${ID}.json`);
    const catalog = await fetchJson('../../../examples/index.json');
    assertEqual(catalog.examples.filter((x) => x.id === ID).length, 0);
  });

  test('Lieferantenfreigabe: lädt ohne Reparatur, Titel im Diagramm, Kreuztabelle wie in der Altform', async () => {
    const { sourceWorksheetFile, ...data } = await fetchJson(`${BASE}projects/${ID}.json`);
    assertEqual(sourceWorksheetFile, `worksheets/${ID}.json`);
    const ws = await fetchJson(`${BASE}${sourceWorksheetFile}`);
    const model = State.fromJSON(rewriteColumnRefs(State, data, '__source__', 'ws1'));
    assertEqual(model.datasets.length, 1);
    assertEqual(model.datasets[0].x.instanceId, 'ws1');
    assertEqual(model.datasets[0].g.instanceId, 'ws1');
    assertDeepEqual(JSON.parse(JSON.stringify(model.chart)), { title: 'Lieferantenfreigabe nach Werk', showTitle: true });
    assertDeepEqual(evaluateDerived(model, storedSource({ ws1: ws })).stats, LEGACY_STATS);
  });
});

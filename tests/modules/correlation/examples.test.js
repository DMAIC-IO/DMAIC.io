/**
 * Korrelation: Beispiele der Modulablage.
 *
 * Die zwei Beispiele liegen unter `resources/examples/` in der Form des
 * Models und laden ohne Reparatur; `derived` gleicht dem `read()` der
 * Altform für dasselbe Beispiel (`legacy-read.json`, Sprache en). Das
 * Arbeitsblatt der Pizza-Lieferungen bleibt geteilt (`examples/shared/`).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { rewriteColumnRefs, setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { State } from '../../../js/modules/correlation/domain/model.js';
import { storedSource } from '../../helpers/stored-source.js';
import { compareResults } from './migrations.test.js';

setModelName(State, 'correlation');

const BASE = '../../../js/modules/correlation/resources/examples/';
const CATALOG = '../../../examples/';
const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
const IDS = ['correlation-oven-hardness', 'correlation-pizza-delivery'];
const plain = (v) => JSON.parse(JSON.stringify(v));

/** @param {string} path @returns {Promise<any>} */
async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

/** @param {string} file @returns {string} */
const worksheetPath = (file) => (file.startsWith('shared/') ? `${CATALOG}${file}` : `${BASE}${file}`);

suite('correlation: Beispiele', () => {
  test('die zwei stehen in der Modulablage, nicht im Gesamtkatalog', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id).sort(), [...IDS].sort());
    for (const e of own.examples) {
      assertEqual(e.type, 'project', e.id);
      assertEqual(e.format, 'json', e.id);
      assertEqual(e.file, `projects/${e.id}.json`, e.id);
      assertEqual('modules' in e, false, e.id);
      assertTrue(!!e.title.de && !!e.title.en, `Titel fehlt: ${e.id}`);
    }
    const catalog = await fetchJson(`${CATALOG}index.json`);
    assertEqual(catalog.examples.filter((x) => IDS.includes(x.id)).length, 0);
  });

  for (const id of IDS) {
    test(`${id}: lädt ohne Reparatur, derived wie das read() der Altform`, async () => {
      const legacy = (await fetchJson('./legacy-read.json'))[id];
      const { sourceWorksheetFile, ...data } = await fetchJson(`${BASE}projects/${id}.json`);
      assertEqual(data._schema?.version, '1.0', id);
      const repaired = [];
      const raw = rewriteColumnRefs(State, data, '__source__', 'ws1');
      const m = State.fromJSON(raw, { repair: true, onRepair: (f) => repaired.push(f), context: CTX });
      assertDeepEqual(repaired, [], id);
      const src = storedSource({ ws1: await fetchJson(worksheetPath(sourceWorksheetFile)) });
      const d = plain(evaluateDerived(m, src, undefined, (k) => k));
      assertDeepEqual([d.mode, d.activeParams, d.error], [legacy.mode, legacy.activeParams, null], id);
      // A9: das Lesefeld nennt den schreibbaren Pfad (Altform `['columns']`).
      assertDeepEqual([legacy.activeMultiSlots, d.activeMultiSlots], [['columns'], ['colRefs']], id);
      assertDeepEqual(plain(m.colRefs).map((r) => r.columnId), legacy.colRefs.map((r) => r.columnId), id);
      compareResults(id, d, legacy);
    });
  }
});

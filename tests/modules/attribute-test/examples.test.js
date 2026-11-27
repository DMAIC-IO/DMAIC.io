/**
 * Attributtest: Beispiele der Modulablage.
 *
 * Die sechs Beispiele liegen unter `resources/examples/` in der Form des
 * Models und laden ohne Reparatur. `derived` gleicht dem `read()` der
 * Altform für dasselbe Beispiel (`legacy-read.json`, Sprache en); neu ist
 * nur `result.status: 'ok'`.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertDeepClose } from '../../test-utils.js';
import { rewriteColumnRefs, setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { State } from '../../../js/modules/attribute-test/domain/model.js';
import { storedSource } from '../../helpers/stored-source.js';

setModelName(State, 'attribute-test');

const BASE = '../../../js/modules/attribute-test/resources/examples/';
const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
const IDS = ['attribute-scrap-before-after', 'attribute-reklamation-one', 'attribute-shift-pass-fail',
  'attribute-paint-defects-rates', 'attribute-supplier-equivalence', 'attribute-before-after-paired'];
const WITH_WORKSHEET = ['attribute-shift-pass-fail', 'attribute-before-after-paired'];
const plain = (v) => JSON.parse(JSON.stringify(v));

/** Englische Texte wie die Altform: der Schlüssel selbst genügt dem Vergleich. */
const T = (k) => k;

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

suite('attribute-test: Beispiele', () => {
  test('die sechs stehen in der Modulablage, nicht im Gesamtkatalog', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), IDS);
    for (const e of own.examples) {
      assertEqual(e.type, 'project', e.id);
      assertEqual(e.format, 'json', e.id);
      assertEqual(e.file, `projects/${e.id}.json`, e.id);
      assertEqual('modules' in e, false, e.id);
      assertTrue(!!e.title.de && !!e.title.en, `Titel fehlt: ${e.id}`);
    }
    const catalog = await fetchJson('../../../examples/index.json');
    assertEqual(catalog.examples.filter((x) => IDS.includes(x.id)).length, 0);
  });

  for (const id of IDS) {
    test(`${id}: lädt ohne Reparatur, derived wie das read() der Altform`, async () => {
      const legacy = (await fetchJson('./legacy-read.json'))[id];
      const { sourceWorksheetFile, ...data } = await fetchJson(`${BASE}projects/${id}.json`);
      assertEqual(data._schema?.version, '1.0', id);
      assertEqual(sourceWorksheetFile !== undefined, WITH_WORKSHEET.includes(id), id);
      const repaired = [];
      const raw = sourceWorksheetFile ? rewriteColumnRefs(State, data, '__source__', 'ws1') : data;
      const m = State.fromJSON(raw, { repair: true, onRepair: (f) => repaired.push(f), context: CTX });
      assertDeepEqual(repaired, [], id);
      const src = sourceWorksheetFile
        ? storedSource({ ws1: await fetchJson(`${BASE}${sourceWorksheetFile}`) })
        : null;
      const d = plain(evaluateDerived(m, src, ['activeParams', 'activeColumnSlots', 'eventValueOptions', 'result'], T));
      assertDeepEqual(d.activeParams, legacy.activeParams, `${id} activeParams`);
      assertDeepEqual(d.activeColumnSlots, legacy.activeColumnSlots, `${id} activeColumnSlots`);
      assertDeepEqual(d.eventValueOptions, legacy.eventValueOptions, `${id} eventValueOptions`);
      const { status, ...result } = d.result;
      assertEqual(status, 'ok', id);
      assertDeepClose(result, legacy.result, undefined, `${id} result`);
    });
  }
});

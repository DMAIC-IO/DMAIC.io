/**
 * Datentransformation: Beispiel der Modulablage.
 *
 * Das Beispiel liegt unter `resources/examples/` in der Form des Models und
 * lädt ohne Reparatur. Das Ergebnis von `analyze` gleicht dem
 * `read().result`, das die Altform für dasselbe Beispiel lieferte (Box-Cox,
 * geschätztes λ = 0).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertDeepClose } from '../../test-utils.js';
import { rewriteColumnRefs } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { State, sourceValues } from '../../../js/modules/data-transformation/domain/model.js';
import { analyze } from '../../../js/modules/data-transformation/domain/analyze.js';
import { storedSource } from '../../helpers/stored-source.js';

const BASE = '../../../js/modules/data-transformation/resources/examples/';
const ID = 'transform-lognormal-boxcox';
const plain = (v) => JSON.parse(JSON.stringify(v));

/** `read().result` der Altform für das Beispiel. */
const LEGACY_RESULT = {
  n: 80, transform: 'boxcox', params: { lambda: 0 },
  original: { mean: 6.74060125, std: 4.493620079863264, median: 5.513, skewness: 2.0088147108012055, kurtosis: 6.040003938942025, min: 1.4843, max: 28.2258, adStatAdj: 3.260919515234603, adPValue: 3.65309998705733e-8, normal: false },
  transformed: { mean: 1.7250245772370274, std: 0.6054994663964357, median: 1.7070812846024288, skewness: 0.09881347913223147, kurtosis: -0.2188708124740213, min: 0.3949432806485822, max: 3.3402364533010136, adStatAdj: 0.3250828919481555, adPValue: 0.5228544333417668, normal: true },
};

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

suite('data-transformation: Beispiele', () => {
  test('das Beispiel steht in der Modulablage', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), [ID]);
    for (const e of own.examples) {
      assertEqual(e.type, 'project');
      assertEqual(e.format, 'json');
      assertEqual(e.file, `projects/${e.id}.json`);
    }
  });

  test('lognormale Zykluszeiten: lädt ohne Reparatur, Ergebnis wie in der Altform', async () => {
    const { sourceWorksheetFile, ...data } = await fetchJson(`${BASE}projects/${ID}.json`);
    assertEqual(sourceWorksheetFile, 'shared/worksheets/distribution-lognormal.json');
    const ws = await fetchJson(`../../../examples/${sourceWorksheetFile}`);
    const fields = [];
    const model = State.fromJSON(rewriteColumnRefs(State, data, '__source__', 'ws1'), { repair: true, onRepair: (f) => fields.push(f) });
    assertDeepEqual(fields, []);
    assertEqual(model.currentTF, 'boxcox');
    assertDeepEqual(plain(model.columnRef), { instanceId: 'ws1', sheetId: 'sheet-dist-lognormal', columnId: 'c-zykluszeit' });
    assertEqual(model.params.boxcox.lambda, null);
    const src = storedSource({ ws1: ws });
    const derived = evaluateDerived(model, src);
    assertEqual(derived.effectiveTF, 'boxcox');
    assertDeepEqual([...derived.activeParams], ['params.boxcox.lambda']);
    assertDeepClose(plain(analyze(sourceValues(src, model.columnRef), model).result), LEGACY_RESULT);
  });
});

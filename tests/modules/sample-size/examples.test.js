/**
 * Stichprobenumfang: Beispiele.
 *
 * Die vier Beispiele liegen in der Modulablage, laden ohne Reparatur, und
 * `derived.result` gleicht dem `read().result` der Altform für dasselbe
 * Beispiel (n über die Engine an der Altform festgehalten).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertAlmostEqual } from '../../test-utils.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { State } from '../../../js/modules/sample-size/domain/model.js';

const BASE = '../../../js/modules/sample-size/resources/examples/';
const T = (k) => k;
const IDS = [
  'sample-size-varianz-1stichprobe', 'sample-size-varianz-2stichproben',
  'sample-size-mittelwert-1stichprobe', 'sample-size-mittelwert-2stichproben',
];

/** Das `read().result` der Altform je Beispiel. */
const LEGACY_RESULT = {
  'sample-size-varianz-1stichprobe': { nRequired: 23, totalN: 23, alpha: 0.05, power: 0.8, effectLabel: 'varianceRatio', effectValue: 1 / 2.25, algoId: 'chi-square-variance' },
  'sample-size-varianz-2stichproben': { nRequired: 68, totalN: 136, alpha: 0.05, power: 0.8, effectLabel: 'varianceRatio', effectValue: 2, algoId: 'f-test' },
  'sample-size-mittelwert-1stichprobe': { nRequired: 24, totalN: 24, alpha: 0.05, power: 0.8, effectLabel: 'cohensD', effectValue: 0.6, algoId: 'one-sample-t-test' },
  'sample-size-mittelwert-2stichproben': { nRequired: 42, totalN: 84, alpha: 0.05, power: 0.8, effectLabel: 'cohensD', effectValue: 0.625, algoId: 'two-sample-t-test' },
};

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

suite('sample-size: Beispiele', () => {
  test('alle vier stehen in der Modulablage', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), IDS);
    for (const e of own.examples) {
      assertEqual(e.type, 'project', e.id);
      assertEqual(e.file, `projects/${e.id}.json`, e.id);
      assertEqual('modules' in e, false, e.id);
      assertTrue(!!e.title.de && !!e.title.en, `Titel fehlt: ${e.id}`);
    }
  });

  for (const id of IDS) {
    test(`${id}: lädt ohne Reparatur, Ergebnis wie in der Altform`, async () => {
      const data = await fetchJson(`${BASE}projects/${id}.json`);
      assertEqual(data._schema?.version, '1.0');
      const m = State.fromJSON(data);
      const got = evaluateDerived(m, null, ['result'], T).result;
      const exp = LEGACY_RESULT[id];
      for (const k of ['nRequired', 'totalN', 'alpha', 'power', 'effectLabel', 'algoId']) assertEqual(got[k], exp[k], `${id} ${k}`);
      assertAlmostEqual(got.effectValue, exp.effectValue, 1e-12);
    });
  }
});

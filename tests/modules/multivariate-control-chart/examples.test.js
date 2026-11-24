/**
 * Multivariate Regelkarte: Beispiel.
 *
 * Das Beispiel `spc-multivariate-t2` liegt samt Arbeitsblatt in der
 * Modulablage, lädt ohne Reparatur, und `derived.result` gleicht dem
 * `read().result` der Altform für dasselbe Beispiel (n = 40, p = 2, alle
 * Zeilen als Phase I, α = 0,0027, keine Signale).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { rewriteColumnRefs } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { State } from '../../../js/modules/multivariate-control-chart/domain/model.js';
import { storedSource } from '../../helpers/stored-source.js';

const BASE = '../../../js/modules/multivariate-control-chart/resources/examples/';
const T = (k) => k;

/** `read().result` der Altform für das Beispiel (Literal wie in `analyze.test.js`). */
const LEGACY_RESULT = {
  n: 40, p: 2, m: 40, cl: 2.0526315789473686, ucl: 14.598254418877096,
  mean: [10.260962500000002, 20.400564999999997],
  covariance: [[0.807552591121795, 0.9953267166025642], [0.9953267166025642, 3.764149381307691]],
  signals: [],
};

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

const plain = (v) => JSON.parse(JSON.stringify(v));

suite('multivariate-control-chart: Beispiel', () => {
  test('das Beispiel steht in der Modulablage', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), ['spc-multivariate-t2']);
    const [e] = own.examples;
    assertEqual(e.type, 'project');
    assertEqual(e.format, 'json');
    assertEqual(e.file, 'projects/spc-multivariate-t2.json');
    assertTrue(!!e.title.de && !!e.title.en, 'Titel fehlt');
    assertTrue(!!e.description.de && !!e.description.en, 'Beschreibung fehlt');
  });

  test('spc-multivariate-t2: lädt ohne Reparatur, Ergebnis wie in der Altform', async () => {
    const { sourceWorksheetFile, ...data } = await fetchJson(`${BASE}projects/spc-multivariate-t2.json`);
    assertEqual(sourceWorksheetFile, 'worksheets/spc-multivariate-correlated.json');
    const ws = await fetchJson(`${BASE}${sourceWorksheetFile}`);
    assertEqual(data._schema?.version, '1.0');
    assertDeepEqual(Object.keys(data).sort(), ['_schema', 'columnRefs']);
    const model = State.fromJSON(rewriteColumnRefs(State, data, '__source__', 'ws1'));
    const ref = (columnId) => ({ instanceId: 'ws1', sheetId: 'sheet-spc-multi', columnId });
    assertDeepEqual(plain(model.columnRefs), [ref('c-x1'), ref('c-x2')]);
    assertEqual(model.alpha, 0.0027);
    assertEqual(model.baselineCount, null);
    assertEqual(model.exampleWorksheetId, null);
    assertDeepEqual(plain(model.chart), {});
    const src = storedSource({ ws1: ws });
    const { result, points, error, message } = evaluateDerived(model, src, undefined, T);
    assertDeepEqual(plain(result), LEGACY_RESULT);
    assertEqual(points.length, 40);
    assertEqual(points.filter((p) => p.signal).length, 0);
    assertEqual(error, null);
    assertEqual(message, null);
  });
});

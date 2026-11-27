/**
 * Zeitgewichtete Regelkarten: Beispiele.
 *
 * Die Beispiele `spc-time-weighted-ewma` und `spc-time-weighted-cusum` liegen
 * samt Arbeitsblatt `spc-time-weighted-drift` in der Modulablage, laden ohne
 * Reparatur, und `derived.result` gleicht dem `read().result` der Altform für
 * dasselbe Beispiel (Literale aus `analyze.test.js`).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertDeepClose } from '../../test-utils.js';
import { rewriteColumnRefs } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { State } from '../../../js/modules/time-weighted-chart/domain/model.js';
import { storedSource } from '../../helpers/stored-source.js';
import { EXAMPLE_EWMA_RESULT, EXAMPLE_CUSUM_RESULT } from './analyze.test.js';

const BASE = '../../../js/modules/time-weighted-chart/resources/examples/';
const T = (k) => k;
const WORKSHEET = 'worksheets/spc-time-weighted-drift.json';
const PARAMS = { ewma: { lambda: 0.2, L: 3 }, cusum: { kSigma: 0.5, hSigma: 4 } };

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

const plain = (v) => JSON.parse(JSON.stringify(v));

/**
 * Lädt ein Beispiel wie der Kern: Projektdatei streng (ohne Reparatur), Bezug
 * `__source__` auf das Arbeitsblatt `ws1` umgeschrieben.
 */
async function loadExample(id) {
  const { sourceWorksheetFile, ...data } = await fetchJson(`${BASE}projects/${id}.json`);
  assertEqual(sourceWorksheetFile, WORKSHEET);
  assertEqual(data._schema?.version, '1.0');
  const ws = await fetchJson(`${BASE}${sourceWorksheetFile}`);
  const model = State.fromJSON(rewriteColumnRefs(State, data, '__source__', 'ws1'));
  return { data, model, src: storedSource({ ws1: ws }) };
}

const REF = { instanceId: 'ws1', sheetId: 'sheet-spc-drift', columnId: 'c-wert' };

suite('time-weighted-chart: Beispiele', () => {
  test('beide Beispiele stehen in der Modulablage', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), ['spc-time-weighted-ewma', 'spc-time-weighted-cusum']);
    for (const e of own.examples) {
      assertEqual(e.type, 'project', e.id);
      assertEqual(e.format, 'json', e.id);
      assertEqual(e.file, `projects/${e.id}.json`, e.id);
      assertEqual('modules' in e, false, e.id);
      assertTrue(!!e.title.de && !!e.title.en, `Titel fehlt: ${e.id}`);
      assertTrue(!!e.description.de && !!e.description.en, `Beschreibung fehlt: ${e.id}`);
    }
  });

  test('spc-time-weighted-ewma: lädt ohne Reparatur, Ergebnis wie in der Altform', async () => {
    const { data, model, src } = await loadExample('spc-time-weighted-ewma');
    assertDeepEqual(Object.keys(data).sort(), ['_schema', 'columnRef', 'params']);
    assertEqual(model.chartTypeId, 'ewma');
    assertDeepEqual(plain(model.columnRef), REF);
    assertEqual(model.sigmaMethod, 'mr');
    assertEqual(model.baselineCount, null);
    assertEqual(model.targetOverride, null);
    assertEqual(model.sigmaOverride, null);
    assertDeepEqual(plain(model.params), PARAMS);
    assertEqual(model.exampleWorksheetId, null);
    assertDeepEqual(plain(model.charts), {});
    const { result, points } = evaluateDerived(model, src, undefined, T);
    assertDeepClose(plain(result), EXAMPLE_EWMA_RESULT);
    assertEqual(points.length, 60);
    assertDeepEqual(points.flatMap((p, i) => (p.signal ? [i] : [])), EXAMPLE_EWMA_RESULT.signals);
  });

  test('spc-time-weighted-cusum: lädt ohne Reparatur, Ergebnis wie in der Altform', async () => {
    const { data, model, src } = await loadExample('spc-time-weighted-cusum');
    assertDeepEqual(Object.keys(data).sort(), ['_schema', 'baselineCount', 'chartTypeId', 'columnRef', 'params']);
    assertEqual(model.chartTypeId, 'cusum');
    assertDeepEqual(plain(model.columnRef), REF);
    assertEqual(model.sigmaMethod, 'mr');
    assertEqual(model.baselineCount, 30);
    assertEqual(model.targetOverride, null);
    assertEqual(model.sigmaOverride, null);
    assertDeepEqual(plain(model.params), PARAMS);
    assertDeepEqual(plain(model.charts), {});
    const { result, points } = evaluateDerived(model, src, undefined, T);
    assertDeepClose(plain(result), EXAMPLE_CUSUM_RESULT);
    assertEqual(points.length, 60);
    assertDeepEqual(points.flatMap((p, i) => (p.signalHigh ? [i] : [])), EXAMPLE_CUSUM_RESULT.signalsHigh);
    assertEqual(points.filter((p) => p.signalLow).length, 0);
  });
});

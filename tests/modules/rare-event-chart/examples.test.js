/**
 * Regelkarte seltener Ereignisse: Beispiel.
 *
 * Das Beispiel `spc-rare-event-t-chart` liegt samt Arbeitsblatt
 * `spc-rare-event-days` in der Modulablage, lädt ohne Reparatur, und
 * `derived.result` gleicht dem `read().result` der Altform für dasselbe
 * Beispiel (Literal aus `analyze.test.js`).
 */
import { suite, test, assertEqual, assertDeepEqual, assertDeepClose, assertTrue } from '../../test-utils.js';
import { rewriteColumnRefs } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { State } from '../../../js/modules/rare-event-chart/domain/model.js';
import { storedSource } from '../../helpers/stored-source.js';
import { EXAMPLE_RESULT, TAGE_SEIT } from './analyze.test.js';

const BASE = '../../../js/modules/rare-event-chart/resources/examples/';
const T = (k) => k;
const WORKSHEET = 'worksheets/spc-rare-event-days.json';

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

const plain = (v) => JSON.parse(JSON.stringify(v));

/**
 * Lädt das Beispiel wie der Kern: Projektdatei streng (ohne Reparatur), Bezug
 * `__source__` auf das Arbeitsblatt `ws1` umgeschrieben.
 */
async function loadExample(id) {
  const { sourceWorksheetFile, ...data } = await fetchJson(`${BASE}projects/${id}.json`);
  assertEqual(sourceWorksheetFile, WORKSHEET);
  assertEqual(data._schema?.version, '1.0');
  const ws = await fetchJson(`${BASE}${sourceWorksheetFile}`);
  const model = State.fromJSON(rewriteColumnRefs(State, data, '__source__', 'ws1'));
  return { data, model, ws, src: storedSource({ ws1: ws }) };
}

const REF = { instanceId: 'ws1', sheetId: 'sheet-spc-rare', columnId: 'c-tage' };

suite('rare-event-chart: Beispiel', () => {
  test('das Beispiel steht in der Modulablage', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), ['spc-rare-event-t-chart']);
    for (const e of own.examples) {
      assertEqual(e.type, 'project', e.id);
      assertEqual(e.format, 'json', e.id);
      assertEqual(e.file, `projects/${e.id}.json`, e.id);
      assertEqual('modules' in e, false, e.id);
      assertTrue(!!e.title.de && !!e.title.en, `Titel fehlt: ${e.id}`);
      assertTrue(!!e.description.de && !!e.description.en, `Beschreibung fehlt: ${e.id}`);
    }
  });

  test('spc-rare-event-t-chart: lädt ohne Reparatur, Ergebnis wie in der Altform', async () => {
    const { data, model, ws, src } = await loadExample('spc-rare-event-t-chart');
    assertDeepEqual(Object.keys(data).sort(), ['_schema', 'chartTypeId', 'columnRef']);
    assertEqual(model.chartTypeId, 't');
    assertDeepEqual(plain(model.columnRef), REF);
    assertEqual(model.exampleWorksheetId, null);
    assertDeepEqual(plain(model.chart), {});
    const col = ws.sheets[0].state.columns.find((c) => c.id === 'c-tage');
    assertDeepEqual(col.values, TAGE_SEIT, 'Arbeitsblatt unverändert');
    const { result, points } = evaluateDerived(model, src, undefined, T);
    assertDeepClose(plain(result), EXAMPLE_RESULT);
    assertEqual(points.length, 25);
    assertDeepEqual(points.flatMap((p, i) => (p.signal ? [i] : [])), EXAMPLE_RESULT.signals);
  });
});

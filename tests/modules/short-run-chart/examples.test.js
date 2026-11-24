/**
 * Kurzserien-Regelkarte (Z-MR): Beispiel.
 *
 * Das Beispiel `spc-short-run-zmr` liegt samt Arbeitsblatt
 * `spc-short-run-setups` in der Modulablage, lädt ohne Reparatur, und
 * `derived.result` gleicht dem `read().result` der Altform für dasselbe
 * Beispiel (Literal aus `analyze.test.js`).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { rewriteColumnRefs } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { State } from '../../../js/modules/short-run-chart/domain/model.js';
import { storedSource } from '../../helpers/stored-source.js';
import { EXAMPLE_RESULT, SETUP, MESSWERT } from './analyze.test.js';

const BASE = '../../../js/modules/short-run-chart/resources/examples/';
const T = (k) => k;
const WORKSHEET = 'worksheets/spc-short-run-setups.json';

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

const plain = (v) => JSON.parse(JSON.stringify(v));

/**
 * Lädt das Beispiel wie der Kern: Projektdatei streng (ohne Reparatur), Bezüge
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

const VALUES_REF = { instanceId: 'ws1', sheetId: 'sheet-spc-short', columnId: 'c-messwert' };
const GROUPS_REF = { instanceId: 'ws1', sheetId: 'sheet-spc-short', columnId: 'c-setup' };

suite('short-run-chart: Beispiel', () => {
  test('das Beispiel steht in der Modulablage', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), ['spc-short-run-zmr']);
    for (const e of own.examples) {
      assertEqual(e.type, 'project', e.id);
      assertEqual(e.format, 'json', e.id);
      assertEqual(e.file, `projects/${e.id}.json`, e.id);
      assertEqual('modules' in e, false, e.id);
      assertTrue(!!e.title.de && !!e.title.en, `Titel fehlt: ${e.id}`);
      assertTrue(!!e.description.de && !!e.description.en, `Beschreibung fehlt: ${e.id}`);
    }
  });

  test('spc-short-run-zmr: lädt ohne Reparatur, Ergebnis wie in der Altform', async () => {
    const { data, model, ws, src } = await loadExample('spc-short-run-zmr');
    assertDeepEqual(Object.keys(data).sort(), ['_schema', 'groupsRef', 'valuesRef']);
    assertDeepEqual(plain(model.valuesRef), VALUES_REF);
    assertDeepEqual(plain(model.groupsRef), GROUPS_REF);
    assertEqual(model.exampleWorksheetId, null);
    assertDeepEqual(plain(model.charts), {});
    const cols = ws.sheets[0].state.columns;
    assertDeepEqual(cols.find((c) => c.id === 'c-messwert').values, MESSWERT, 'Arbeitsblatt unverändert (Messwert)');
    assertDeepEqual(cols.find((c) => c.id === 'c-setup').values, SETUP, 'Arbeitsblatt unverändert (Setup)');
    const { result, points, warningMsg } = evaluateDerived(model, src, undefined, T);
    assertDeepEqual(plain(result), EXAMPLE_RESULT);
    assertEqual(warningMsg, null);
    assertEqual(points.length, 24);
    assertEqual(points[0].mr, null, 'erste Zeile ohne gleitende Spannweite');
    assertDeepEqual(points.flatMap((p, i) => (p.signalZ ? [i] : [])), EXAMPLE_RESULT.signalsZ);
    assertDeepEqual(points.flatMap((p, i) => (p.signalMR ? [i] : [])), EXAMPLE_RESULT.signalsMR);
  });
});

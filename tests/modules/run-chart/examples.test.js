/**
 * Verlaufsdiagramm: Beispiel.
 *
 * Das Beispiel `spc-run-chart-shift` liegt in der Modulablage, lädt ohne
 * Reparatur, sein Arbeitsblatt bleibt geteilt, und `derived.result` gleicht
 * dem `read().result` der Altform für dasselbe Beispiel.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { rewriteColumnRefs } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { State } from '../../../js/modules/run-chart/domain/model.js';
import { storedSource } from '../../helpers/stored-source.js';

const BASE = '../../../js/modules/run-chart/resources/examples/';
const SHARED = '../../../examples/';
const T = (k) => k;

/** `read().result` des Altmoduls für das Beispiel (α 0,05). */
const LEGACY_RESULT = {
  n: 50, median: 10.061399999999999, runsAboutMedian: 12, runsUpDown: 31, flagged: 1,
  tests: [
    { id: 'clustering', p: 0.00003157467505099376, observed: 12, flagged: true },
    { id: 'mixtures', p: 0.999968425324949, observed: 12, flagged: false },
    { id: 'trends', p: 0.24720229712672825, observed: 31, flagged: false },
    { id: 'oscillation', p: 0.7527977028732717, observed: 31, flagged: false },
  ],
};

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

suite('run-chart: Beispiel', () => {
  test('das Beispiel steht in der Modulablage', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), ['spc-run-chart-shift']);
    const [e] = own.examples;
    assertEqual(e.type, 'project');
    assertEqual(e.format, 'json');
    assertEqual(e.file, 'projects/spc-run-chart-shift.json');
    assertTrue(!!e.title.de && !!e.title.en, 'Titel fehlt');
  });

  test('spc-run-chart-shift: lädt ohne Reparatur, Ergebnis wie in der Altform', async () => {
    const { sourceWorksheetFile, ...data } = await fetchJson(`${BASE}projects/spc-run-chart-shift.json`);
    assertEqual(sourceWorksheetFile, 'shared/worksheets/spc-imr-shift.json');
    const ws = await fetchJson(`${SHARED}${sourceWorksheetFile}`);
    assertEqual(data._schema?.version, '1.0');
    assertDeepEqual(Object.keys(data).sort(), ['_schema', 'columnRef']);
    const model = State.fromJSON(rewriteColumnRefs(State, data, '__source__', 'ws1'));
    assertDeepEqual(JSON.parse(JSON.stringify(model.columnRef)), { instanceId: 'ws1', sheetId: 'sheet-imr-shift', columnId: 'c-value' });
    assertEqual(model.alpha, 0.05);
    assertDeepEqual(JSON.parse(JSON.stringify(model.chart)), {});
    const { result, points } = evaluateDerived(model, storedSource({ ws1: ws }), undefined, T);
    assertDeepEqual(JSON.parse(JSON.stringify(result)), LEGACY_RESULT);
    assertEqual(points.length, 50);
  });
});

/**
 * Regelkarte für Variablen: Beispiele.
 *
 * Die sieben Beispiele des Moduls liegen samt den Arbeitsblättern
 * `spc-subgroups-stable` und `spc-imr-trend` in der Modulablage (die übrigen
 * Arbeitsblätter sind geteilt), laden ohne Reparatur, und `derived.result`
 * gleicht dem `read().result` der Altform (Literale aus `analyze.test.js`).
 * Das geteilte CSV-Beispiel `capability-bolzendurchmesser` übersetzt
 * `fromExample` in ein Arbeitsblatt mit den Vorgaben des Models.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { rewriteColumnRefs } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { csvPayloadToWorksheetState } from '../../../js/core/examples-registry.js';
import { State } from '../../../js/modules/control-chart/domain/model.js';
import { fromExample } from '../../../js/modules/control-chart/io/example.js';
import { storedSource } from '../../helpers/stored-source.js';
import {
  XBAR_R_STABLE_RESULT, XBAR_S_STABLE_RESULT, CAPABILITY_RESULT, IMR_SHIFT_RESULT,
  IMR_TREND_RESULT, IMR_ANNOTATED_FROZEN_RESULT, HUBSCHRAUBER_RESULT, BOLZEN_CSV_RESULT,
} from './analyze.test.js';

const OWN = '../../../js/modules/control-chart/resources/examples/';
const SHARED = '../../../examples/';
const T = (k) => k;

/** Beispiel-Id, Arbeitsblatt (Pfad wie in der Projektdatei), Ergebnis der Altform. */
const EXAMPLES = [
  ['control-chart-xbar-r-stable', 'worksheets/spc-subgroups-stable.json', XBAR_R_STABLE_RESULT],
  ['control-chart-xbar-s-stable', 'worksheets/spc-subgroups-stable.json', XBAR_S_STABLE_RESULT],
  ['control-chart-capability', 'worksheets/spc-subgroups-stable.json', CAPABILITY_RESULT],
  ['control-chart-imr-shift', 'shared/worksheets/spc-imr-shift.json', IMR_SHIFT_RESULT],
  ['control-chart-imr-trend', 'worksheets/spc-imr-trend.json', IMR_TREND_RESULT],
  ['control-chart-imr-annotated-frozen', 'shared/worksheets/spc-imr-shift.json', IMR_ANNOTATED_FROZEN_RESULT],
  ['control-chart-hubschrauber-flyer', 'shared/worksheets/hubschrauber-flyer.json', HUBSCHRAUBER_RESULT],
];

async function fetchRes(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res;
}
const fetchJson = async (relPath) => (await fetchRes(relPath)).json();

/** Arbeitsblatt wie der Kern: `shared/…` aus `examples/`, sonst aus der Modulablage. */
const worksheetUrl = (file) => (file.startsWith('shared/') ? `${SHARED}${file}` : `${OWN}${file}`);

const plain = (v) => JSON.parse(JSON.stringify(v));

suite('control-chart: Beispiele', () => {
  test('die sieben Beispiele stehen in der Modulablage, ohne modules[]', async () => {
    const own = await fetchJson(`${OWN}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), EXAMPLES.map(([id]) => id));
    for (const e of own.examples) {
      assertEqual(e.type, 'project', e.id);
      assertEqual(e.format, 'json', e.id);
      assertEqual(e.file, `projects/${e.id}.json`, e.id);
      assertEqual('modules' in e, false, e.id);
      assertTrue(!!e.title.de && !!e.title.en, `Titel fehlt: ${e.id}`);
      assertTrue(!!e.description.de && !!e.description.en, `Beschreibung fehlt: ${e.id}`);
    }
  });

  test('der globale Katalog nennt die Beispiele nicht mehr', async () => {
    const index = await fetchJson(`${SHARED}index.json`);
    const ids = new Set(index.examples.map((e) => e.id));
    for (const [id] of EXAMPLES) assertEqual(ids.has(id), false, id);
    assertTrue(ids.has('capability-bolzendurchmesser'), 'geteiltes CSV-Beispiel bleibt');
  });

  for (const [id, file, expected] of EXAMPLES) {
    test(`${id}: lädt ohne Reparatur, fromExample lässt es, Ergebnis wie in der Altform`, async () => {
      const raw = await fetchJson(`${OWN}projects/${id}.json`);
      const { sourceWorksheetFile, ...data } = raw;
      assertEqual(sourceWorksheetFile, file);
      assertDeepEqual(data._schema, { version: '1.0' });
      assertEqual(fromExample(raw, { id }, { csvToWorksheet: () => null }), raw, 'eigene Form unverändert');
      const ws = await fetchJson(worksheetUrl(file));
      const model = State.fromJSON(rewriteColumnRefs(State, data, '__source__', 'ws1'));
      assertEqual(model.columnRef.instanceId, 'ws1');
      assertEqual(model.exampleWorksheetId, null);
      const { result, points } = evaluateDerived(model, storedSource({ ws1: ws }), ['result', 'points'], T);
      assertDeepEqual(plain(result), expected);
      assertEqual(points.length, expected.n);
    });
  }

  test('geteiltes CSV-Beispiel capability-bolzendurchmesser: Arbeitsblatt, erste Spalte, Vorgaben', async () => {
    const index = await fetchJson(`${SHARED}index.json`);
    const meta = index.examples.find((e) => e.id === 'capability-bolzendurchmesser');
    assertTrue(meta.modules.includes('control-chart'), 'Katalog nennt das Modul');
    const csv = await (await fetchRes(`${SHARED}${meta.file}`)).text();
    const values = csv.trim().split(/\r?\n/).slice(1).map(Number);
    const data = { columns: [{ name: meta.columns[0].name, type: 'numeric', values }] };
    const out = fromExample(data, meta, { csvToWorksheet: csvPayloadToWorksheetState });
    const ws = out.sourceWorksheetData;
    assertDeepEqual(plain(out.columnRef), { instanceId: '__source__', sheetId: ws.activeSheetId, columnId: 'c-0' });
    const { sourceWorksheetData, ...state } = out;
    const model = State.fromJSON(rewriteColumnRefs(State, state, '__source__', 'ws1'));
    assertDeepEqual([model.chartTypeId, model.subgroupSize, model.usl, model.lsl], ['i-mr', 1, null, null], 'Vorgaben, keine Spezifikation');
    const { result } = evaluateDerived(model, storedSource({ ws1: sourceWorksheetData }), ['result'], T);
    assertDeepEqual(plain(result), BOLZEN_CSV_RESULT);
  });

  test('CSV ohne Spalten: fromExample wirft (der Kern meldet den Ladefehler)', () => {
    let threw = false;
    try { fromExample({ columns: [] }, { id: 'x' }, { csvToWorksheet: csvPayloadToWorksheetState }); } catch { threw = true; }
    assertTrue(threw);
  });
});

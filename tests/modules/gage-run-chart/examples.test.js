/**
 * Messverlaufsdiagramm: Beispiel.
 *
 * Das Beispiel `msa-gage-run-chart-attributiv` liegt samt Arbeitsblatt in der
 * Modulablage, lädt ohne Reparatur, und `derived.result` gleicht dem
 * `read().result` der Altform für dasselbe Beispiel (78 Messwerte, 13 Teile,
 * 3 Prüfer, zwei Streifen).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertDeepClose } from '../../test-utils.js';
import { rewriteColumnRefs } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { sourceColumns } from '../../../js/core/source-columns.js';
import { State } from '../../../js/modules/gage-run-chart/domain/model.js';
import { inputColumns, analyze, stripRows } from '../../../js/modules/gage-run-chart/domain/analyze.js';
import { storedSource } from '../../helpers/stored-source.js';

const BASE = '../../../js/modules/gage-run-chart/resources/examples/';
const T = (k) => k;

/** `read().result` des Altmoduls für das Beispiel (Bezugswert leer = Gesamtmittel). */
const EX_PARTS = [3, 4, 5, 8, 9, 10, 15, 17, 19, 20, 22, 24, 26];
const LEGACY_RESULT = {
  n: 78, droppedRows: 0, partCount: 13, operatorCount: 3, operators: ['D', 'E', 'F'], hasOperators: true,
  grandMean: 0.9871794871794872, refValue: 0.9871794871794872, yMin: 0, yMax: 1, warnings: [],
  cellMeans: EX_PARTS.flatMap((p) => ['D', 'E', 'F'].map((o) => (
    { part: String(p), operator: o, mean: p === 20 && o === 'D' ? 0.5 : 1 }))),
};

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

const plain = (v) => JSON.parse(JSON.stringify(v));

suite('gage-run-chart: Beispiel', () => {
  test('das Beispiel steht in der Modulablage', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), ['msa-gage-run-chart-attributiv']);
    const [e] = own.examples;
    assertEqual(e.type, 'project');
    assertEqual(e.format, 'json');
    assertEqual(e.file, 'projects/msa-gage-run-chart-attributiv.json');
    assertTrue(!!e.title.de && !!e.title.en, 'Titel fehlt');
    assertTrue(!!e.description.de && !!e.description.en, 'Beschreibung fehlt');
  });

  test('msa-gage-run-chart-attributiv: lädt ohne Reparatur, Ergebnis wie in der Altform', async () => {
    const { sourceWorksheetFile, ...data } = await fetchJson(`${BASE}projects/msa-gage-run-chart-attributiv.json`);
    assertEqual(sourceWorksheetFile, 'worksheets/msa-gage-run-attributiv.json');
    const ws = await fetchJson(`${BASE}${sourceWorksheetFile}`);
    assertEqual(data._schema?.version, '1.0');
    assertDeepEqual(Object.keys(data).sort(), ['_schema', 'gageInfo', 'measurement', 'operator', 'part', 'showOperatorMean']);
    const model = State.fromJSON(rewriteColumnRefs(State, data, '__source__', 'ws1'));
    const ref = (columnId) => ({ instanceId: 'ws1', sheetId: 'sheet-gage-run-attrib', columnId });
    assertDeepEqual(plain(model.part), ref('c-part'));
    assertDeepEqual(plain(model.operator), ref('c-op'));
    assertDeepEqual(plain(model.measurement), ref('c-result'));
    assertEqual(model.refValue, null);
    assertEqual(model.partsPerRow, 7);
    assertEqual(model.showOperatorMean, false);
    assertEqual(model.connectWithin, true);
    assertDeepEqual(plain(model.gageInfo), {
      name: 'Sichtprüfplatz A', date: '2026-07-20', reporter: 'QS', tolerance: 'i.O. / n.i.O.',
      misc: 'Attributive Prüfung, 2 Wiederholungen je Prüfer',
    });
    assertDeepEqual(plain(model.runStripEdits), {});
    const src = storedSource({ ws1: ws });
    const { result, points } = evaluateDerived(model, src, undefined, T);
    assertDeepClose(plain(result), LEGACY_RESULT);
    assertEqual(points.length, 78);
    assertEqual(stripRows(analyze(inputColumns(model, sourceColumns(src))), model.partsPerRow).length, 2);
  });
});

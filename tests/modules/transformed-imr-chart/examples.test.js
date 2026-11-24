/**
 * Transformierte I-MR-Karte: das mit dem Histogramm geteilte Beispiel
 * `spc-transformed-imr` (examples/projects/) in der neuen Form.
 *
 * Es lädt ohne Reparatur; der Wert des Tasks `analysis` gleicht dem
 * `read().result` der Altform für dasselbe Beispiel (Modus `auto`, λ = 0,35).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { rewriteColumnRefs } from '../../../js/core/model.js';
import { sourceColumns } from '../../../js/core/source-columns.js';
import { State } from '../../../js/modules/transformed-imr-chart/domain/model.js';
import { inputValues, lambdaOf, analyze } from '../../../js/modules/transformed-imr-chart/domain/analyze.js';
import { analysisValueOf } from '../../../js/modules/transformed-imr-chart/viewmodel/present.js';
import { storedSource } from '../../helpers/stored-source.js';

const plain = (v) => JSON.parse(JSON.stringify(v));

/** `read().result` der Altform für das Beispiel im Modus `auto`. */
const LEGACY_RESULT = {
  n: 50, lambda: 0.35, lambdaAuto: true,
  i: { cl: 3.6587076170624835, ucl: 6.671647655761603, lcl: 0.6457675783633636, sigma: 1.00431334623304 },
  mr: { cl: 1.132865454550869, ucl: 3.7010714400176887, lcl: 0 },
  iOriginal: { cl: 10.543116638978987, ucl: 31.23115655832991, lcl: 1.7899825322494618 },
  signals: [],
};

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

suite('transformed-imr-chart: geteiltes Beispiel in der neuen Form', () => {
  test('spc-transformed-imr: lädt ohne Reparatur, Ergebnis wie in der Altform', async () => {
    const { sourceWorksheetFile, ...data } = await fetchJson('../../../examples/projects/spc-transformed-imr.json');
    assertEqual(sourceWorksheetFile, 'worksheets/spc-transformed-lognormal.json', 'Arbeitsblatt unverändert');
    assertEqual(data._schema?.version, '1.0');
    assertDeepEqual(Object.keys(data).sort(), ['_schema', 'columnRef']);
    const model = State.fromJSON(rewriteColumnRefs(State, data, '__source__', 'ws1'));
    assertDeepEqual(plain(model.columnRef), { instanceId: 'ws1', sheetId: 'sheet-spc-trans', columnId: 'c-standzeit' });
    assertEqual(model.lambdaMode, 'auto');
    assertEqual(model.lambdaManual, 0);
    assertDeepEqual(plain(model.chart), {});
    const ws = await fetchJson(`../../../examples/${sourceWorksheetFile}`);
    const values = inputValues(model, sourceColumns(storedSource({ ws1: ws })));
    assertEqual(values.length, 50);
    const value = analysisValueOf(analyze(values, lambdaOf(model)), { errPositiveOnly: 'p', errCompute: 'c' });
    assertDeepEqual(value.result, LEGACY_RESULT);
    assertEqual(value.points.length, 50);
    assertEqual(value.error, null);
    assertEqual(value.message, null);
  });
});

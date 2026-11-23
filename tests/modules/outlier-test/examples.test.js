/**
 * Ausreißertest: das Beispiel `outlier-bolzen-grubbs` in der neuen Form.
 *
 * Es lädt ohne Reparatur; das Ergebnis (`derived.result`) gleicht dem, das
 * die Altform (`read().result`) für dasselbe Beispiel lieferte: n, die
 * markierten Punkte und je Verfahren seine Markierungen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { rewriteColumnRefs } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { State } from '../../../js/modules/outlier-test/domain/model.js';
import { storedSource } from '../../helpers/stored-source.js';

const FILE = '../../fixtures/outlier-test/outlier-bolzen-grubbs.json';
const SHARED = '../../../examples/';

/** Ergebnis der Altform für das Beispiel (Konfidenzniveau beliebig: alpha steht in der Datei). */
const LEGACY = {
  n: 30,
  flaggedIdxs: [7, 19],
  methods: { 'grubbs': [7], 'generalized-esd': [7, 19], 'tukey-iqr': [7, 19], 'modified-z': [7, 19] },
};

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

suite('outlier-test: Beispiel outlier-bolzen-grubbs', () => {
  test('lädt ohne Reparatur, Ergebnis wie in der Altform', async () => {
    const { sourceWorksheetFile, ...data } = await fetchJson(FILE);
    assertEqual(sourceWorksheetFile, 'shared/worksheets/outlier-bolzen-grubbs.json');
    const ws = await fetchJson(`${SHARED}${sourceWorksheetFile}`);
    assertEqual(data._schema?.version, '1.0');
    assertDeepEqual(Object.keys(data).sort(), ['_schema', 'alpha', 'colRef', 'enabled']);
    const model = State.fromJSON(rewriteColumnRefs(State, data, '__source__', 'ws1'), { context: { cycle: 'dmaic', confidenceLevel: 90, power: 80 } });
    assertEqual(model.colRef.instanceId, 'ws1');
    assertEqual(model.alpha, 0.05, 'alpha hängt nicht von der Einstellung ab');
    assertEqual(model.side, 'two-sided');
    assertEqual(model.esdMaxOutliers, null);
    assertEqual(model.chartMethod, 'all');
    assertDeepEqual([...model.enabled], ['grubbs', 'generalized-esd', 'tukey-iqr', 'modified-z']);
    assertDeepEqual(JSON.parse(JSON.stringify(model.chart)), {});
    const { result } = evaluateDerived(model, storedSource({ ws1: ws }));
    assertEqual(result.n, LEGACY.n);
    assertDeepEqual(result.flaggedIdxs, LEGACY.flaggedIdxs);
    assertDeepEqual(Object.fromEntries(result.methods.map((m) => [m.id, m.flagged])), LEGACY.methods);
    assertTrue(result.methods.every((m) => m.error === null), 'ein Verfahren mit Fehler');
  });
});

/**
 * Verteilungstest: die vier mit dem Histogramm geteilten Beispiele
 * `distfit-*` (examples/projects/) in der neuen Form.
 *
 * Jedes lädt ohne Reparatur; das Ergebnis (`derived.result`) gleicht dem,
 * das die Altform (`read().result`) für dasselbe Beispiel lieferte: n,
 * Reihenfolge der Verteilungen, beste Verteilung und Konsens der
 * Normalitätstests.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { rewriteColumnRefs } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { State } from '../../../js/modules/distribution-fit/domain/model.js';
import { normality } from '../../../js/modules/distribution-fit/viewmodel/present.js';
import { storedSource } from '../../helpers/stored-source.js';

const PROJECTS = '../../../examples/projects/';
const SHARED = '../../../examples/';

/** Ergebnis der Altform je Beispiel (`continuous`): Arbeitsblatt, Blatt, n, Namen, beste, Konsens (Klasse, bestanden/gültig). */
const LEGACY = {
  'distfit-normal': ['worksheets/distribution-normal.json', 'sheet-dist-normal', 80, ['Normal', 'Weibull', 'Gamma', 'Log-Normal', 'Exponential'], 'good', '4/4'],
  'distfit-exponential': ['worksheets/distribution-exponential.json', 'sheet-dist-exponential', 80, ['Weibull', 'Gamma', 'Log-Normal', 'Exponential', 'Normal'], 'poor', '0/4'],
  'distfit-weibull': ['shared/worksheets/distribution-weibull.json', 'sheet-dist-weibull', 80, ['Normal', 'Weibull', 'Gamma', 'Log-Normal', 'Exponential'], 'poor', '1/4'],
  'distfit-lognormal': ['shared/worksheets/distribution-lognormal.json', 'sheet-dist-lognormal', 80, ['Log-Normal', 'Gamma', 'Weibull', 'Normal', 'Exponential'], 'poor', '0/4'],
};

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

suite('distribution-fit: geteilte Beispiele in der neuen Form', () => {
  for (const [id, [file, sheetId, n, names, consensus, score]] of Object.entries(LEGACY)) {
    test(`${id}: lädt ohne Reparatur, Ergebnis wie in der Altform`, async () => {
      const { sourceWorksheetFile, ...data } = await fetchJson(`${PROJECTS}${id}.json`);
      assertEqual(sourceWorksheetFile, file, 'Arbeitsblatt unverändert');
      assertEqual(data._schema?.version, '1.0');
      assertDeepEqual(Object.keys(data).sort(), ['_schema', 'columnRef', 'dataType']);
      const model = State.fromJSON(rewriteColumnRefs(State, data, '__source__', 'ws1'));
      assertEqual(model.columnRef.instanceId, 'ws1');
      assertEqual(model.columnRef.sheetId, sheetId);
      assertEqual(model.dataType, 'continuous');
      assertDeepEqual(JSON.parse(JSON.stringify(model.chart)), {});
      const ws = await fetchJson(`${SHARED}${sourceWorksheetFile}`);
      const { result } = evaluateDerived(model, storedSource({ ws1: ws }));
      assertEqual(result.stats.n, n);
      assertDeepEqual(result.results.map((f) => f.name), names);
      assertEqual(result._dataType, 'continuous');
      const ndd = normality(result.normalityTests, (k) => k, 'en');
      assertEqual(ndd.consensus.cls, `distfit__ndd-consensus--${consensus}`);
      assertEqual(ndd.consensus.scoreLabel, score);
    });
  }
});

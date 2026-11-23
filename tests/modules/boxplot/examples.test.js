/**
 * Boxplot: Beispiel der Modulablage.
 *
 * Das Beispiel liegt unter `resources/examples/` in der Form des Models und
 * lädt ohne Reparatur. Die Kennzahlen (`derived.stats`) gleichen den Werten,
 * die das Altmodul (`read().stats`) für dasselbe Beispiel lieferte.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertAlmostEqual } from '../../test-utils.js';
import { rewriteColumnRefs } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { State } from '../../../js/modules/boxplot/domain/model.js';
import { storedSource } from '../../helpers/stored-source.js';

const BASE = '../../../js/modules/boxplot/resources/examples/';
const ID = 'boxplot-pizza-fahrer';

/** Kennzahlen der Altform, am Altmodul gemessen (Konfidenzniveau 95 %). */
const LEGACY_STATS = [{"name": "Fahrer_A", "stats": {"n": 15, "mean": 22.84046, "stddev": 3.868263809292965, "variance": 14.963464898285718, "seMean": 0.9987814208085677, "median": 22.7177, "min": 13.834, "max": 28.7632, "range": 14.929200000000002, "q1": 20.7259, "q3": 24.7804, "skewness": -0.32747312091199826, "kurtosis": 0.32084957717614015}, "ci": {"mean": [20.698286904510155, 24.982633095489845], "variance": [8.020556885169162, 37.21774780671383], "stddev": [2.832058771489243, 6.100635033069413]}}, {"name": "Fahrer_B", "stats": {"n": 15, "mean": 23.81185333333333, "stddev": 2.7446900777076215, "variance": 7.533323622666669, "seMean": 0.7086759307641572, "median": 22.8308, "min": 19.8376, "max": 29.7759, "range": 9.938300000000002, "q1": 21.9306, "q3": 25.02015, "skewness": 0.629598885001669, "kurtosis": -0.3216485064468335}, "ci": {"mean": [22.29189463098261, 25.331812035684052], "variance": [4.037931793251227, 18.737193600587037], "stddev": [2.0094605727038357, 4.328648010705772]}}, {"name": "Fahrer_C", "stats": {"n": 15, "mean": 29.59352, "stddev": 2.1232172054960095, "variance": 4.508051301714283, "seMean": 0.5482123251511397, "median": 29.2366, "min": 26.2156, "max": 34.7221, "range": 8.506499999999999, "q1": 28.46875, "q3": 30.5304, "skewness": 0.7502284212153314, "kurtosis": 0.5612026374909669}, "ci": {"mean": [28.417721502863373, 30.76931849713663], "variance": [2.4163575851207173, 11.21261135622083], "stddev": [1.554463761276125, 3.3485237577506943]}}];

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

/** Vergleicht Zahlen auf 1e-9, sonst gleich. */
function assertClose(actual, expected, path = '') {
  if (typeof expected === 'number') { assertAlmostEqual(actual, expected, 1e-9, path); return; }
  if (expected === null || typeof expected !== 'object') { assertEqual(actual, expected, path); return; }
  assertDeepEqual(Object.keys(actual), Object.keys(expected), `${path} Schlüssel`);
  for (const k of Object.keys(expected)) assertClose(actual[k], expected[k], `${path}.${k}`);
}

suite('boxplot: Beispiele', () => {
  test('das Beispiel steht in der Modulablage', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), [ID]);
    for (const e of own.examples) {
      assertEqual(e.type, 'project');
      assertEqual(e.format, 'json');
      assertEqual(e.file, `projects/${e.id}.json`);
    }
  });

  test('Pizza-Fahrer: drei Boxen ohne Gruppe, alles Vorgabe, Kennzahlen wie in der Altform', async () => {
    const { sourceWorksheetFile, ...data } = await fetchJson(`${BASE}projects/${ID}.json`);
    assertEqual(sourceWorksheetFile, 'shared/worksheets/hypothesis-pizza-fahrer.json');
    const ws = await fetchJson(`../../../examples/${sourceWorksheetFile}`);
    const model = State.fromJSON(rewriteColumnRefs(State, data, '__source__', 'ws1'));
    assertEqual(model.datasets.length, 3);
    assertEqual(model.datasets[0].value.instanceId, 'ws1');
    assertEqual(model.datasets[0].group, null);
    assertEqual(model.confLevel, 95);
    assertEqual(model.showStats, true);
    assertDeepEqual(JSON.parse(JSON.stringify(model.chart ?? {})), {});
    const derived = evaluateDerived(model, storedSource({ ws1: ws }));
    assertClose(derived.stats, LEGACY_STATS);
    assertEqual(derived.stats[0].stats.median, 22.7177);
    assertDeepEqual([...derived.activeColumnSlots], ['value', 'group']);
  });
});

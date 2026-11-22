/**
 * Einzelwertdiagramm: Beispiele der Modulablage.
 *
 * Beide Beispiele liegen unter `resources/examples/` in der Form des Models
 * und laden ohne Reparatur. Die Kennzahlen (`derived.stats`) gleichen den
 * Werten, die das Altmodul (`read().stats`) für dieselben Beispiele lieferte.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertAlmostEqual } from '../../test-utils.js';
import { rewriteColumnRefs } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { State } from '../../../js/modules/individual-value-plot/domain/model.js';
import { storedSource } from '../../helpers/stored-source.js';

const BASE = '../../../js/modules/individual-value-plot/resources/examples/';
const IDS = ['ivplot-pizza-fahrer', 'individual-value-plot-hubschrauber-flyer'];

/** Kennzahlen der Altform je Beispiel, festgehalten vor dem Löschen des Altmoduls. */
const LEGACY_STATS = {
  'ivplot-pizza-fahrer': [{"name": "Fahrer_A", "stats": {"n": 15, "mean": 22.84046, "stddev": 3.868263809292965, "variance": 14.963464898285718, "seMean": 0.9987814208085677, "median": 22.7177, "min": 13.834, "max": 28.7632, "range": 14.929200000000002, "q1": 20.7259, "q3": 24.7804, "skewness": -0.32747312091199826, "kurtosis": 0.32084957717614015}, "ci": {"mean": [20.698286904510155, 24.982633095489845], "variance": [8.020556885169162, 37.21774780671383], "stddev": [2.832058771489243, 6.100635033069413]}}, {"name": "Fahrer_B", "stats": {"n": 15, "mean": 23.81185333333333, "stddev": 2.7446900777076215, "variance": 7.533323622666669, "seMean": 0.7086759307641572, "median": 22.8308, "min": 19.8376, "max": 29.7759, "range": 9.938300000000002, "q1": 21.9306, "q3": 25.02015, "skewness": 0.629598885001669, "kurtosis": -0.3216485064468335}, "ci": {"mean": [22.29189463098261, 25.331812035684052], "variance": [4.037931793251227, 18.737193600587037], "stddev": [2.0094605727038357, 4.328648010705772]}}, {"name": "Fahrer_C", "stats": {"n": 15, "mean": 29.59352, "stddev": 2.1232172054960095, "variance": 4.508051301714283, "seMean": 0.5482123251511397, "median": 29.2366, "min": 26.2156, "max": 34.7221, "range": 8.506499999999999, "q1": 28.46875, "q3": 30.5304, "skewness": 0.7502284212153314, "kurtosis": 0.5612026374909669}, "ci": {"mean": [28.417721502863373, 30.76931849713663], "variance": [2.4163575851207173, 11.21261135622083], "stddev": [1.554463761276125, 3.3485237577506943]}}],
  'individual-value-plot-hubschrauber-flyer': [{"name": "Flugzeit_s", "stats": {"n": 10, "mean": 2.3789000000000002, "stddev": 0.13644734434124314, "variance": 0.018617877777777778, "seMean": 0.04314843887996155, "median": 2.3555, "min": 2.196, "max": 2.677, "range": 0.48099999999999987, "q1": 2.28875, "q3": 2.43075, "skewness": 0.9432157691491588, "kurtosis": 0.376729022366626}, "ci": {"mean": [2.281291449924135, 2.4765085500758657], "variance": [0.00880843953801324, 0.06205064121350596], "stddev": [0.09385328730531094, 0.249099661207128]}}],
};

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

/** Den Ladeweg nachbilden: Projektdatei, Spalten auf das Arbeitsblatt umhängen, streng laden. */
async function load(id) {
  const { sourceWorksheetFile, ...data } = await fetchJson(`${BASE}projects/${id}.json`);
  assertTrue(sourceWorksheetFile.startsWith('shared/'), 'Arbeitsblatt aus dem geteilten Bestand');
  const ws = await fetchJson(`../../../examples/${sourceWorksheetFile}`);
  const model = State.fromJSON(rewriteColumnRefs(State, data, '__source__', 'ws1'));
  return { model, src: storedSource({ ws1: ws }) };
}

/** Vergleicht Zahlen auf 1e-9, sonst gleich. */
function assertClose(actual, expected, path = '') {
  if (typeof expected === 'number') { assertAlmostEqual(actual, expected, 1e-9, path); return; }
  if (expected === null || typeof expected !== 'object') { assertEqual(actual, expected, path); return; }
  assertDeepEqual(Object.keys(actual), Object.keys(expected), `${path} Schlüssel`);
  for (const k of Object.keys(expected)) assertClose(actual[k], expected[k], `${path}.${k}`);
}

suite('individual-value-plot: Beispiele', () => {
  test('beide Beispiele stehen in der Modulablage, nicht im Gesamtkatalog', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), IDS);
    for (const e of own.examples) {
      assertEqual(e.type, 'project');
      assertEqual(e.format, 'json');
      assertEqual(e.file, `projects/${e.id}.json`);
    }
    const catalog = await fetchJson('../../../examples/index.json');
    assertEqual(catalog.examples.filter((e) => IDS.includes(e.id)).length, 0);
  });

  test('Pizza-Fahrer: drei Reihen, verbundene Mittelwerte, Kennzahlen wie in der Altform', async () => {
    const { model, src } = await load('ivplot-pizza-fahrer');
    assertEqual(model.datasets.length, 3);
    assertEqual(model.datasets[0].value.instanceId, 'ws1');
    assertDeepEqual(JSON.parse(JSON.stringify(model.chart)), { connectMeans: true });
    assertClose(evaluateDerived(model, src).stats, LEGACY_STATS['ivplot-pizza-fahrer']);
  });

  test('Hubschrauber: eine Reihe, Gesamtmittel, Kennzahlen wie in der Altform', async () => {
    const { model, src } = await load('individual-value-plot-hubschrauber-flyer');
    assertEqual(model.datasets.length, 1);
    assertDeepEqual(JSON.parse(JSON.stringify(model.chart)), { showOverallMean: true });
    assertClose(evaluateDerived(model, src).stats, LEGACY_STATS['individual-value-plot-hubschrauber-flyer']);
  });
});

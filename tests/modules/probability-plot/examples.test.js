/**
 * Wahrscheinlichkeitsnetz: Beispiele.
 *
 * Jedes Beispiel lädt ohne Reparatur; die Kennzahlen (`derived.stats`)
 * gleichen den Werten, die der Reihenbau des Altmoduls (`read().stats`) für
 * dasselbe Beispiel lieferte: Name, n, Mittelwert und die Referenzgerade je
 * Reihe.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertAlmostEqual } from '../../test-utils.js';
import { rewriteColumnRefs } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { State } from '../../../js/modules/probability-plot/domain/model.js';
import { storedSource } from '../../helpers/stored-source.js';

const BASE = '../../../js/modules/probability-plot/resources/examples/';
const SHARED = '../../../examples/';

/** Arbeitsblätter der Beispiele: eigene unter `worksheets/`, das Weibull-Blatt bleibt geteilt. */
const WORKSHEET = {
  'probplot-normal': 'worksheets/probplot-two-groups.json',
  'probplot-resolution': 'worksheets/probplot-resolution.json',
  'probplot-weibull': 'shared/worksheets/distribution-weibull.json',
};

/** Kennzahlen der Altform, mit dem Reihenbau des Altmoduls gerechnet (Konfidenzniveau 95 %). */
const LEGACY = {
  'probplot-normal': [
    { name: 'Messwert — A', n: 40, mean: 9.939409999999999, slope: 0.6877966140275249, intercept: -6.859686556297857 },
    { name: 'Messwert — B', n: 40, mean: 11.0031525, slope: 0.3616114405455671, intercept: -3.9219828936723298 },
  ],
  'probplot-resolution': [
    { name: 'Durchmesser', n: 80, mean: 9.963749999999994, slope: 6.721697294898367, intercept: -67.19739623205201 },
  ],
  'probplot-weibull': [
    { name: 'Lebensdauer', n: 80, mean: 87.37784499999998, slope: 0.022260555925950488, intercept: -1.8834971306503974 },
  ],
};

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

suite('probability-plot: Beispiele', () => {
  test('die drei Beispiele stehen in der Modulablage', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id).sort(), Object.keys(LEGACY).sort());
    for (const e of own.examples) {
      assertEqual(e.type, 'project');
      assertEqual(e.format, 'json');
      assertEqual(e.file, `projects/${e.id}.json`);
    }
  });

  for (const [id, expected] of Object.entries(LEGACY)) {
    test(`${id}: lädt ohne Reparatur, Kennzahlen wie in der Altform`, async () => {
      const { sourceWorksheetFile, ...data } = await fetchJson(`${BASE}projects/${id}.json`);
      assertEqual(sourceWorksheetFile, WORKSHEET[id]);
      const ws = await fetchJson(`${sourceWorksheetFile.startsWith('shared/') ? SHARED : BASE}${sourceWorksheetFile}`);
      assertEqual(data._schema?.version, '1.0');
      assertDeepEqual(Object.keys(data).sort(), ['_schema', 'datasets']);
      const model = State.fromJSON(rewriteColumnRefs(State, data, '__source__', 'ws1'));
      assertEqual(model.datasets.length, 1);
      assertEqual(model.datasets[0].valueRef.instanceId, 'ws1');
      assertEqual(model.confLevel, 95);
      assertEqual(model.showStats, true);
      assertDeepEqual(JSON.parse(JSON.stringify(model.chart)), {});
      assertDeepEqual(JSON.parse(JSON.stringify(model.legacySeries)), []);
      const { stats } = evaluateDerived(model, storedSource({ ws1: ws }));
      assertEqual(stats.length, expected.length);
      expected.forEach((e, i) => {
        assertEqual(stats[i].name, e.name);
        assertEqual(stats[i].stats.n, e.n);
        assertAlmostEqual(stats[i].stats.mean, e.mean, 1e-9, `${e.name} mean`);
        assertAlmostEqual(stats[i].referenceLine.slope, e.slope, 1e-9, `${e.name} slope`);
        assertAlmostEqual(stats[i].referenceLine.intercept, e.intercept, 1e-9, `${e.name} intercept`);
      });
    });
  }
});

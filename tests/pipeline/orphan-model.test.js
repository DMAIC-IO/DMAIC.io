/**
 * Pipeline test — orphan model (Regel D5: das Modell liegt bei seinem Besitzer).
 *
 * Ein gespeichertes Modell eines Altstands, dessen Versuchsplan und dessen
 * Regressions-Instanz gelöscht sind, wird beim Laden eine eigene
 * Regressions-Instanz (`adoptProjectModels`). Ihre Momentaufnahme genügt sich
 * selbst: sie sagt dieselben Werte voraus wie vorher und reproduziert die
 * Koeffizienten. Ohne Besitzer nennt die Optimierung die Vorgabe als
 * fehlendes Modell und rechnet nicht.
 */

import { suite, test, assertAlmostEqual, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { runMultiRegression } from '../../js/engines/regression-engine.js';
import { predictFromModel } from '../../js/engines/response-optimization-engine.js';
import { adoptProjectModels } from '../../js/core/project-models.js';
import { State as Optimization } from '../../js/modules/response-optimization/domain/model.js';
import { setModelName } from '../../js/core/model.js';
import { evaluateDerived } from '../../js/core/derived.js';
import { modelRecord } from '../helpers/model-record.js';
import { ownersSource } from '../modules/response-optimization/owners.js';

setModelName(Optimization, 'response-optimization');

const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
const T = (/** @type {string} */ k) => k;
const plain = (/** @type {any} */ v) => JSON.parse(JSON.stringify(v));

suite('Pipeline — orphan model after experiment and owner deletion', () => {
  // A simple 2² × 2-replicate dataset and its fit.
  const X = [
    [-1, -1], [-1, -1], [-1, 1], [-1, 1],
    [ 1, -1], [ 1, -1], [ 1, 1], [ 1, 1],
  ];
  const y = [10, 10.2, 8, 8.1, 20, 20.1, 18, 18.2];
  const xCols = [X.map(r => r[0]), X.map(r => r[1])];
  const fit = runMultiRegression(xCols, y, 1, 0.95, ['X1', 'X2']);
  const factorSpec = [{ name: 'X1', low: -1, high: 1 }, { name: 'X2', low: -1, high: 1 }];
  const model = modelRecord({
    id: 'm-y',
    name: 'Y',
    experimentId: 'exp-target',
    responseColumn: 'col_y',
    X, y, factorSpec,
    termSet: fit.reg.terms,
    coef: fit.reg.coeffs,
    rSqAdj: fit.adjR2,
  });
  const spec = { 'm-y': { selected: true, kind: 'max', lower: 5, upper: 25, weight: 1 } };

  /** Altstand: Planer und Regression gelöscht, die Optimierung nennt das Modell. */
  function legacyDoc() {
    return {
      phases: { data: [], improve: [{ instanceId: 'ro-1', moduleId: 'response-optimization' }] },
      moduleStates: { 'ro-1': { specs: plain(spec) } },
      models: { 'm-y': { ...plain(model), createdFromInstanceId: 'reg-gone' } },
    };
  }

  test('the orphan becomes its own regression instance in the phase of the optimization', () => {
    const { doc, changed, phasesChanged } = adoptProjectModels(legacyDoc());
    assertTrue(phasesChanged);
    assertDeepEqual(changed, ['reg-gone']);
    const entry = doc.phases.improve.find((e) => e.instanceId === 'reg-gone');
    assertEqual(entry.moduleId, 'regression');
    assertEqual(entry.customName, 'Y');
    assertTrue(!('models' in doc));
  });

  test('its snapshot predicts the same values as before the deletion', () => {
    const { doc } = adoptProjectModels(legacyDoc());
    const saved = ownersSource(doc).read('reg-gone').savedModel;
    for (const x of [[-1, -1], [0, 0], [1, -1], [0.5, 0.25]]) {
      assertAlmostEqual(predictFromModel(saved, x), predictFromModel(model, x), 1e-12, String(x));
    }
  });

  test('the snapshot reproduces the original fit and keeps its fingerprint', () => {
    const { doc } = adoptProjectModels(legacyDoc());
    const m = ownersSource(doc).read('reg-gone').savedModel;
    const refit = runMultiRegression([m.dataSnapshot.X.map(r => r[0]), m.dataSnapshot.X.map(r => r[1])], m.dataSnapshot.y, 1, 0.95, ['X1', 'X2']);
    for (let i = 0; i < m.coef.length; i++) assertAlmostEqual(refit.reg.coeffs[i], m.coef[i], 1e-9, `coef[${i}]`);
    assertEqual(m.dataSnapshot.sourceFingerprint.experimentId, 'exp-target');
    assertEqual(m.dataSnapshot.sourceFingerprint.responseColumn, 'col_y');
    assertEqual(m.dataHash, model.dataHash);
  });

  test('response-optimization without the owner names the model as missing and does not optimize', () => {
    const doc = { phases: { improve: [{ instanceId: 'ro-1', moduleId: 'response-optimization' }] }, moduleStates: {} };
    const ro = Optimization.fromJSON({ _schema: { version: '1.0' }, specs: plain(spec), optimization: null }, { context: CTX });
    const d = evaluateDerived(ro, ownersSource(doc), ['missingModels', 'canOptimize'], T);
    assertDeepEqual(d.missingModels, ['m-y']);
    assertEqual(d.canOptimize, false);
  });
});

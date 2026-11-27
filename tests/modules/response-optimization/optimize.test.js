/**
 * Zielgrößenoptimierung: Sperrgründe (domain/diagnose.js), das Optimum und
 * die Wirkungsfläche (domain/optimize.js), die Saat der Vorgaben
 * (domain/models.js).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertThrows } from '../../test-utils.js';
import { diagnose, reasonText } from '../../../js/modules/response-optimization/domain/diagnose.js';
import { optimize, contourOf, CONTOUR_GRID } from '../../../js/modules/response-optimization/domain/optimize.js';
import { effectiveSpec, seedSpec, yRangeOf, selectedIdsOf } from '../../../js/modules/response-optimization/domain/models.js';
import { buildResponseSurface } from '../../../js/engines/response-optimization-engine.js';

const T = (/** @type {string} */ k, /** @type {any} */ p) => `${k}:${JSON.stringify(p)}`;

/** Ein lineares Modell y = 1 + 2A + 3B über [0;1]×[0;2]. @param {Record<string, any>} [over] */
const lin = (over = {}) => ({
  id: 'm1', name: 'Lin', instanceId: 'i', moduleId: 'regression', termSet: ['Intercept', 'A', 'B'], coef: [1, 2, 3],
  factorSpec: [{ name: 'A', low: 0, high: 1 }, { name: 'B', low: 0, high: 2 }],
  spec: {
    predictors: [{ id: 'A', kind: 'continuous' }, { id: 'B', kind: 'continuous' }],
    terms: [{ id: 'A', factors: [{ id: 'A', degree: 1 }] }, { id: 'B', factors: [{ id: 'B', degree: 1 }] }],
  },
  dataSnapshot: { y: [1, 9] },
  ...over,
});

suite('response-optimization: Sperrgründe', () => {
  const models = [
    { id: 'a', name: 'A', rSqAdj: 0.9, lofPValue: null, factorNames: ['x', 'y'] },
    { id: 'b', name: 'B', rSqAdj: null, lofPValue: 0.04, factorNames: ['x', 'y'] },
    { id: 'c', name: 'C', rSqAdj: 0.6, lofPValue: 0.2, factorNames: ['x'] },
  ];
  test('ohne Wahl keine Gründe; R², Anpassungsmangel und Faktorstruktur wie die Altform', () => {
    assertDeepEqual(diagnose([], models), []);
    assertDeepEqual(diagnose(['a'], models), []);
    assertDeepEqual(diagnose(['b', 'a', 'c', 'gone'], models), [
      { type: 'lowR2', name: 'B', value: 0 },
      { type: 'lackOfFit', name: 'B', value: 0.04 },
      { type: 'factorMismatch', name: 'C' },
    ]);
  });
  test('Texte mit drei Nachkommastellen in der Sprache', () => {
    assertEqual(reasonText({ type: 'lowR2', name: 'B', value: 0.3 }, T, 'de'), 'lowR2:{"name":"B","value":"0,300"}');
    assertEqual(reasonText({ type: 'lackOfFit', name: 'B', value: 0.0123 }, T, 'en'), 'lackOfFit:{"name":"B","value":"0.012"}');
    assertEqual(reasonText({ type: 'factorMismatch', name: 'C' }, T, 'en'), 'factorMismatch:{"name":"C"}');
  });
});

suite('response-optimization: Saat der Vorgaben', () => {
  test('Spanne der Trainingswerte, ohne Daten 0 bis 1', () => {
    assertDeepEqual(yRangeOf({ dataSnapshot: { y: [3, null, -1, 7] } }), [-1, 7]);
    assertDeepEqual(yRangeOf({}), [0, 1]);
    assertDeepEqual(seedSpec([2, 4]), { selected: false, kind: 'max', lower: 2, upper: 4, target: 3, weight: 1 });
    assertDeepEqual(effectiveSpec({ weight: 3, selected: true }, [2, 4]), { selected: true, kind: 'max', lower: 2, upper: 4, target: 3, weight: 3 });
  });
  test('gewählt in der Reihenfolge der Vorgaben, nur vorhandene Modelle', () => {
    assertDeepEqual(selectedIdsOf({ c: { selected: true }, a: { selected: true }, b: {}, z: { selected: true } }, ['a', 'b', 'c']), ['c', 'a']);
  });
});

suite('response-optimization: Optimum', () => {
  test('maximieren treibt beide Faktoren an die obere Grenze', () => {
    const out = optimize([lin()], { m1: { selected: true, kind: 'max', lower: 1, upper: 9, target: 5, weight: 1 } });
    assertDeepEqual(out.modelRefs, ['m1']);
    assertDeepEqual(out.result.factorNames, ['A', 'B']);
    assertDeepEqual(out.result.modelNames, ['Lin']);
    assertTrue(Math.abs(/** @type {number} */ (out.result.xOpt[0]) - 1) < 1e-6 && Math.abs(/** @type {number} */ (out.result.xOpt[1]) - 2) < 1e-6);
    assertEqual(out.result.D, 1);
    assertTrue(!('ciAtOpt' in out.result) && !('paretoFront' in out.result));
  });
  test('ohne Modell wirft es', () => {
    assertThrows(() => optimize([], {}));
  });
});

suite('response-optimization: Wirkungsfläche', () => {
  const result = { xOpt: [1, 2], yPredictions: [9], dPerResponse: [1], D: 1, factorNames: ['A', 'B'], modelNames: ['Lin'], iter: 1 };
  test('Raster mit Zeile 0 oben, Bereiche, Optimum als Punkt', () => {
    const c = /** @type {any} */ (contourOf(lin(), result));
    assertEqual(c.grid.length, CONTOUR_GRID);
    const raw = buildResponseSurface(lin(), { xId: 'A', yId: 'B', fixings: {}, gridSize: CONTOUR_GRID });
    assertDeepEqual(c.grid[0], raw.grid[CONTOUR_GRID - 1]);
    assertDeepEqual([c.xId, c.yId, c.xRange, c.yRange, c.continuous], ['A', 'B', [0, 1], [0, 2], ['A', 'B']]);
    assertDeepEqual(c.point, { x: 1, y: 2, z: 9 });
  });
  test('Achsen aus der Ansicht, nur stetige; ungültige fallen zurück', () => {
    const three = lin({ spec: { predictors: [{ id: 'A', kind: 'continuous' }, { id: 'B', kind: 'continuous' }, { id: 'C', kind: 'continuous' }], terms: [] },
      factorSpec: [{ name: 'A', low: 0, high: 1 }, { name: 'B', low: 0, high: 2 }, { name: 'C', low: 0, high: 1 }], termSet: ['Intercept', 'A', 'B', 'C'], coef: [1, 2, 3, 4] });
    const c = /** @type {any} */ (contourOf(three, { ...result, xOpt: [1, 2, 1] }, { xId: 'C', yId: 'Q' }));
    assertDeepEqual([c.xId, c.yId], ['C', 'B']);
  });
  test('kategorialer Festwert: Stufe des Optimums, aus der Ansicht; Punkt nur bei passender Stufe', () => {
    const cat = lin({
      spec: { predictors: [{ id: 'A', kind: 'continuous' }, { id: 'B', kind: 'continuous' }, { id: 'G', kind: 'categorical', levels: ['a', 'b'], reference: 'a' }], terms: [] },
      factorSpec: [{ name: 'A', low: 0, high: 1 }, { name: 'B', low: 0, high: 2 }, { name: 'G', kind: 'categorical', levels: ['a', 'b'], reference: 'a' }],
      termSet: ['Intercept', 'A', 'B', 'G_b'], coef: [1, 2, 3, 5],
    });
    const r = { ...result, xOpt: [1, 2, 'b'] };
    const first = /** @type {any} */ (contourOf(cat, r));
    assertDeepEqual(first.fixings, [{ id: 'G', levels: ['a', 'b'], value: 'b' }]);
    assertTrue(first.point !== null);
    const other = /** @type {any} */ (contourOf(cat, r, { fixings: { G: 'a' } }));
    assertEqual(other.fixings[0].value, 'a');
    assertEqual(other.point, null);
    assertEqual(/** @type {any} */ (contourOf(cat, r, { fixings: { G: 'zz' } })).fixings[0].value, 'b');
  });
  test('ohne Spezifikation oder mit weniger als zwei stetigen Faktoren keine Fläche', () => {
    assertEqual(contourOf(lin({ spec: null }), result), null);
    assertEqual(contourOf(null, result), null);
    assertEqual(contourOf(lin({ spec: { predictors: [{ id: 'A', kind: 'continuous' }], terms: [] } }), result), null);
  });
});

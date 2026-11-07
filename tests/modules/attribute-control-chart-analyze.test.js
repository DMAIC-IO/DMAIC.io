import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { State } from '../../js/modules/attribute-control-chart/domain/model.js';
import {
  analyzeState, uniqueViolations, signalIndices, baselineEndOf, resultOf, pointsOf,
} from '../../js/modules/attribute-control-chart/domain/analyze.js';

const D_REF = { instanceId: 'w', sheetId: 's', columnId: 'd' };
const N_REF = { instanceId: 'w', sheetId: 's', columnId: 'n' };
const reader = (cols) => (ref) => cols[ref.columnId] || [];

suite('Attribute CC analysis — analyzeState', () => {
  test('no defects column → null', () => {
    assertEqual(analyzeState(State.fromJSON({ chartTypeId: 'c' }), reader({})), null);
  });

  test('p: pairs drop missing defects and missing or zero sizes', () => {
    const a = analyzeState(State.fromJSON({ chartTypeId: 'p', defectsRef: D_REF, sizeRef: N_REF }),
      reader({ d: [2, 'x', 1, 4, 3], n: [50, 50, 0, 50, null] }));
    assertEqual(a.valid, 2);
    assertEqual(JSON.stringify(a.n), JSON.stringify([50, 50]));
    assertEqual(a.ct.id, 'p');
  });

  test('p without a size column → null', () => {
    assertEqual(analyzeState(State.fromJSON({ chartTypeId: 'p', defectsRef: D_REF }), reader({ d: [1, 2, 3] })), null);
  });

  test('np: nulls filtered, n is the constant n', () => {
    const a = analyzeState(State.fromJSON({ chartTypeId: 'np', defectsRef: D_REF, constantN: 40 }),
      reader({ d: [1, null, 2, 3] }));
    assertEqual(a.valid, 3);
    assertEqual(JSON.stringify(a.n), JSON.stringify([40, 40, 40])); // engine returns n per point
  });

  test('c: n is null; fewer than two points → null', () => {
    const a = analyzeState(State.fromJSON({ chartTypeId: 'c', defectsRef: D_REF }), reader({ d: [3, 5, 4] }));
    assertEqual(a.valid, 3);
    assertEqual(a.n, null);
    assertEqual(analyzeState(State.fromJSON({ chartTypeId: 'c', defectsRef: D_REF }), reader({ d: [3] })), null);
  });

  test('a point beyond the limits is a violation (rule 1)', () => {
    const a = analyzeState(State.fromJSON({ chartTypeId: 'c', defectsRef: D_REF }),
      reader({ d: [2, 2, 2, 2, 2, 2, 2, 2, 2, 30] }));
    assertTrue(a.violations.some(v => v.index === 9));
  });
});

const base = { chartTypeId: 'c', defectsRef: D_REF, sizeRef: null, constantN: 50, baselineCount: null, enabledRules: [1] };
const spike = [2, 2, 2, 2, 2, 2, 2, 2, 2, 30];

suite('attribute-control-chart: Lesefläche als Zahlen', () => {
  test('uniqueViolations entdoppelt und sortiert', () => {
    assertDeepEqual(uniqueViolations([{ index: 3, ruleId: 2 }, { index: 1, ruleId: 1 }, { index: 3, ruleId: 2 }]),
      [{ index: 1, ruleId: 1 }, { index: 3, ruleId: 2 }]);
  });

  test('signalIndices: eindeutig und aufsteigend', () => {
    assertDeepEqual(signalIndices([{ index: 5 }, { index: 2 }, { index: 5 }, { index: 10 }]), [2, 5, 10]);
    assertDeepEqual(signalIndices([]), []);
  });

  test('baselineEndOf: nur, wenn kleiner als die Punktzahl', () => {
    assertEqual(baselineEndOf(4, 10), 4);
    assertEqual(baselineEndOf(10, 10), null);
    assertEqual(baselineEndOf(12, 10), null);
    assertEqual(baselineEndOf(null, 10), null);
    assertEqual(baselineEndOf(0, 10), null);
  });

  test('resultOf: c-Karte mit einem Signal', () => {
    const a = analyzeState(base, reader({ d: spike }));
    const r = resultOf(a, 'c');
    assertEqual(r.chartType, 'c');
    assertEqual(r.statistic, 'count');
    assertEqual(r.valid, 10);
    assertEqual(r.variableLimits, false);
    assertDeepEqual(r.signals, [9]);
    assertDeepEqual(r.violations, [{ index: 9, ruleId: 1 }]);
    assertTrue(Number.isFinite(r.ucl) && Number.isFinite(r.sigma));
    assertEqual(resultOf(null, 'c'), null);
  });

  test('resultOf: variable Grenzen → ucl/lcl/sigma null', () => {
    const a = analyzeState({ ...base, chartTypeId: 'p', sizeRef: N_REF }, reader({ d: [2, 3, 1, 4], n: [50, 60, 40, 55] }));
    const r = resultOf(a, 'p');
    assertEqual(r.variableLimits, true);
    assertEqual(r.ucl, null);
    assertEqual(r.lcl, null);
    assertEqual(r.sigma, null);
  });

  test('pointsOf: eine Zeile je Punkt, n null bei c', () => {
    const a = analyzeState(base, reader({ d: spike }));
    const rows = pointsOf(a);
    assertEqual(rows.length, 10);
    assertDeepEqual(Object.keys(rows[0]), ['value', 'n', 'ucl', 'lcl', 'signal']);
    assertEqual(rows[0].n, null);
    assertEqual(rows[9].signal, true);
    assertDeepEqual(pointsOf(null), []);
  });
});

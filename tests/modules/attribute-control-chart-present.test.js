import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { analyzeState } from '../../js/modules/attribute-control-chart/domain/analyze.js';
import { kpisOf, badgeOf, violationRowsOf, controlChartOf, meanOf } from '../../js/modules/attribute-control-chart/viewmodel/present.js';

const D = { instanceId: 'w', sheetId: 's', columnId: 'd' };
const model = { chartTypeId: 'c', defectsRef: D, sizeRef: null, constantN: 50, baselineCount: null, enabledRules: [1] };
const t = (k, p) => (p ? `${k}|${JSON.stringify(p)}` : k);
const unstable = analyzeState(model, () => [2, 2, 2, 2, 2, 2, 2, 2, 2, 30]);
const stable = analyzeState(model, () => [3, 4, 2, 5, 3, 4, 3, 2, 4, 3]);

suite('attribute-control-chart: Anzeige', () => {
  test('meanOf: Mittel einer Liste, Einzelwert unverändert, nicht-endlich bleibt nicht-endlich', () => {
    assertEqual(meanOf([1, 2, 3]), 2);
    assertEqual(meanOf(4), 4);
    assertEqual(meanOf([]), 0);
    assertTrue(Number.isNaN(meanOf([1, NaN])));
    assertEqual(meanOf(Infinity), Infinity);
  });

  test('kpisOf wie die alte Kennzahlenleiste', () => {
    const k = kpisOf(unstable);
    assertEqual(k.cl, unstable.result.cl.toFixed(4));
    assertEqual(k.uclMean, unstable.result.ucl.toFixed(3));
    assertEqual(k.limitsLabel, 'UCL / LCL');
    assertEqual(k.violationCount, 1);
    assertEqual(k.valid, 10);
    assertEqual(kpisOf(null), null);
  });

  test('badgeOf: rohe Verletzungen zählen', () => {
    assertDeepEqual(badgeOf(stable, t), { stable: true, text: 'stable', icon: 'status.ok', cls: 'attr-cc__badge--stable' });
    assertDeepEqual(badgeOf(unstable, t), { stable: false, text: 'unstable|{"count":1}', icon: 'status.warning', cls: 'attr-cc__badge--unstable' });
  });

  test('violationRowsOf mit globalen Texten', () => {
    assertDeepEqual(violationRowsOf(unstable, t), [{ key: '9-1', idx: 'common.pointLabel|{"n":10}', rule: 'common.ruleLabel|{"n":1}', desc: 'common.nelsonAttr.1.short' }]);
    assertDeepEqual(violationRowsOf(null, t), []);
  });

  test('controlChartOf: Konfiguration wie bisher, editKey control-chart', () => {
    const c = controlChartOf(unstable, model, t);
    assertEqual(c.type, 'control-chart');
    assertEqual(c.config.editKey, 'control-chart');
    assertEqual(c.config.yLabel, 'yLabel_c');
    assertTrue(c.config.violationIndices instanceof Set && c.config.violationIndices.has(9));
    assertEqual(c.config.baselineEnd, null);
    assertEqual(c.config.showZones, true);
    assertEqual(controlChartOf({ ...unstable }, { ...model, baselineCount: 4 }, t).config.baselineEnd, 4);
    assertEqual(controlChartOf(null, model, t), null);
  });
});

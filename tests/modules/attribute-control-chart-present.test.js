import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { analyzeState } from '../../js/modules/attribute-control-chart/domain/analyze.js';
import { kpisOf, badgeOf, violationRowsOf, controlChartOf, meanOf } from '../../js/modules/attribute-control-chart/viewmodel/present.js';
import { checkValue } from '../../js/core/model.js';
import controlChart from '../../js/widgets/control-chart/schema.js';

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
    const k = kpisOf(unstable, 'en');
    assertEqual(k.cl, unstable.result.cl.toFixed(4));
    assertEqual(k.uclMean, unstable.result.ucl.toFixed(3));
    assertEqual(k.limitsLabel, 'UCL / LCL');
    assertEqual(k.violationCount, 1);
    assertEqual(k.valid, 10);
    assertEqual(kpisOf(null), null);
  });

  test('kpisOf: Zahlen nach App-Sprache', () => {
    const k = kpisOf(unstable, 'de');
    assertEqual(k.cl, unstable.result.cl.toFixed(4).replace('.', ','));
    assertEqual(kpisOf(unstable, 'en').cl, unstable.result.cl.toFixed(4));
  });

  test('badgeOf: rohe Verletzungen zählen', () => {
    assertDeepEqual(badgeOf(stable, t), { stable: true, text: 'stable', icon: 'status.ok', cls: 'attr-cc__badge--stable' });
    assertDeepEqual(badgeOf(unstable, t), { stable: false, text: 'unstable|{"count":1}', icon: 'status.warning', cls: 'attr-cc__badge--unstable' });
  });

  test('violationRowsOf mit globalen Texten', () => {
    assertDeepEqual(violationRowsOf(unstable, t), [{ key: '9-1', idx: 'common.pointLabel|{"n":10}', rule: 'common.ruleLabel|{"n":1}', desc: 'common.nelsonAttr.1.short' }]);
    assertDeepEqual(violationRowsOf(null, t), []);
  });

  test('controlChartOf: Konfiguration des Widgets, Listen statt Set und Zahl, ohne editKey', () => {
    const c = controlChartOf(unstable, model, t);
    assertEqual(c.type, undefined);
    assertEqual(c.editKey, undefined);
    assertEqual(c.yLabel, 'yLabel_c');
    assertTrue(Array.isArray(c.violationIndices));
    assertTrue(c.violationIndices.includes(9));
    assertTrue(Array.isArray(c.cl) && Array.isArray(c.ucl) && Array.isArray(c.lcl));
    assertEqual(c.baselineEnd, null);
    assertEqual(c.showZones, true);
    checkValue(controlChart.props.config, 'controlChart', c);
    assertEqual(controlChartOf({ ...unstable }, { ...model, baselineCount: 4 }, t).baselineEnd, 4);
    assertEqual(controlChartOf(null, model, t), null);
  });
});

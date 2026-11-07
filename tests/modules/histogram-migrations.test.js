import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { State } from '../../js/modules/histogram/domain/model.js';
import { from0 } from '../../js/modules/histogram/domain/migrations.js';
import { loadModel } from '../../js/core/initial-model.js';

const r = { instanceId: 'w', sheetId: 's', columnId: 'c' };

suite('histogram: Migration', () => {
  test('v1 seriesRefs → datasets', () => {
    assertDeepEqual(from0({ seriesRefs: [r, null, r] }).datasets, [{ valueRef: r, groupRef: null }, { valueRef: r, groupRef: null }]);
  });
  test('flache Diagrammfelder → view.histogramChart, leere Texte und Vorgaben entfallen', () => {
    const out = from0({
      datasets: [{ valueRef: r, groupRef: null }], chartTitleText: 'Mein Titel', chartXLabelText: '', chartYLabelText: 'Anzahl',
      showTitle: true, titleSize: 15, labelSize: 14, tickSize: 11, showXLabel: false, showYLabel: true, showXTicks: true, showYTicks: true,
      bgColor: null, refLines: [], refAreas: [{ dir: 'x', min: 1, max: 2, label: '', color: 'rgba(0,0,0,0.1)' }], barGap: 1,
      showPareto: false, showBoxplot: true, showStats: false, seriesOverrides: [{ fillColor: 'red' }], binMode: 'manual', binWidth: 2, confLevel: 90,
    });
    assertDeepEqual(out.histogramChart, {
      title: 'Mein Titel', yLabel: 'Anzahl', labelSize: 14, showXLabel: false,
      refAreas: [{ dir: 'x', min: 1, max: 2, label: '', color: 'rgba(0,0,0,0.1)' }], pareto: false,
    });
    assertEqual(out.showStats, false);
    assertEqual(out.seriesOverrides, undefined);
    assertEqual(out.binMode, 'manual');
    assertEqual(out.binWidth, 2);
    assertEqual(out.confLevel, 90);
  });
  test('Unsinn wird bereinigt, binWidth nur bei manual', () => {
    const out = from0({ binMode: 'weird', binWidth: 3, confLevel: 'x', datasets: 'kaputt' });
    assertEqual(out.binMode, undefined);
    assertEqual(out.binWidth, null);
    assertEqual(out.confLevel, undefined);
    assertEqual(out.datasets, undefined);
  });
  test('Altstand lädt ohne Reparaturwarnung', () => {
    const warn = console.warn; const seen = []; console.warn = (...a) => seen.push(a.join(' '));
    try {
      const m = loadModel(State, { datasets: [{ valueRef: r, groupRef: null }], chartTitleText: 'T', showStats: true, binMode: 'auto', binWidth: null, confLevel: 95 });
      assertEqual(m.histogramChart.title, 'T');
      assertDeepEqual(seen, []);
    } finally { console.warn = warn; }
  });
});

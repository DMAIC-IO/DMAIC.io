/**
 * D.Mike — histogram module: model ⇄ chart config mapping.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { State } from '../../js/modules/histogram/histogram-model.js';
import { buildChartConfig, copyBack, toOverrides } from '../../js/modules/histogram/histogram-chart-config.js';

const AUTO = { title: 'Histogramm: A', xLabel: 'Wert', yLabel: 'Häufigkeit' };
const series = () => [{ name: 'A', values: [1, 2, 3], visible: true, fillColor: 'f', borderColor: 'b', borderWidth: 1, borderStyle: 'solid', pattern: '', patternColor: '', patternSolidity: 0.4, showNormalCurve: true }];

suite('histogram module — chart config', () => {
  test('empty model labels fall back to the automatic ones', () => {
    const cfg = buildChartConfig(new State(), series(), AUTO);
    assertEqual(cfg.title, AUTO.title);
    assertEqual(cfg.xLabel, AUTO.xLabel);
    assertEqual(cfg.persistEdits, false);
    assertEqual(cfg.pareto, true);
    assertEqual(cfg.boxplotStrip, true);
    assertEqual(cfg.binWidth, null);
  });
  test('manual bin mode passes the bin width; auto mode passes null', () => {
    const m = new State(); m.binMode = 'manual'; m.binWidth = 0.5;
    assertEqual(buildChartConfig(m, series(), AUTO).binWidth, 0.5);
    m.binMode = 'auto';
    assertEqual(buildChartConfig(m, series(), AUTO).binWidth, null);
  });
  test('refLines/refAreas are copies, not the model arrays', () => {
    const m = new State(); m.refLines = [{ dir: 'v', value: 2 }];
    const cfg = buildChartConfig(m, series(), AUTO);
    cfg.refLines.push({ dir: 'h', value: 1 });
    assertEqual(m.refLines.length, 1);
  });
  test('copyBack keeps auto labels automatic and stores edited ones', () => {
    const m = new State();
    const cfg = buildChartConfig(m, series(), AUTO);
    cfg.xLabel = 'Durchmesser [mm]'; cfg.titleSize = 18; cfg.pareto = false; cfg.barGap = 3;
    cfg.refLines.push({ dir: 'v', value: 2 });
    copyBack(m, cfg, AUTO);
    assertEqual(m.chartConfig.title, '');
    assertEqual(m.chartConfig.xLabel, 'Durchmesser [mm]');
    assertEqual(m.chartConfig.titleSize, 18);
    assertEqual(m.showPareto, false);
    assertEqual(m.barGap, 3);
    assertEqual(m.refLines.length, 1);
  });
  test('toOverrides keeps the legacy override shape (no values)', () => {
    const o = toOverrides(series())[0];
    assertDeepEqual(Object.keys(o).sort(), ['borderColor', 'borderStyle', 'borderWidth', 'fillColor', 'name', 'pattern', 'patternColor', 'patternSolidity', 'showNormalCurve', 'visible']);
  });
  test('round trip through toJSON keeps edits', () => {
    const m = new State();
    const cfg = buildChartConfig(m, series(), AUTO);
    cfg.yLabel = 'Anzahl';
    copyBack(m, cfg, AUTO);
    const back = State.fromJSON(JSON.parse(JSON.stringify(m.toJSON())));
    assertEqual(back.chartConfig.yLabel, 'Anzahl');
    assertTrue(back.chartConfig.title === '');
  });
});

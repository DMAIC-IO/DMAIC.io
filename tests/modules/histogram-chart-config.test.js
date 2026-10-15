/**
 * D.Mike — histogram module: model ⇄ chart config mapping.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { State } from '../../js/modules/histogram/histogram-model.js';
import { buildChartConfig, copyBack, toOverrides } from '../../js/modules/histogram/histogram-chart-config.js';
import { histogramData } from '../../js/modules/histogram/histogram.js';

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

suite('histogram module — destroy before the queued auto-plot', () => {
  function mountSaved() {
    const container = document.createElement('div');
    container.innerHTML = '<div data-ref="chart-area"></div><div data-ref="chart"></div>'
      + '<div data-ref="placeholder"></div><div data-ref="stats-panel"></div><div data-ref="error-box"></div>';
    const created = [];
    const module = {
      _container: container,
      _context: {
        i18n: { t: (k) => k },
        eventBus: { on: () => {}, off: () => {} },
        stateManager: { getModuleState: () => null },
        chartManager: { create: async (...a) => { created.push(a); return { id: created.length }; }, update: () => {}, destroy: () => {} },
      },
    };
    const c = histogramData(module, (k) => k);
    c.model = new State();
    c.model.datasets = [{ valueRef: { instanceId: 'w', sheetId: 's', columnId: 'c-0' }, groupRef: null }];
    c._getColumnValues = () => [1, 2, 3, 4, 5];
    c._getColumnName = () => 'A';
    return { c, created };
  }
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  test('destroy before the frame fires: no chart is created', async () => {
    const { c, created } = mountSaved();
    c.init();
    c.destroy();
    await frame();
    assertEqual(created.length, 0);
  });

  test('a late autoPlot/plot/render after destroy creates nothing', async () => {
    const { c, created } = mountSaved();
    c.init();
    c.destroy();
    c._autoPlot();
    c._plot();
    await c._renderChart();
    await frame();
    assertEqual(created.length, 0);
  });

  test('control: without destroy the queued auto-plot creates the chart', async () => {
    const { c, created } = mountSaved();
    c.init();
    await frame();
    assertEqual(created.length, 1);
    c.destroy();
  });
});

suite('histogram module — error state', () => {
  function mount() {
    const container = document.createElement('div');
    container.innerHTML = '<div data-ref="placeholder" style="display:none"></div>'
      + '<div data-ref="chart-area"></div><div data-ref="stats-panel"></div><div data-ref="error-box"></div>';
    const module = {
      _container: container,
      _context: {
        i18n: { t: (k) => k },
        chartManager: { destroy: () => {} },
      },
    };
    const c = histogramData(module, (k) => k);
    c.model = new State();
    c._seriesData = [{ name: 'A', values: [1, 2, 3, 4, 5], fillColor: 'rgb(1 2 3)', visible: true }];
    return { c, container };
  }
  const q = (el, ref) => el.querySelector(`[data-ref="${ref}"]`);

  test('stats table renders for valid series data', () => {
    const { c, container } = mount();
    c._renderStats();
    assertTrue(q(container, 'stats-panel').children.length > 0);
  });

  test('an error clears series, hides stats and chart, shows the placeholder', () => {
    const { c, container } = mount();
    c._renderStats();
    c._showError('boom');
    assertEqual(c._seriesData, null);
    assertEqual(q(container, 'stats-panel').children.length, 0);
    assertEqual(q(container, 'chart-area').style.display, 'none');
    assertEqual(q(container, 'placeholder').style.display, '');
    c.confLevelChanged({ target: { value: '90' } });
    assertEqual(q(container, 'stats-panel').children.length, 0);
    c.model.showStats = true;
    c._renderStats();
    assertEqual(q(container, 'stats-panel').children.length, 0);
    clearTimeout(c._errorTimer);
  });
});

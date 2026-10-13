/**
 * Tests for the PLOT-cluster render helpers in js/core/chart/chart-module-base.js
 * (`_showPlaceholder`, `_showChartArea`, `_upsertChart`), shared by the bar,
 * pie-chart, pareto, mosaic and heatmap modules.
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { chartModuleLifecycle } from '../../../js/core/chart/chart-module-base.js';

/** Fake chartManager recording every call; `create` resolves on demand. */
function fakeChartManager() {
  const calls = [];
  const pending = [];
  return {
    calls,
    pending,
    create(host, type, config) {
      calls.push(['create', type, config]);
      return new Promise((resolve) => { pending.push(() => resolve({ type, host })); });
    },
    update(chart, config) { calls.push(['update', chart.type, config]); },
    destroy(chart) { calls.push(['destroy', chart.type]); },
  };
}

/**
 * Build a live-instance stand-in: the lifecycle object plus a fake module whose
 * container holds the three anchors the helpers query.
 * @param {{withWrap?: boolean}} [opts]
 */
function makeInstance({ withWrap = true } = {}) {
  const container = document.createElement('div');
  container.innerHTML = `
    <div data-ref="chart-area"></div>
    <div data-ref="placeholder"></div>
    ${withWrap ? '<div data-ref="chart-wrap"><span>stale</span></div>' : ''}`;
  const chartManager = fakeChartManager();
  const module = { _container: container, _context: { chartManager } };
  const instance = chartModuleLifecycle(module, { mountPicker() {}, themeMode: 'render' });
  instance.clearStatsCalls = 0;
  instance._clearStats = function () { this.clearStatsCalls++; };
  const q = (ref) => container.querySelector(`[data-ref="${ref}"]`);
  return { instance, chartManager, q };
}

suite('chart-module-base — PLOT render helpers', () => {
  test('_showChartArea shows the chart area and hides the placeholder', () => {
    const { instance, q } = makeInstance();
    q('chart-area').style.display = 'none';
    instance._showChartArea();
    assertEqual(q('chart-area').style.display, '');
    assertEqual(q('placeholder').style.display, 'none');
  });

  test('_showPlaceholder hides the chart, disposes it and clears the stats', () => {
    const { instance, chartManager, q } = makeInstance();
    instance._chart = { type: 'bar' };
    instance._showPlaceholder();
    assertEqual(q('chart-area').style.display, 'none');
    assertEqual(q('placeholder').style.display, '');
    assertEqual(instance._chart, null);
    assertEqual(chartManager.calls[0][0], 'destroy');
    assertEqual(instance.clearStatsCalls, 1);
  });

  test('_upsertChart creates the chart into an emptied wrap on first call', async () => {
    const { instance, chartManager, q } = makeInstance();
    const done = instance._upsertChart('bar', { title: 'T' });
    assertEqual(q('chart-wrap').children.length, 0, 'wrap must be emptied before create');
    chartManager.pending[0]();
    assertEqual(await done, true);
    assertEqual(instance._chart.type, 'bar');
    assertEqual(chartManager.calls[0][1], 'bar');
    assertEqual(chartManager.calls[0][2].title, 'T');
  });

  test('_upsertChart updates an existing chart in place', async () => {
    const { instance, chartManager } = makeInstance();
    const chart = { type: 'pie' };
    instance._chart = chart;
    assertEqual(await instance._upsertChart('pie', { a: 1 }), true);
    assertEqual(chartManager.calls.length, 1);
    assertEqual(chartManager.calls[0][0], 'update');
    assertTrue(instance._chart === chart, 'chart instance must be kept');
  });

  test('_upsertChart returns false when the chart wrap is gone', async () => {
    const { instance, chartManager } = makeInstance({ withWrap: false });
    assertEqual(await instance._upsertChart('bar', {}), false);
    assertEqual(chartManager.calls.length, 0);
  });

  test('_upsertChart discards a chart whose render was overtaken', async () => {
    const { instance, chartManager } = makeInstance();
    const first = instance._upsertChart('bar', {});
    instance._renderGen++; // a newer render started meanwhile
    chartManager.pending[0]();
    assertEqual(await first, false);
    assertEqual(instance._chart, null);
    assertEqual(chartManager.calls[1][0], 'destroy');
  });
});

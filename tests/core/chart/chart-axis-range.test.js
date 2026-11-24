/**
 * ChartBase `axisRange`: user-set axis min/max from the chart editor.
 * A set side pins the axis exactly; an empty side keeps the module value or
 * the automatic range.
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import ScatterChart from '../../../js/core/chart/types/scatter.js';
import BoxplotChart from '../../../js/core/chart/types/boxplot.js';
import ProbabilityPlotChart from '../../../js/core/chart/types/probability-plot.js';

function mount(cfg, Type = ScatterChart) {
  const host = document.createElement('div');
  host.style.width = '600px';
  host.style.height = '400px';
  document.body.appendChild(host);
  const chart = new Type(host, cfg, { language: 'de' });
  chart.render();
  return { host, chart };
}

function openEditor(chart) {
  chart._editorOpen = true;
  chart._buildEditor();
  return chart._editorInner;
}

/** Set an axis range input and fire its change event. */
function setInput(inner, key, value) {
  const inp = inner.querySelector(`input[data-axis-range="${key}"]`);
  inp.value = value;
  inp.dispatchEvent(new Event('change'));
  return inp;
}

const SERIES = [{ name: 'A', x: [3, 97], y: [1, 2] }];

suite('ChartBase axis range', () => {
  test('no axisRange keeps the nice-rounded automatic range', () => {
    const { host, chart } = mount({ series: SERIES });
    assertTrue(chart._xTick.min <= 0, `min ${chart._xTick.min}`);
    assertTrue(chart._xTick.max >= 100, `max ${chart._xTick.max}`);
    chart.destroy(); host.remove();
  });

  test('a set x side is pinned exactly, the other stays automatic', () => {
    const { host, chart } = mount({ series: SERIES, axisRange: { xMin: 7 } });
    assertEqual(chart._xTick.min, 7);
    assertTrue(chart._xTick.max >= 97, `max ${chart._xTick.max}`);
    assertTrue(chart._xTick.ticks.every((t) => t >= 7), chart._xTick.ticks.join(','));
    chart.destroy(); host.remove();
  });

  test('both y sides pinned exactly', () => {
    const { host, chart } = mount({ series: SERIES, axisRange: { yMin: 0, yMax: 5 } });
    assertEqual(chart._yTick.min, 0);
    assertEqual(chart._yTick.max, 5);
    chart.destroy(); host.remove();
  });

  test('user side wins over the module-supplied yMin', () => {
    const { host, chart } = mount({ series: SERIES, yMin: -10, axisRange: { yMin: 0.5 } });
    assertEqual(chart._yTick.min, 0.5);
    chart.destroy(); host.remove();
  });

  test('empty user side keeps the module-supplied value', () => {
    const { host, chart } = mount({ series: SERIES, yMin: -10, yMax: 10, axisRange: { yMax: 4 } });
    assertTrue(chart._yTick.min <= -10, `min ${chart._yTick.min}`);
    assertEqual(chart._yTick.max, 4);
    chart.destroy(); host.remove();
  });

  test('a non-increasing range is ignored for that axis only', () => {
    const { host, chart } = mount({ series: SERIES, axisRange: { xMin: 50, xMax: 10, yMax: 3 } });
    assertTrue(chart._xTick.min <= 0 && chart._xTick.max >= 100, `${chart._xTick.min}..${chart._xTick.max}`);
    assertEqual(chart._yTick.max, 3);
    chart.destroy(); host.remove();
  });

  test('zoom state wins over the axis range while zoomed', () => {
    const { host, chart } = mount({ series: SERIES, axisRange: { xMin: 0, xMax: 100 } });
    chart._viewState = { xMin: 20, xMax: 40, yMin: 1, yMax: 2 };
    chart.render();
    assertTrue(chart._xTick.min >= 15 && chart._xTick.max <= 45, `${chart._xTick.min}..${chart._xTick.max}`);
    chart.destroy(); host.remove();
  });

  test('axisRange is an editor key (persisted per module instance)', () => {
    assertTrue(ScatterChart.editorKeys.includes('axisRange'));
  });
});

suite('ChartBase axis range editor', () => {
  test('numeric axes get four inputs', () => {
    const { host, chart } = mount({ series: SERIES });
    const inner = openEditor(chart);
    for (const k of ['xMin', 'xMax', 'yMin', 'yMax']) {
      assertTrue(!!inner.querySelector(`input[data-axis-range="${k}"]`), k);
    }
    chart.destroy(); host.remove();
  });

  test('an edit writes axisRange, re-renders and notifies', () => {
    let calls = 0;
    const { host, chart } = mount({ series: SERIES, onEditorChange: () => { calls++; } });
    const inner = openEditor(chart);
    setInput(inner, 'yMax', '5');
    assertEqual(chart.config.axisRange.yMax, 5);
    assertEqual(chart._yTick.max, 5);
    assertTrue(calls >= 1, 'notified');
    chart.destroy(); host.remove();
  });

  test('clearing a field removes the side', () => {
    const { host, chart } = mount({ series: SERIES, axisRange: { yMax: 5, xMin: 1 } });
    const inner = openEditor(chart);
    assertEqual(inner.querySelector('input[data-axis-range="yMax"]').value, '5');
    setInput(inner, 'yMax', '');
    assertTrue(!('yMax' in chart.config.axisRange), JSON.stringify(chart.config.axisRange));
    assertEqual(chart.config.axisRange.xMin, 1);
    chart.destroy(); host.remove();
  });

  test('clearing the last field resets axisRange to null', () => {
    const { host, chart } = mount({ series: SERIES, axisRange: { yMax: 5 } });
    setInput(openEditor(chart), 'yMax', '');
    assertEqual(chart.config.axisRange, null);
    chart.destroy(); host.remove();
  });

  test('min >= max marks both inputs invalid', () => {
    const { host, chart } = mount({ series: SERIES });
    const inner = openEditor(chart);
    setInput(inner, 'xMin', '50');
    setInput(inner, 'xMax', '10');
    const lo = inner.querySelector('input[data-axis-range="xMin"]');
    const hi = inner.querySelector('input[data-axis-range="xMax"]');
    assertTrue(lo.classList.contains('dmike-chart-ed-input--invalid'), 'xMin invalid');
    assertTrue(hi.classList.contains('dmike-chart-ed-input--invalid'), 'xMax invalid');
    assertTrue(!inner.querySelector('input[data-axis-range="yMin"]').classList.contains('dmike-chart-ed-input--invalid'));
    chart.destroy(); host.remove();
  });

  test('an edit resets the zoom', () => {
    const { host, chart } = mount({ series: SERIES });
    chart._viewState = { xMin: 20, xMax: 40, yMin: 1, yMax: 2 };
    setInput(openEditor(chart), 'xMin', '0');
    assertEqual(chart._viewState, null);
    chart.destroy(); host.remove();
  });

  test('horizontal boxplot: only the x (value) axis gets inputs', () => {
    const { host, chart } = mount({ groups: [{ name: 'A', values: [1, 2, 3, 4, 5] }] }, BoxplotChart);
    const inner = openEditor(chart);
    assertTrue(!!inner.querySelector('input[data-axis-range="xMin"]'), 'x');
    assertTrue(!inner.querySelector('input[data-axis-range="yMin"]'), 'no y');
    chart.destroy(); host.remove();
  });

  test('probability plot: no y inputs (transformed axis)', () => {
    const { host, chart } = mount({ series: [{ name: 'A', values: [1, 2, 3, 4, 5] }] }, ProbabilityPlotChart);
    const inner = openEditor(chart);
    assertTrue(!!inner.querySelector('input[data-axis-range="xMin"]'), 'x');
    assertTrue(!inner.querySelector('input[data-axis-range="yMin"]'), 'no y');
    chart.destroy(); host.remove();
  });
});

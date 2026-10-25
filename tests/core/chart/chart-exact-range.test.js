/**
 * ChartBase `xExact` / `yExact`: the axis spans exactly the configured
 * (or data) bounds instead of the nice-rounded tick range.
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import ScatterChart from '../../../js/core/chart/types/scatter.js';

function mount(cfg) {
  const host = document.createElement('div');
  host.style.width = '600px';
  host.style.height = '400px';
  document.body.appendChild(host);
  const chart = new ScatterChart(host, cfg, { language: 'de' });
  chart.render();
  return { host, chart };
}

const SERIES = [{ name: 'A', x: [3, 97], y: [1, 2] }];

suite('ChartBase exact range', () => {
  test('xExact keeps the configured x range', () => {
    const { host, chart } = mount({ series: SERIES, xMin: 3, xMax: 97, xExact: true });
    assertEqual(chart._xTick.min, 3);
    assertEqual(chart._xTick.max, 97);
    chart.destroy(); host.remove();
  });

  test('xExact drops ticks outside the range', () => {
    const { host, chart } = mount({ series: SERIES, xMin: 3, xMax: 97, xExact: true });
    assertTrue(chart._xTick.ticks.length > 0, 'has ticks');
    assertTrue(chart._xTick.ticks.every((t) => t >= 3 && t <= 97), chart._xTick.ticks.join(','));
    chart.destroy(); host.remove();
  });

  test('without xExact the range is rounded', () => {
    const { host, chart } = mount({ series: SERIES, xMin: 3, xMax: 97 });
    assertTrue(chart._xTick.min <= 0, `min ${chart._xTick.min}`);
    assertTrue(chart._xTick.max >= 100, `max ${chart._xTick.max}`);
    chart.destroy(); host.remove();
  });

  test('yExact mirrors xExact on y', () => {
    const { host, chart } = mount({ series: SERIES, yMin: 0.5, yMax: 2.5, yExact: true });
    assertEqual(chart._yTick.min, 0.5);
    assertEqual(chart._yTick.max, 2.5);
    chart.destroy(); host.remove();
  });

  test('xExact with xTicks keeps only ticks inside the range', () => {
    const { host, chart } = mount({
      series: SERIES, xMin: 3, xMax: 97, xExact: true, xTicks: [0, 10, 50, 100],
    });
    assertEqual(JSON.stringify(chart._xTick.ticks), JSON.stringify([10, 50]));
    chart.destroy(); host.remove();
  });

  test('yExact on an empty series falls back to the nice range without NaN', () => {
    const { host, chart } = mount({ series: [{ name: 'A', x: [], y: [] }], yExact: true, xExact: true });
    for (const t of [chart._xTick, chart._yTick]) {
      assertTrue(Number.isFinite(t.min) && Number.isFinite(t.max), `${t.min}..${t.max}`);
      assertTrue(t.max > t.min, 'increasing range');
    }
    chart.destroy(); host.remove();
  });

  test('xExact with xMin === xMax falls back to the nice range', () => {
    const { host, chart } = mount({ series: SERIES, xMin: 5, xMax: 5, xExact: true });
    assertTrue(chart._xTick.max > chart._xTick.min, 'increasing range');
    chart.destroy(); host.remove();
  });
});

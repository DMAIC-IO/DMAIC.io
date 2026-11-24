/**
 * Bar chart with numeric categories: the x axis becomes a numeric axis, so
 * reference lines/areas, zoom and the axis range are in data units and the
 * tick numbers extend when zooming out.
 */
import { suite, test, assertEqual, assertTrue, assertAlmostEqual } from '../../test-utils.js';
import BarChart from '../../../js/core/chart/types/bar.js';

function mount(cfg) {
  const host = document.createElement('div');
  host.style.width = '600px';
  host.style.height = '400px';
  document.body.appendChild(host);
  const chart = new BarChart(host, cfg, { language: 'de' });
  chart.render();
  return { host, chart };
}

const CATS = ['7', '10', '13', '16', '19', '22', '25', '28', '31', '34', '37', '40'];
const GROUPS = [{ name: 'Probability', values: CATS.map((_, i) => 0.01 * (i + 1)) }];

/** Bar centre (px) of category index ci. */
function barCentre(chart, ci) {
  const r = chart._barRects.find((b) => b.ci === ci);
  return r.x + r.w / 2;
}

suite('BarChart — numeric categories', () => {
  test('bars sit at their numeric value', () => {
    const { host, chart } = mount({ categories: CATS, groups: GROUPS });
    assertAlmostEqual(barCentre(chart, 0), chart._xScale(7), 0.5);
    assertAlmostEqual(barCentre(chart, 11), chart._xScale(40), 0.5);
    chart.destroy(); host.remove();
  });

  test('a ref area from 0 to 12 starts at x = 0', () => {
    const { host, chart } = mount({
      categories: CATS, groups: GROUPS,
      refAreas: [{ dir: 'x', min: 0, max: 12, color: 'rgba(0,0,255,0.2)' }],
    });
    assertTrue(chart._xTick.min <= 0, `min ${chart._xTick.min}`);
    const rect = host.querySelector('svg rect[data-ref-area], svg g rect');
    assertTrue(!!rect, 'ref area drawn');
    // 12 lies between the bars of 10 and 13
    assertTrue(chart._xScale(12) > barCentre(chart, 1) && chart._xScale(12) < barCentre(chart, 2), 'x=12 between 10 and 13');
    chart.destroy(); host.remove();
  });

  test('numeric tick labels are drawn and extend when zoomed out', () => {
    const { host, chart } = mount({ categories: CATS, groups: GROUPS });
    chart._viewState = { xMin: -50, xMax: 100, yMin: 0, yMax: 0.2 };
    chart.render();
    const labels = [...host.querySelectorAll('.dmike-bar__tick')].map((t) => t.textContent);
    assertTrue(labels.length >= 3, labels.join(','));
    assertTrue(chart._xTick.ticks.some((t) => t < 0), chart._xTick.ticks.join(','));
    assertTrue(chart._xTick.ticks.some((t) => t > 50), chart._xTick.ticks.join(','));
    assertEqual(host.querySelectorAll('.dmike-bar__category').length, 0);
    chart.destroy(); host.remove();
  });

  test('integer categories get integer ticks only', () => {
    const { host, chart } = mount({ categories: ['1', '2', '3'], groups: [{ name: 'A', values: [1, 2, 3] }] });
    assertTrue(chart._xTick.ticks.every((t) => Number.isInteger(t)), chart._xTick.ticks.join(','));
    chart.destroy(); host.remove();
  });

  test('the axis range editor offers x for numeric categories', () => {
    const { host, chart } = mount({ categories: CATS, groups: GROUPS, axisRange: { xMin: 0 } });
    assertEqual(chart._xTick.min, 0);
    assertTrue(chart._axisRangeAxes().x);
    chart.destroy(); host.remove();
  });

  test('text categories stay categorical', () => {
    const { host, chart } = mount({ categories: ['A', '7'], groups: [{ name: 'A', values: [1, 2] }] });
    assertEqual(chart._xTick.min, -0.5);
    assertEqual(chart._xTick.max, 1.5);
    assertTrue(!chart._axisRangeAxes().x);
    assertEqual(host.querySelectorAll('.dmike-bar__category').length, 2);
    chart.destroy(); host.remove();
  });

  test('numericCategories: false keeps numeric labels categorical', () => {
    const { host, chart } = mount({ categories: CATS, groups: GROUPS, numericCategories: false });
    assertEqual(chart._xTick.min, -0.5);
    assertEqual(host.querySelectorAll('.dmike-bar__category').length, CATS.length);
    chart.destroy(); host.remove();
  });

  test('tooltip picks the bar nearest to the cursor value', () => {
    const { host, chart } = mount({ categories: CATS, groups: GROUPS });
    const hits = chart._findNearby(12.6, 0.01, 10);
    assertEqual(hits.length, 1);
    assertTrue(hits[0].node.textContent.startsWith('13'), hits[0].node.textContent);
    chart.destroy(); host.remove();
  });
});

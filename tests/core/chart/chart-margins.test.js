/**
 * ChartBase margins follow the drawn elements: everything shown keeps
 * DEFAULT_MARGIN, hidden elements give their room to the plot area.
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import ScatterChart from '../../../js/core/chart/types/scatter.js';
import BarChart from '../../../js/core/chart/types/bar.js';
import MultiVariChart from '../../../js/core/chart/types/multi-vari.js';
import {
  DEFAULT_MARGIN, COMPACT_MARGIN, X_TICKS_BOTTOM, X_LABEL_ONLY_BOTTOM, Y_LABEL_GUTTER,
} from '../../../js/core/chart/chart-base.js';

function mount(Type, cfg) {
  const host = document.createElement('div');
  host.style.width = '600px';
  host.style.height = '400px';
  document.body.appendChild(host);
  const chart = new Type(host, cfg, { language: 'de' });
  chart.render();
  return { host, chart };
}

/** Margins as the plot area reveals them. */
function margins(chart) {
  const pa = chart._getPlotArea();
  return { top: pa.y, bottom: pa.totalH - pa.y - pa.h, left: pa.x };
}

const XY = { series: [{ name: 'A', x: [1, 2, 3], y: [4, 5, 6] }] };
const ALL_ON = { ...XY, title: 'T', xLabel: 'X', yLabel: 'Y', showLegend: false };
const ALL_OFF = {
  ...ALL_ON, showTitle: false, showXLabel: false, showYLabel: false,
  showXTicks: false, showYTicks: false,
};

suite('ChartBase margins', () => {
  test('everything shown keeps DEFAULT_MARGIN top and bottom, left >= default', () => {
    const { host, chart } = mount(ScatterChart, ALL_ON);
    const m = margins(chart);
    assertEqual(m.top, DEFAULT_MARGIN.top);
    assertEqual(m.bottom, DEFAULT_MARGIN.bottom);
    assertTrue(m.left >= DEFAULT_MARGIN.left, `left ${m.left}`);
    chart.destroy(); host.remove();
  });

  test('everything hidden gives the compact margins', () => {
    const { host, chart } = mount(ScatterChart, ALL_OFF);
    assertEqual(JSON.stringify(margins(chart)),
      JSON.stringify({ top: COMPACT_MARGIN.top, bottom: COMPACT_MARGIN.bottom, left: COMPACT_MARGIN.left }));
    chart.destroy(); host.remove();
  });

  test('an empty title counts as hidden', () => {
    const { host, chart } = mount(ScatterChart, { ...ALL_ON, title: '' });
    assertEqual(margins(chart).top, COMPACT_MARGIN.top);
    chart.destroy(); host.remove();
  });

  test('x ticks without x title reserve the tick gutter; x title without ticks moves up', () => {
    let { host, chart } = mount(ScatterChart, { ...ALL_OFF, showXTicks: true });
    assertEqual(margins(chart).bottom, X_TICKS_BOTTOM);
    chart.destroy(); host.remove();
    ({ host, chart } = mount(ScatterChart, { ...ALL_OFF, showXLabel: true }));
    assertEqual(margins(chart).bottom, X_LABEL_ONLY_BOTTOM);
    const label = [...host.querySelectorAll('svg text')].find(t => t.textContent === 'X');
    const pa = chart._getPlotArea();
    assertEqual(Number(label.getAttribute('y')), pa.y + pa.h + 20);
    chart.destroy(); host.remove();
  });

  test('y title without y ticks reserves only the title gutter', () => {
    const { host, chart } = mount(ScatterChart, { ...ALL_OFF, showYLabel: true });
    assertEqual(margins(chart).left, COMPACT_MARGIN.left + Y_LABEL_GUTTER);
    chart.destroy(); host.remove();
  });

  test('bar keeps room for its category labels without x ticks', () => {
    const { host, chart } = mount(BarChart, {
      categories: ['a', 'b', 'c'], series: [{ name: 'S', values: [1, 2, 3] }],
      showTitle: false, showXLabel: false, showYLabel: false, showXTicks: false, showYTicks: false,
    });
    assertEqual(margins(chart).bottom, X_TICKS_BOTTOM);
    chart.destroy(); host.remove();
  });

  test('bar with rotated labels keeps the full default bottom without an x title', () => {
    const cats = ['alpha-long-name', 'beta-long-name', 'gamma'];
    const { host, chart } = mount(BarChart, {
      categories: cats, series: [{ name: 'S', values: [1, 2, 3] }], showXLabel: false,
    });
    assertEqual(margins(chart).bottom, DEFAULT_MARGIN.bottom);
    chart.destroy(); host.remove();
  });

  test('multi-vari keeps its panel band above the plot without a title', () => {
    const { host, chart } = mount(MultiVariChart, { title: '', showTitle: false, panels: [] });
    assertEqual(margins(chart).top, COMPACT_MARGIN.top + 20);
    chart.destroy(); host.remove();
  });
});

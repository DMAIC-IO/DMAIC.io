/**
 * ChartBase fixed size: `chartWidth` / `chartHeight` (px, 100–4000, null =
 * auto) from the chart editor. A set side keeps its pixels on screen and in
 * export; `sizeExportOnly` limits it to the export.
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import ScatterChart from '../../../js/core/chart/types/scatter.js';
import PieChart from '../../../js/core/chart/types/pie.js';
import { normalizeChartSize } from '../../../js/core/chart/chart-editor.js';

function mount(cfg) {
  const host = document.createElement('div');
  host.style.width = '600px';
  host.style.height = '400px';
  document.body.appendChild(host);
  const chart = new ScatterChart(host, cfg, { language: 'de' });
  chart.render();
  return { host, chart };
}

function done(m) { m.chart.destroy(); m.host.remove(); }

const SERIES = [{ name: 'A', x: [3, 97], y: [1, 2] }];

suite('ChartBase fixed size', () => {
  test('no size keeps the measured size and no inline style', () => {
    const m = mount({ series: SERIES });
    assertEqual(m.chart._getSize().w, 600);
    assertEqual(m.chart._svgWrap.style.width, '');
    assertTrue(!m.chart._wrap.classList.contains('dmike-chart-wrap--fixed'), 'no fixed class');
    done(m);
  });

  test('fixed width only: width fixed, height measured', () => {
    // The measured height depends on the runner's CSS; compare against the
    // same chart without a fixed size instead of a hard-coded value.
    const auto = mount({ series: SERIES });
    const autoH = auto.chart._getSize().h;
    done(auto);
    const m = mount({ series: SERIES, chartWidth: 900 });
    assertEqual(m.chart._getSize().w, 900);
    assertEqual(m.chart._getSize().h, autoH);
    assertEqual(m.chart._svg.getAttribute('width'), '900');
    assertEqual(m.chart._svgWrap.style.width, '900px');
    assertEqual(m.chart._svgWrap.style.height, '');
    assertTrue(m.chart._wrap.classList.contains('dmike-chart-wrap--fixed'), 'fixed class');
    done(m);
  });

  test('fixed both sides smaller than the host', () => {
    const m = mount({ series: SERIES, chartWidth: 300, chartHeight: 200 });
    assertEqual(m.chart._svg.getAttribute('width'), '300');
    assertEqual(m.chart._svg.getAttribute('height'), '200');
    assertEqual(m.chart._svgWrap.getBoundingClientRect().width, 300);
    done(m);
  });

  test('export only leaves the screen size measured', () => {
    const m = mount({ series: SERIES, chartWidth: 900, sizeExportOnly: true });
    assertEqual(m.chart._getSize().w, 600);
    assertEqual(m.chart._svgWrap.style.width, '');
    done(m);
  });

  test('switching export only on clears inline size and class', () => {
    const m = mount({ series: SERIES, chartWidth: 900 });
    m.chart.config.sizeExportOnly = true;
    m.chart.render();
    assertEqual(m.chart._svgWrap.style.width, '');
    assertTrue(!m.chart._wrap.classList.contains('dmike-chart-wrap--fixed'), 'no fixed class');
    assertEqual(m.chart._svg.getAttribute('width'), '600');
    done(m);
  });

  test('clearing chartWidth back to null restores auto', () => {
    const m = mount({ series: SERIES, chartWidth: 900 });
    m.chart.config.chartWidth = null;
    m.chart.render();
    assertEqual(m.chart._svgWrap.style.width, '');
    assertEqual(m.chart._svg.getAttribute('width'), '600');
    done(m);
  });

  test('_sizeOverride wins over config and measurement', () => {
    const m = mount({ series: SERIES, chartWidth: 900 });
    m.chart._sizeOverride = { w: 1200, h: 800 };
    const s = m.chart._getSize();
    assertEqual(s.w, 1200);
    assertEqual(s.h, 800);
    m.chart._sizeOverride = null;
    done(m);
  });

  test('pie (own render) pins the fixed size too', () => {
    const host = document.createElement('div');
    host.style.width = '600px';
    host.style.height = '400px';
    document.body.appendChild(host);
    const chart = new PieChart(host, {
      slices: [{ label: 'A', value: 2 }, { label: 'B', value: 3 }],
      chartWidth: 900, chartHeight: 700,
    }, { language: 'de' });
    chart.render();
    assertEqual(chart._svg.getAttribute('width'), '900');
    assertEqual(chart._svgWrap.style.height, '700px');
    assertTrue(chart._wrap.classList.contains('dmike-chart-wrap--fixed'), 'fixed class');
    chart.destroy(); host.remove();
  });

  test('normalizeChartSize clamps, rounds and nulls', () => {
    assertEqual(normalizeChartSize(''), null);
    assertEqual(normalizeChartSize(null), null);
    assertEqual(normalizeChartSize('abc'), null);
    assertEqual(normalizeChartSize(50), 100);
    assertEqual(normalizeChartSize(9000), 4000);
    assertEqual(normalizeChartSize('640.4'), 640);
  });
});

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

/** Build the chart editor and return its inner container. */
function openEditor(chart) {
  chart._editorOpen = true;
  chart._buildEditor();
  return chart._editorInner;
}

/** Type a value into a size input and commit it like the user does. */
function setSize(inner, key, value) {
  const inp = inner.querySelector(`input[data-chart-size="${key}"]`);
  if (!inp) throw new Error(`no size input ${key}`);
  inp.value = value;
  inp.dispatchEvent(new Event('change'));
  return inp;
}

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

  test('size section sets, clamps and clears chartWidth', () => {
    const m = mount({ series: SERIES });
    const inner = openEditor(m.chart);
    const inp = setSize(inner, 'chartWidth', '50');
    assertEqual(m.chart.config.chartWidth, 100);
    assertEqual(inp.value, '100');
    assertEqual(m.chart._svg.getAttribute('width'), '100');
    setSize(m.chart._editorInner, 'chartWidth', '9000.7');
    assertEqual(m.chart.config.chartWidth, 4000);
    setSize(m.chart._editorInner, 'chartWidth', '');
    assertEqual(m.chart.config.chartWidth, null);
    assertEqual(m.chart._svgWrap.style.width, '');
    done(m);
  });

  test('size inputs show the stored values', () => {
    const m = mount({ series: SERIES, chartWidth: 640, chartHeight: null });
    const inner = openEditor(m.chart);
    const w = inner.querySelector('input[data-chart-size="chartWidth"]');
    const h = inner.querySelector('input[data-chart-size="chartHeight"]');
    assertEqual(w.value, '640');
    assertEqual(h.value, '');
    assertEqual(w.min, '100');
    assertEqual(w.max, '4000');
    done(m);
  });

  test('export-only checkbox sets sizeExportOnly', () => {
    const m = mount({ series: SERIES, chartWidth: 900 });
    const inner = openEditor(m.chart);
    const box = inner.querySelector('input[type="checkbox"][data-key="sizeExportOnly"]');
    assertTrue(!!box, 'checkbox exists');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    assertEqual(m.chart.config.sizeExportOnly, true);
    assertEqual(m.chart._svgWrap.style.width, '');
    done(m);
  });

  test('a size edit reports via _onEditorChange', () => {
    const m = mount({ series: SERIES });
    const inner = openEditor(m.chart);
    let calls = 0;
    m.chart._onEditorChange = (c) => { calls++; assertEqual(c.config.chartHeight, 300); };
    setSize(inner, 'chartHeight', '300');
    assertEqual(calls, 1);
    done(m);
  });

  test('pie editor offers the size section', () => {
    const host = document.createElement('div');
    host.style.width = '600px';
    host.style.height = '400px';
    document.body.appendChild(host);
    const chart = new PieChart(host, {
      slices: [{ label: 'A', value: 2 }, { label: 'B', value: 3 }],
    }, { language: 'de' });
    chart.render();
    const inner = openEditor(chart);
    setSize(inner, 'chartWidth', '800');
    assertEqual(chart.config.chartWidth, 800);
    assertEqual(chart._svg.getAttribute('width'), '800');
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

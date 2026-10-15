/**
 * D.Mike — Histogram type, series path (config.series): several series on
 * shared bins, count axis, patterns, normal curves. The legacy path
 * (no series) is covered by histogram-bins.test.js.
 */
import { suite, test, assertEqual, assertAlmostEqual, assertTrue } from '../../test-utils.js';
import HistogramChart from '../../../js/core/chart/types/histogram.js';

const A = [1, 2, 2, 3, 3, 3, 4, 4, 5];
const B = [3, 4, 4, 5, 5, 5, 6, 6, 7];

function s(name, values, extra = {}) {
  return {
    name, values, visible: true, fillColor: 'rgba(52,152,219,0.6)', borderColor: 'rgba(41,128,185,1)',
    borderWidth: 1, borderStyle: 'solid', pattern: '', patternColor: '', patternSolidity: 0.4,
    showNormalCurve: true, ...extra,
  };
}

function mount(cfg) {
  const host = document.createElement('div');
  host.style.width = '900px';
  host.style.height = '480px';
  document.body.appendChild(host);
  const chart = new HistogramChart(host, cfg, { language: 'de' });
  chart.render();
  return { host, chart, svg: chart._svg };
}
function unmount(m) { m.chart.destroy(); m.host.remove(); }
const bars = (m, si) => m.svg.querySelectorAll(`rect[data-series="${si}"][data-bin]`);

suite('Histogram type — series path: bins and bars', () => {
  test('all series share one set of bins with the fixed width', () => {
    const m = mount({ series: [s('A', A), s('B', B)], binWidth: 1 });
    const { bins, binWidth, globalMin, globalMax } = m.chart._seriesBins;
    assertEqual(binWidth, 1);
    assertEqual(globalMin, 1);
    assertEqual(globalMax, 7);
    assertEqual(bins[0].length, bins[1].length);
    unmount(m);
  });
  test('y axis is count: extent top is 1.12 × the highest bin count', () => {
    const m = mount({ series: [s('A', A, { showNormalCurve: false }), s('B', B, { showNormalCurve: false })], binWidth: 1 });
    const e = m.chart._getDataExtent();
    assertEqual(e.yMin, 0);
    assertAlmostEqual(e.yMax, 3 * 1.12, 1e-12);
    unmount(m);
  });
  test('one bar per non-empty bin and visible series; hidden series draws none', () => {
    const m = mount({ series: [s('A', A), s('B', B, { visible: false })], binWidth: 1 });
    assertTrue(bars(m, 0).length > 0);
    assertEqual(bars(m, 1).length, 0);
    unmount(m);
  });
  test('bar height maps the count on the y scale', () => {
    const m = mount({ series: [s('A', A)], binWidth: 1 });
    const r = [...bars(m, 0)].find(el => el.getAttribute('data-bin') === '2'); // [3,4): 3 values
    const yS = m.chart._yScale;
    assertAlmostEqual(Number(r.getAttribute('height')), yS(0) - yS(3), 1e-6);
    unmount(m);
  });
  test('barGap shrinks each bar by the gap in px', () => {
    const m = mount({ series: [s('A', A)], binWidth: 1, barGap: 4 });
    const r = bars(m, 0)[0];
    const xS = m.chart._xScale;
    assertAlmostEqual(Number(r.getAttribute('width')), xS(2) - xS(1) - 4, 1e-6);
    unmount(m);
  });
  test('pattern draws an overlay rect filled with a chart-unique pattern', () => {
    const m = mount({ series: [s('A', A, { pattern: '/' })], binWidth: 1 });
    const ov = m.svg.querySelector('rect[data-pattern][data-series="0"]');
    assertTrue(!!ov, 'overlay drawn');
    const id = ov.getAttribute('fill').match(/url\(#(.+)\)/)[1];
    assertTrue(!!m.svg.querySelector(`pattern[id="${id}"]`), 'pattern defined');
    assertTrue(id.includes(String(m.chart._uid)), 'id carries the chart uid');
    unmount(m);
  });
  test('border style dash and none', () => {
    const m = mount({ series: [s('A', A, { borderStyle: 'dash' }), s('B', B, { borderStyle: 'none' })], binWidth: 1 });
    assertTrue(!!bars(m, 0)[0].getAttribute('stroke-dasharray'));
    assertEqual(bars(m, 1)[0].getAttribute('stroke-width'), '0');
    unmount(m);
  });
  test('all series hidden → default extent, no bars, no NaN', () => {
    const m = mount({ series: [s('A', A, { visible: false }), s('B', B, { visible: false })] });
    assertEqual(m.svg.querySelectorAll('rect[data-bin]').length, 0);
    assertTrue(!m.svg.outerHTML.includes('NaN'));
    unmount(m);
  });
});

suite('Histogram type — series path: normal curves', () => {
  test('one curve per visible series with the flag on', () => {
    const m = mount({ series: [s('A', A), s('B', B, { showNormalCurve: false })], binWidth: 1 });
    assertEqual(m.svg.querySelectorAll('path[data-normal]').length, 1);
    unmount(m);
  });
  test('curve is scaled by n · binWidth (peak in count units)', () => {
    const m = mount({ series: [s('A', A)], binWidth: 1 });
    const n = A.length;
    const mean = A.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(A.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));
    const peak = n * 1 / (sd * Math.sqrt(2 * Math.PI));
    assertTrue(m.chart._getDataExtent().yMax >= peak, 'extent covers the peak');
    unmount(m);
  });
  test('sd = 0 series draws bars but no curve and no NaN', () => {
    const m = mount({ series: [s('C', [5, 5, 5, 5])] });
    assertEqual(m.svg.querySelectorAll('path[data-normal]').length, 0);
    assertTrue(bars(m, 0).length > 0);
    assertTrue(!m.svg.outerHTML.includes('NaN'));
    unmount(m);
  });
});

suite('Histogram type — legacy path unchanged', () => {
  test('without series the density bars are drawn as before (no data-series rects)', () => {
    const m = mount({ data: A, binMethod: 'manual', binCount: 4 });
    assertEqual(m.chart._bins.length, 4);
    assertEqual(m.svg.querySelectorAll('rect[data-series]').length, 0);
    assertEqual(m.chart._seriesBins, undefined);
    unmount(m);
  });
  test('empty series array falls back to the legacy path', () => {
    const m = mount({ series: [], data: A });
    assertTrue(Array.isArray(m.chart._bins));
    unmount(m);
  });
});

suite('Histogram type — series path: legend, descriptors, tooltip', () => {
  test('legend: rect per visible series, line per drawn curve', () => {
    const m = mount({ series: [s('A', A), s('B', B, { showNormalCurve: false }), s('C', A, { visible: false })], binWidth: 1 });
    const items = m.chart._getLegendItems();
    assertEqual(items.filter(i => i.type === 'rect').map(i => i.label).join(','), 'A,B');
    assertEqual(items.filter(i => i.type === 'line').length, 1);
    unmount(m);
  });
  test('descriptors edit the series objects in config.series', () => {
    const m = mount({ series: [s('A', A), s('B', B)], binWidth: 1 });
    const d = m.chart._getSeriesDescriptors();
    assertEqual(d.length, 2);
    d[1].setName('Bee'); d[1].setVisible(false); d[0].setColor('rgba(1,2,3,0.5)'); d[0].setStroke('red'); d[0].setStrokeWidth(3);
    const [sa, sb] = m.chart.config.series;
    assertEqual(sb.name, 'Bee'); assertEqual(sb.visible, false);
    assertEqual(sa.fillColor, 'rgba(1,2,3,0.5)'); assertEqual(sa.borderColor, 'red'); assertEqual(sa.borderWidth, 3);
    unmount(m);
  });
  test('tooltip over a bar lists range and count with share per visible series', () => {
    const m = mount({ series: [s('A', A), s('B', B)], binWidth: 1 });
    const hits = m.chart._findNearby(3.5, 1, 10); // bin [3,4): A=3 of 9, B=1 of 9
    assertEqual(hits.length, 1);
    const txt = hits[0].node.textContent;
    assertTrue(txt.includes('3') && txt.includes('4'), txt);
    assertTrue(txt.includes('A') && txt.includes('33,3'), txt);
    assertTrue(txt.includes('B') && txt.includes('11,1'), txt);
    unmount(m);
  });
  test('no tooltip above the highest bar of that bin', () => {
    const m = mount({ series: [s('A', A)], binWidth: 1 });
    assertEqual(m.chart._findNearby(3.5, 3.2, 10).length, 0);
    unmount(m);
  });
});

suite('Histogram type — series path: Pareto', () => {
  test('drawn only with exactly one visible series', () => {
    const two = mount({ series: [s('A', A), s('B', B)], binWidth: 1, pareto: true });
    assertEqual(two.svg.querySelectorAll('[data-pareto]').length, 0);
    unmount(two);
    const one = mount({ series: [s('A', A), s('B', B, { visible: false })], binWidth: 1, pareto: true });
    assertEqual(one.svg.querySelectorAll('polyline[data-pareto]').length, 1);
    unmount(one);
  });
  test('line ends at 100 % = top of the plot area', () => {
    const m = mount({ series: [s('A', A)], binWidth: 1, pareto: true });
    const pts = m.svg.querySelector('polyline[data-pareto]').getAttribute('points').trim().split(/\s+/);
    const lastY = Number(pts[pts.length - 1].split(',')[1]);
    assertAlmostEqual(lastY, m.chart._plotArea.y, 1e-6);
    unmount(m);
  });
  test('right axis has five ticks and the legend sits right of it', () => {
    const m = mount({ series: [s('A', A)], binWidth: 1, pareto: true });
    const ticks = [...m.svg.querySelectorAll('text[data-pareto-tick]')];
    assertEqual(ticks.length, 5);
    const pa = m.chart._plotArea;
    const tickRight = Math.max(...ticks.map(t => Number(t.getAttribute('x'))));
    const legendText = [...m.svg.querySelectorAll('text')].find(t => t.textContent === 'A');
    assertTrue(Number(legendText.getAttribute('x')) > tickRight + 20, 'legend does not overlap the %-axis');
    assertTrue(tickRight > pa.x + pa.w);
    unmount(m);
  });
  test('pareto off → no extra right space', () => {
    const on = mount({ series: [s('A', A)], binWidth: 1, pareto: true });
    const off = mount({ series: [s('A', A)], binWidth: 1, pareto: false });
    assertAlmostEqual(off.chart._plotArea.w - on.chart._plotArea.w, 48, 1e-6);
    unmount(on); unmount(off);
  });
  test('tooltip adds the cumulative share', () => {
    const m = mount({ series: [s('A', A)], binWidth: 1, pareto: true });
    const txt = m.chart._findNearby(3.5, 1, 10)[0].node.textContent; // [1,2)=1,[2,3)=2,[3,4)=3 → 6/9
    assertTrue(txt.includes('66,7'), txt);
    unmount(m);
  });
});

suite('Histogram type — series path: boxplot strip', () => {
  test('one box per visible series', () => {
    const m = mount({ series: [s('A', A), s('B', B), s('C', A, { visible: false })], binWidth: 1, boxplotStrip: true });
    assertEqual(m.svg.querySelectorAll('g[data-box]').length, 2);
    unmount(m);
  });
  test('strip height shrinks the plot area', () => {
    const off = mount({ series: [s('A', A), s('B', B)], binWidth: 1 });
    const on = mount({ series: [s('A', A), s('B', B)], binWidth: 1, boxplotStrip: true });
    assertAlmostEqual(off.chart._plotArea.h - on.chart._plotArea.h, 2 * (22 + 6) + 6, 1e-6);
    unmount(off); unmount(on);
  });
  test('box uses the bars’ x scale: median line at xScale(median)', () => {
    const m = mount({ series: [s('A', A)], binWidth: 1, boxplotStrip: true });
    const med = m.svg.querySelector('g[data-box="0"] line[data-box-median]');
    assertAlmostEqual(Number(med.getAttribute('x1')), m.chart._xScale(3), 1e-6);
    unmount(m);
  });
  test('box follows zoom (view state)', () => {
    const m = mount({ series: [s('A', A)], binWidth: 1, boxplotStrip: true });
    m.chart._viewState = { xMin: 2, xMax: 4, yMin: 0, yMax: 4 };
    m.chart.render();
    const med = m.svg.querySelector('g[data-box="0"] line[data-box-median]');
    assertAlmostEqual(Number(med.getAttribute('x1')), m.chart._plotArea.x + m.chart._plotArea.w / 2, 1);
    unmount(m);
  });
  test('outliers drawn as circles', () => {
    const m = mount({ series: [s('O', [10, 11, 11, 12, 12, 12, 13, 13, 14, 40])], boxplotStrip: true });
    assertEqual(m.svg.querySelectorAll('circle[data-box-outlier]').length, 1);
    unmount(m);
  });
  test('single-value series → degenerate box, no NaN', () => {
    const m = mount({ series: [s('A', A), s('One', [4])], binWidth: 1, boxplotStrip: true });
    assertEqual(m.svg.querySelectorAll('g[data-box]').length, 2);
    assertTrue(!m.svg.outerHTML.includes('NaN'));
    unmount(m);
  });
  test('tooltip in the strip row shows n, quartiles, mean and outliers', () => {
    const m = mount({ series: [s('O', [10, 11, 11, 12, 12, 12, 13, 13, 14, 40])], boxplotStrip: true });
    const rowMidPx = m.chart._stripTop + 6 + 11;
    const hits = m.chart._findNearby(m.chart._xScaleInv(m.chart._xScale(12)), m.chart._yScaleInv(rowMidPx), 10);
    assertEqual(hits.length, 1);
    const txt = hits[0].node.textContent;
    assertTrue(txt.includes('n = 10') && txt.includes('Q1') && txt.includes('Q3') && txt.includes('1'), txt);
    unmount(m);
  });
  test('strip sits below the plot with Pareto and strip together', () => {
    const m = mount({ series: [s('A', A)], binWidth: 1, boxplotStrip: true, pareto: true });
    const pa = m.chart._plotArea;
    assertTrue(m.chart._stripTop >= pa.y + pa.h, `${m.chart._stripTop} < ${pa.y + pa.h}`);
    assertEqual(m.svg.querySelectorAll('g[data-box]').length, 1);
    unmount(m);
  });
});

suite('Histogram type — series path: editor', () => {
  function openEditor(cfg) {
    const m = mount(cfg);
    m.chart._buildEditor();
    return { ...m, inner: m.chart._editorInner };
  }
  test('Display section toggles Pareto and boxplot and reports the change', () => {
    let calls = 0;
    const m = openEditor({ series: [s('A', A)], binWidth: 1, onEditorChange: () => { calls++; } });
    const sec = m.inner.querySelector('[data-ed-section="display"]');
    const [pareto, strip] = sec.querySelectorAll('input[type="checkbox"]');
    pareto.checked = true; pareto.dispatchEvent(new Event('change', { bubbles: true }));
    strip.checked = true; strip.dispatchEvent(new Event('change', { bubbles: true }));
    assertEqual(m.chart.config.pareto, true);
    assertEqual(m.chart.config.boxplotStrip, true);
    assertTrue(calls >= 2);
    unmount(m);
  });
  test('bar gap number reports the change through onEditorChange', () => {
    let calls = 0;
    const m = openEditor({ series: [s('A', A)], binWidth: 1, onEditorChange: () => { calls++; } });
    const num = m.inner.querySelector('[data-ed-section="display"] input[type="number"]');
    num.value = '3'; num.dispatchEvent(new Event('change', { bubbles: true }));
    assertEqual(m.chart.config.barGap, 3);
    assertEqual(calls, 1);
    unmount(m);
  });
  test('legacy Binning section is not shown in series mode', () => {
    const m = openEditor({ series: [s('A', A)] });
    const titles = [...m.inner.querySelectorAll('.dmike-chart-ed-section-title')].map(el => el.textContent);
    assertTrue(titles.includes('display'), titles.join('|'));
    assertTrue(!titles.some(x => /Klassen|binning|normalCurve/i.test(x)), titles.join('|'));
    unmount(m);
  });
  test('per-series pattern select writes the series and re-renders', () => {
    const m = openEditor({ series: [s('A', A), s('B', B)], binWidth: 1 });
    const item = m.chart._seriesItemEls[1];
    const sel = item.querySelector('select[data-ed="pattern"]');
    sel.value = 'x'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    assertEqual(m.chart.config.series[1].pattern, 'x');
    assertTrue(!!m.svg.querySelector('rect[data-pattern][data-series="1"]'));
    unmount(m);
  });
  test('per-series border style select writes the series', () => {
    const m = openEditor({ series: [s('A', A)], binWidth: 1 });
    const sel = m.chart._seriesItemEls[0].querySelector('select[data-ed="borderStyle"]');
    sel.value = 'dash'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    assertEqual(m.chart.config.series[0].borderStyle, 'dash');
    unmount(m);
  });
  test('per-series normal curve checkbox', () => {
    const m = openEditor({ series: [s('A', A)], binWidth: 1 });
    const box = m.chart._seriesItemEls[0].querySelector('input[type="checkbox"][data-ed="normal"]');
    box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true }));
    assertEqual(m.chart.config.series[0].showNormalCurve, false);
    assertEqual(m.svg.querySelectorAll('path[data-normal]').length, 0);
    unmount(m);
  });
});

/**
 * D.Mike — ChartBase: config.onEditorChange fires after each editor edit.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import ChartBase from '../../../js/core/chart/chart-base.js';

class TwoSeries extends ChartBase {
  _getDataExtent() { return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 }; }
  _getLegendItems() { return [{ type: 'rect', color: 'red', label: 'A' }]; }
  _getSeriesDescriptors() {
    const s = this.config.s;
    return [{
      index: 0, getName: () => s.name, setName: (v) => { s.name = v; },
      getColor: () => 'red', setColor: () => {},
      isVisible: () => s.visible, setVisible: (v) => { s.visible = v; },
    }];
  }
  _buildTypeEditor(inner, _t, _onUpdate, onChange) {
    const b = document.createElement('button');
    b.dataset.test = 'type-change';
    b.addEventListener('click', () => { this.config.flag = true; onChange(); });
    inner.appendChild(b);
  }
}

function mount(cfg) {
  const host = document.createElement('div');
  host.style.width = '700px';
  host.style.height = '400px';
  document.body.appendChild(host);
  const chart = new TwoSeries(host, cfg, { language: 'de' });
  chart.render();
  chart._editorOpen = true;
  chart._buildEditor();
  return { host, chart, inner: chart._editorInner };
}

suite('ChartBase — onEditorChange', () => {
  test('fires after a checkbox edit, with the chart as argument', () => {
    let calls = 0; let arg = null;
    const m = mount({ s: { name: 'A', visible: true }, onEditorChange: (c) => { calls++; arg = c; } });
    const box = m.inner.querySelector('input[type="checkbox"]');
    box.checked = !box.checked;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    assertTrue(calls >= 1, 'callback ran');
    assertEqual(arg, m.chart);
    m.chart.destroy(); m.host.remove();
  });
  test('fires after a series visibility toggle (onUpdate path)', () => {
    let calls = 0;
    const m = mount({ s: { name: 'A', visible: true }, onEditorChange: () => { calls++; } });
    m.inner.querySelector('.dmike-chart-ed-series-header button').click();
    assertEqual(m.chart.config.s.visible, false);
    assertTrue(calls >= 1);
    m.chart.destroy(); m.host.remove();
  });
  test('fires after a series rename', () => {
    let calls = 0;
    const m = mount({ s: { name: 'A', visible: true }, onEditorChange: () => { calls++; } });
    const inp = m.inner.querySelector('.dmike-chart-ed-series-header input');
    inp.value = 'B';
    inp.dispatchEvent(new Event('change'));
    assertEqual(m.chart.config.s.name, 'B');
    assertEqual(calls, 1);
    m.chart.destroy(); m.host.remove();
  });
  test('type editor onChange notifies without rebuilding the editor', () => {
    let calls = 0;
    const m = mount({ s: { name: 'A', visible: true }, onEditorChange: () => { calls++; } });
    const btn = m.inner.querySelector('[data-test="type-change"]');
    btn.click();
    assertEqual(calls, 1);
    assertTrue(btn.isConnected, 'editor not rebuilt');
    m.chart.destroy(); m.host.remove();
  });
  test('no callback → edits still work, nothing throws', () => {
    const m = mount({ s: { name: 'A', visible: true } });
    m.inner.querySelector('[data-test="type-change"]').click();
    assertEqual(m.chart.config.flag, true);
    m.chart.destroy(); m.host.remove();
  });
  test('refreshEditor: after update() with new objects an edit reaches the new config', () => {
    let calls = 0;
    const m = mount({ s: { name: 'A', visible: true }, onEditorChange: () => { calls++; } });
    const fresh = { name: 'A', visible: true };
    m.chart.update({ s: fresh });
    m.chart.refreshEditor();
    const inp = m.inner.querySelector('.dmike-chart-ed-series-header input');
    inp.value = 'Z';
    inp.dispatchEvent(new Event('change'));
    assertEqual(fresh.name, 'Z');
    assertEqual(m.chart.config.s.name, 'Z');
    assertTrue(calls >= 1);
    m.chart.destroy(); m.host.remove();
  });
  test('refreshEditor: does nothing while the editor is closed', () => {
    const m = mount({ s: { name: 'A', visible: true } });
    m.chart._editorOpen = false;
    const before = m.inner.firstChild;
    m.chart.refreshEditor();
    assertEqual(m.inner.firstChild, before);
    m.chart.destroy(); m.host.remove();
  });
});

/** The range input of the slider row whose label reads `label`. */
function slider(inner, label) {
  const row = [...inner.querySelectorAll('.dmike-slider-row')]
    .find((r) => r.querySelector('.dmike-slider-row__label')?.textContent === label);
  return row.querySelector('input[type="range"]');
}

suite('ChartBase — editor changes reach _onEditorChange', () => {
  test('a title font size edit reports via _onEditorChange', () => {
    const m = mount({ s: { name: 'A', visible: true } });
    let calls = 0;
    m.chart._onEditorChange = (c) => { calls++; assertEqual(c, m.chart); };
    const inp = slider(m.inner, 'titleFontSize');
    inp.value = '22';
    inp.dispatchEvent(new Event('input'));
    assertEqual(m.chart.config.titleSize, 22);
    assertEqual(calls, 1);
    m.chart.destroy(); m.host.remove();
  });
  test('a background colour edit reports via _onEditorChange', () => {
    const m = mount({ s: { name: 'A', visible: true } });
    let calls = 0;
    m.chart._onEditorChange = () => { calls++; };
    const pairs = [...m.inner.querySelectorAll('.dmike-chart-ed-color-pair')]
      .filter((r) => r.querySelector('label')?.textContent === 'bgColorLabel');
    pairs[0].querySelector('.dmike-chart-ed-color-swatch').click();
    const hex = document.querySelector('.dmike-chart-ed-cp-hex-input');
    hex.value = '#112233';
    hex.dispatchEvent(new Event('input'));
    document.querySelector('.dmike-chart-ed-cp-overlay')?.click();
    assertTrue(String(m.chart.config.bgColor).includes('17'), 'bgColor set');
    assertTrue(calls >= 1, 'reported');
    m.chart.destroy(); m.host.remove();
  });
  test('editorKeys of the base class hold the base list', () => {
    assertDeepEqual(ChartBase.editorKeys, [
      'title', 'showTitle', 'xLabel', 'yLabel', 'showXLabel', 'showYLabel',
      'showLegend', 'titleSize', 'labelSize', 'tickSize', 'showXTicks', 'showYTicks',
      'bgColor', 'refLines', 'refAreas',
    ]);
  });
});

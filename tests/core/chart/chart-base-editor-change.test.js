/**
 * D.Mike — ChartBase: config.onEditorChange fires after each editor edit.
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
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
});

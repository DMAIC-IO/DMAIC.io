/**
 * D.Mike — ChartBase: module reference lines/areas (config.moduleRefLines /
 * config.moduleRefAreas). Computed by the module on every render, drawn and
 * listed in the legend together with the editor lines (refLines/refAreas),
 * but never shown in the editor and never an editor key.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import ChartBase from '../../../js/core/chart/chart-base.js';

class Plain extends ChartBase {
  _getDataExtent() { return { xMin: 0, xMax: 10, yMin: 0, yMax: 10 }; }
  _getLegendItems() { return []; }
}

function mount(cfg = {}) {
  const host = document.createElement('div');
  host.style.width = '700px';
  host.style.height = '400px';
  document.body.appendChild(host);
  const chart = new Plain(host, {
    moduleRefLines: [{ dir: 'h', value: 50, label: 'USL', color: 'red' }],
    moduleRefAreas: [{ dir: 'y', min: 1, max: 2, label: 'Zone', color: 'gray' }],
    refLines: [{ dir: 'h', value: 5, label: 'Mine', color: 'green' }],
    ...cfg,
  }, { language: 'de' });
  chart.render();
  return { host, chart };
}

const lineLabels = (m) => [...m.host.querySelectorAll('[data-ref="line"]')].map(el => el.getAttribute('data-ref-label'));
const done = (m) => { m.chart.destroy(); m.host.remove(); };

suite('ChartBase — module reference lines', () => {
  test('module keys are not editor keys; editor keys still are', () => {
    assertTrue(!ChartBase.editorKeys.includes('moduleRefLines'));
    assertTrue(!ChartBase.editorKeys.includes('moduleRefAreas'));
    assertTrue(ChartBase.editorKeys.includes('refLines'));
    assertTrue(ChartBase.editorKeys.includes('refAreas'));
  });

  test('module lines and editor lines are both drawn, module lines first', () => {
    const m = mount();
    assertDeepEqual(lineLabels(m), ['USL', 'Mine']);
    done(m);
  });

  test('module lines widen the axis range like editor lines', () => {
    const m = mount();
    const b = m.chart._getAxisBounds();
    assertTrue(b.yMax >= 50, `yMax ${b.yMax} should include USL 50`);
    done(m);
  });

  test('legend lists module lines and areas', () => {
    const m = mount();
    const keys = m.chart._legendEntries().map(e => e.key);
    assertDeepEqual(keys, ['l:USL', 'l:Mine', 'a:Zone']);
    done(m);
  });

  test('editor shows only the editor lines', () => {
    const m = mount();
    m.chart._editorOpen = true;
    m.chart._buildEditor();
    const names = [...m.chart._editorInner.querySelectorAll('.dmike-chart-ed-ref-item .name')].map(el => el.textContent);
    assertDeepEqual(names, ['Mine']);
    done(m);
  });

  test('update replaces the module lines and keeps the editor lines', () => {
    const m = mount();
    m.chart.update({ moduleRefLines: [{ dir: 'h', value: 7, label: 'USL2' }] });
    assertDeepEqual(lineLabels(m), ['USL2', 'Mine']);
    assertEqual(m.chart.config.refLines.length, 1);
    done(m);
  });
});

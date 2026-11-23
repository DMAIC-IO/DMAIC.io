/**
 * D.Mike — ChartBase: legend order (config.legendOrder) and its editor section.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import ChartBase from '../../../js/core/chart/chart-base.js';

class TwoItems extends ChartBase {
  _getDataExtent() { return { xMin: 0, xMax: 10, yMin: 0, yMax: 10 }; }
  _getLegendItems() {
    return [{ type: 'rect', color: 'red', label: 'A' }, { type: 'rect', color: 'blue', label: 'B' }];
  }
}

function mount(cfg = {}) {
  const host = document.createElement('div');
  host.style.width = '700px';
  host.style.height = '400px';
  document.body.appendChild(host);
  const chart = new TwoItems(host, {
    refLines: [{ dir: 'h', value: 5, label: 'Limit', color: 'green' }],
    refAreas: [{ dir: 'y', min: 1, max: 2, label: 'Zone', color: 'gray' }],
    ...cfg,
  }, { language: 'de' });
  chart.render();
  chart._editorOpen = true;
  chart._buildEditor();
  return { host, chart, inner: chart._editorInner };
}

const legendTexts = (m) => [...m.host.querySelectorAll('[data-legend-item]')].map(el => el.textContent);
const orderSection = (m) => m.inner.querySelector('[data-ed-section="legendOrder"]');
const rows = (m) => [...orderSection(m).querySelectorAll('.dmike-chart-ed-legend-row')];
const done = (m) => { m.chart.destroy(); m.host.remove(); };

suite('ChartBase — legend order', () => {
  test('legendOrder is an editor key (persisted per instance)', () => {
    assertTrue(ChartBase.editorKeys.includes('legendOrder'));
  });

  test('default order: chart items, then reference lines, then areas', () => {
    const m = mount();
    assertDeepEqual(legendTexts(m), ['A', 'B', 'Limit', 'Zone']);
    done(m);
  });

  test('config.legendOrder rearranges the legend across groups', () => {
    const m = mount({ legendOrder: ['a:Zone', 's:B', 'l:Limit', 's:A'] });
    assertDeepEqual(legendTexts(m), ['Zone', 'B', 'Limit', 'A']);
    done(m);
  });

  test('entries missing from legendOrder follow at the end in default order', () => {
    const m = mount({ legendOrder: ['l:Limit', 'gone'] });
    assertDeepEqual(legendTexts(m), ['Limit', 'A', 'B', 'Zone']);
    done(m);
  });

  test('two entries with the same label keep distinct keys', () => {
    const m = mount({ refLines: [{ dir: 'h', value: 1, label: 'L' }, { dir: 'h', value: 2, label: 'L' }], refAreas: [] });
    const keys = m.chart._legendEntries().map(e => e.key);
    assertEqual(new Set(keys).size, keys.length);
    done(m);
  });

  test('the editor lists every legend entry in the current order', () => {
    const m = mount({ legendOrder: ['l:Limit'] });
    assertDeepEqual(rows(m).map(r => r.textContent.trim()), ['Limit', 'A', 'B', 'Zone']);
    done(m);
  });

  test('the move-down button reorders, re-renders and notifies', () => {
    let calls = 0;
    const m = mount({ onEditorChange: () => { calls++; } });
    rows(m)[0].querySelector('[data-move="down"]').click();
    assertDeepEqual(m.chart.config.legendOrder, ['s:B', 's:A', 'l:Limit', 'a:Zone']);
    assertDeepEqual(legendTexts(m), ['B', 'A', 'Limit', 'Zone']);
    assertTrue(calls >= 1, 'onEditorChange ran');
    done(m);
  });

  test('the first row cannot move up, the last cannot move down', () => {
    const m = mount();
    const r = rows(m);
    assertTrue(r[0].querySelector('[data-move="up"]').disabled);
    assertTrue(r[r.length - 1].querySelector('[data-move="down"]').disabled);
    done(m);
  });

  test('dragging a row onto another moves it there', () => {
    const m = mount();
    const r = rows(m);
    r[3].dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
    r[0].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
    r[0].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
    assertDeepEqual(legendTexts(m), ['Zone', 'A', 'B', 'Limit']);
    done(m);
  });

  test('an unlabelled area shows the translated default, its key ignores the language', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const i18n = { t: (k) => (k === 'chart.editor.refAreaDefault' ? 'Area' : k) };
    const chart = new TwoItems(host, { refAreas: [{ dir: 'y', min: 1, max: 2, color: 'gray' }] }, { i18n, language: 'en' });
    const area = chart._legendEntries().find(e => e.type === 'rect' && e.key.startsWith('a:'));
    assertEqual(area.label, 'Area');
    assertEqual(area.key, 'a:');
    chart.destroy();
    host.remove();
  });

  test('no order section for a legend with fewer than two entries', () => {
    class One extends TwoItems { _getLegendItems() { return [{ type: 'rect', color: 'red', label: 'A' }]; } }
    const host = document.createElement('div');
    document.body.appendChild(host);
    const chart = new One(host, {}, { language: 'de' });
    chart.render();
    chart._editorOpen = true;
    chart._buildEditor();
    assertEqual(chart._editorInner.querySelector('[data-ed-section="legendOrder"]'), null);
    chart.destroy(); host.remove();
  });
});

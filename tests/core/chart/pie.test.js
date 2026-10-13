/**
 * D.Mike — Pie chart type — Editor Tests
 *
 * The chart editor reports user edits through `_onLabelEdit(key, value)`,
 * which the instance chart manager stores per chart (dashboard tiles keep
 * `showLegend` that way). The pie type builds its own editor, so its legend
 * checkbox has to report like chart-base's does.
 */

import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import PieChart from '../../../js/core/chart/types/pie.js';

/** Mount a pie chart in a sized, attached container; force a render. */
function mount() {
  const host = document.createElement('div');
  host.style.width = '600px';
  host.style.height = '300px';
  document.body.appendChild(host);
  const chart = new PieChart(host, {
    slices: [{ label: 'A', value: 2 }, { label: 'B', value: 3 }],
  }, { language: 'de' });
  chart.render();
  return { host, chart };
}

suite('Pie type — editor', () => {
  test('legend checkbox reports the edit via _onLabelEdit', () => {
    const { host, chart } = mount();
    const edits = [];
    chart._onLabelEdit = (key, value) => edits.push([key, value]);
    chart._buildEditor();

    const box = chart._editorInner.querySelector('input[type="checkbox"][data-key="showLegend"]');
    box.checked = false;
    box.dispatchEvent(new Event('change'));

    assertEqual(chart.config.showLegend, false);
    assertDeepEqual(edits, [['showLegend', false]]);
    chart.destroy();
    host.remove();
  });
});

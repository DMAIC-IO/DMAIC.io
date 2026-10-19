/**
 * D.Mike — Scatter chart type — per-point labels
 *
 * A series may carry `labels`: one text per point, drawn next to the marker
 * and used as the tooltip heading.
 */

import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import ScatterChart from '../../../js/core/chart/types/scatter.js';

/** Mount a scatter chart in a sized, attached container; force a render. */
function mount(series) {
  const host = document.createElement('div');
  host.style.width = '600px';
  host.style.height = '300px';
  document.body.appendChild(host);
  const chart = new ScatterChart(host, { series, xMin: 0, xMax: 10, yMin: 0, yMax: 10 }, { language: 'de' });
  chart.render();
  return { host, chart };
}

suite('Scatter type — point labels', () => {
  test('draws one label per non-empty entry', () => {
    const { host, chart } = mount([{ name: 'S', x: [1, 2], y: [3, 4], labels: ['Hebel', ''] }]);
    const texts = [...host.querySelectorAll('.chart-point-label')].map((t) => t.textContent);
    assertDeepEqual(texts, ['Hebel']);
    chart.destroy();
    host.remove();
  });

  test('a label in the right half sits left of its marker', () => {
    const { host, chart } = mount([{ name: 'S', x: [1, 9], y: [5, 5], labels: ['links', 'rechts'] }]);
    const [lo, hi] = [...host.querySelectorAll('.chart-point-label')];
    assertEqual(lo.getAttribute('text-anchor'), 'start');
    assertEqual(hi.getAttribute('text-anchor'), 'end');
    chart.destroy();
    host.remove();
  });

  test('a series without labels draws none', () => {
    const { host, chart } = mount([{ name: 'S', x: [1, 2], y: [3, 4] }]);
    assertEqual(host.querySelectorAll('.chart-point-label').length, 0);
    chart.destroy();
    host.remove();
  });

  test('the tooltip heads a labelled point with its label', () => {
    const { host, chart } = mount([{ name: 'S', x: [1, 2], y: [3, 4], labels: ['Hebel', ''] }]);
    const [hit] = chart._findNearby(1, 3, 5);
    assertEqual(hit.node.querySelector('b').textContent, 'Hebel');
    chart.destroy();
    host.remove();
  });
});

/**
 * D.Mike — Gage run chart type — hover geometry tests.
 *
 * ChartBase._onMouseMove places the hover highlight ring directly at the
 * `px`/`py` that `_findNearby` returns, so both must be pixel coordinates.
 */

import { suite, test, assertEqual, assertTrue, assertAlmostEqual } from '../../test-utils.js';
import GageRunChartType from '../../../js/core/chart/types/gage-run-chart.js';

/** Two parts × two appraisers × two repeats. */
function fixtureConfig() {
  const series = (operator, values) => ({
    operator, values, mean: (values[0] + values[1]) / 2,
  });
  return {
    panels: [
      { part: 'P1', series: [series('A', [10, 12]), series('B', [20, 22])] },
      { part: 'P2', series: [series('A', [11, 13]), series('B', [21, 23])] },
    ],
    operators: ['A', 'B'],
    refValue: 16,
    sharedYMin: 10,
    sharedYMax: 23,
    showTitle: false,
    showLegend: false,
  };
}

/** Mount the chart in a sized, attached container and render it. */
function mount(cfg) {
  const host = document.createElement('div');
  host.style.width = '900px';
  host.style.height = '320px';
  document.body.appendChild(host);
  const chart = new GageRunChartType(host, cfg, { language: 'de' });
  chart.render();
  return { host, chart };
}

suite('Gage run chart type — hover', () => {
  test('_findNearby returns pixel-space px/py for the hover ring, not data-space values', () => {
    const { host, chart } = mount(fixtureConfig());
    const pa = chart._plotArea;
    const panelW = pa.w / 2;
    const slots = chart._layoutPanel(chart.config.panels[0], pa.x, panelW);
    const slot = slots.find(s => s.operator === 'B' && s.repeat === 0);
    const expectedPx = slot.x;
    const expectedPy = chart._yScale(slot.value);

    // Query at the slot's own pixel position so this point is unambiguously the nearest.
    const near = chart._findNearby(chart._xScaleInv(slot.x), slot.value, 1e9);
    assertEqual(near.length, 1);
    const [pt] = near;

    assertAlmostEqual(pt.px, expectedPx, 0.01, 'px must be the slot pixel x-coordinate');
    assertAlmostEqual(pt.py, expectedPy, 0.01, 'py must be the y-scaled pixel coordinate');
    assertTrue(pt.px >= pa.x && pt.px <= pa.x + pa.w, 'px must lie inside the plot area');
    assertTrue(pt.py >= pa.y && pt.py <= pa.y + pa.h, 'py must lie inside the plot area');
    host.remove();
  });
});

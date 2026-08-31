/**
 * D.Mike — Multi-Vari chart type — structure and geometry tests.
 *
 * Renders one strip into a detached, sized container and asserts what the SVG
 * must contain. The point positions matter as much as the counts: the module
 * stacks several instances of this type and they only line up if the panel
 * geometry comes from `plotArea`, not from the niced x scale.
 */

import { suite, test, assertEqual, assertTrue, assertAlmostEqual } from '../../test-utils.js';
import MultiVariChartType from '../../../js/core/chart/types/multi-vari.js';

/** Two panels × two axis levels × two series × two repeats. */
function fixtureConfig(extra) {
  const group = (level, a, b) => ({
    level,
    mean: (a[0] + a[1] + b[0] + b[1]) / 4,
    series: [
      { level: '1', values: a, mean: (a[0] + a[1]) / 2 },
      { level: '2', values: b, mean: (b[0] + b[1]) / 2 },
    ],
  });
  return Object.assign({
    panels: [
      { panelLevel: 'N1', groups: [group('F', [10, 12], [20, 22]), group('S', [30, 32], [40, 42])] },
      { panelLevel: 'N2', groups: [group('F', [11, 13], [21, 23]), group('S', [31, 33], [41, 43])] },
    ],
    seriesLevels: ['1', '2'],
    rowLabel: 'C1',
    refValue: 26,
    refLabel: 'Gesamtmittel',
    sharedYMin: 10,
    sharedYMax: 43,
    showTitle: false,
    showLegend: false,
  }, extra);
}

/** Mount the chart in a sized, attached container and render it. */
function mount(cfg) {
  const host = document.createElement('div');
  host.style.width = '900px';
  host.style.height = '320px';
  document.body.appendChild(host);
  const chart = new MultiVariChartType(host, cfg, { language: 'de' });
  chart.render();
  return { host, chart, svg: host.querySelector('svg') };
}

/** All rendered data points (markers carry the class the type sets). */
function points(svg) {
  return Array.from(svg.querySelectorAll('[data-mv-point]'));
}

suite('Multi-Vari type — structure', () => {
  test('draws one marker per single measurement', () => {
    const { host, svg } = mount(fixtureConfig());
    assertEqual(points(svg).length, 16);
    host.remove();
  });

  test('showPoints=false leaves the measurements out', () => {
    const { host, svg } = mount(fixtureConfig({ showPoints: false }));
    assertEqual(points(svg).length, 0);
    host.remove();
  });

  test('draws the panel label band with one label per panel', () => {
    const { host, svg } = mount(fixtureConfig());
    const labels = Array.from(svg.querySelectorAll('[data-mv-panel-label]'))
      .map(el => el.textContent);
    assertEqual(labels.join('|'), 'N1|N2');
    host.remove();
  });

  test('draws the row label of the strip', () => {
    const { host, svg } = mount(fixtureConfig());
    assertEqual(svg.querySelector('[data-mv-row-label]').textContent, 'C1');
    host.remove();
  });

  test('omits the row label when the strip has none', () => {
    const { host, svg } = mount(fixtureConfig({ rowLabel: '' }));
    assertEqual(svg.querySelector('[data-mv-row-label]'), null);
    host.remove();
  });

  test('draws one reference line when refValue is finite', () => {
    const { host, svg } = mount(fixtureConfig());
    assertEqual(svg.querySelectorAll('[data-mv-ref]').length, 1);
    host.remove();
  });

  test('refValue=null hides the reference line', () => {
    const { host, svg } = mount(fixtureConfig({ refValue: null }));
    assertEqual(svg.querySelectorAll('[data-mv-ref]').length, 0);
    host.remove();
  });

  test('connectMeans draws one mean path per series and panel', () => {
    const { host, svg } = mount(fixtureConfig());
    assertEqual(svg.querySelectorAll('[data-mv-mean-line]').length, 4);
    host.remove();
  });

  test('connectMeans=false drops the mean paths', () => {
    const { host, svg } = mount(fixtureConfig({ connectMeans: false }));
    assertEqual(svg.querySelectorAll('[data-mv-mean-line]').length, 0);
    host.remove();
  });

  test('showGroupMean draws one tick per axis level and panel', () => {
    const { host, svg } = mount(fixtureConfig());
    assertEqual(svg.querySelectorAll('[data-mv-group-mean]').length, 4);
    host.remove();
  });

  test('legend items follow seriesLevels', () => {
    const { host, chart } = mount(fixtureConfig());
    assertEqual(chart._getLegendItems().map(i => i.label).join('|'), '1|2');
    host.remove();
  });
});

suite('Multi-Vari type — geometry', () => {
  test('series of one axis level sit symmetrically around the slot centre', () => {
    const { host, svg, chart } = mount(fixtureConfig());
    const pa = chart._plotArea;
    const panelW = pa.w / 2;
    const slotW = panelW / 2;
    const centre = pa.x + slotW / 2;              // panel 0, axis level 0
    const xs = points(svg)
      .filter(p => p.getAttribute('data-mv-point') === '0|F|1'
        || p.getAttribute('data-mv-point') === '0|F|2')
      .map(p => Number(p.getAttribute('data-mv-x')));
    const spread = 0.6 * slotW;
    assertAlmostEqual(Math.min(...xs), centre - spread / 2, 0.6);
    assertAlmostEqual(Math.max(...xs), centre + spread / 2, 0.6);
    host.remove();
  });

  test('the last panel reaches the right edge of the plot area', () => {
    const { host, svg, chart } = mount(fixtureConfig());
    const pa = chart._plotArea;
    const xs = points(svg).map(p => Number(p.getAttribute('data-mv-x')));
    assertTrue(Math.max(...xs) < pa.x + pa.w, 'points stay inside the plot area');
    assertTrue(Math.max(...xs) > pa.x + pa.w * 0.75, 'the last panel is not left short');
    host.remove();
  });

  test('the shared y-domain is honoured', () => {
    const { host, chart } = mount(fixtureConfig());
    const ext = chart._getDataExtent();
    assertEqual(ext.yMin, 10);
    assertEqual(ext.yMax, 43);
    host.remove();
  });

  test('a reference line outside the value range widens the y-domain', () => {
    const { host, chart } = mount(fixtureConfig({ sharedYMin: null, sharedYMax: null, refValue: 100 }));
    assertEqual(chart._getDataExtent().yMax, 100);
    host.remove();
  });
});

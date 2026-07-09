/**
 * D.Mike — Trend chart type — Structure + Geometry-parity Tests
 *
 * Renders the framework `trend` type into a detached, sized container and
 * asserts the produced SVG structure for a fixed config:
 *   - one polyline <path> per visible series
 *   - N halo dots + N coloured dots + N value labels per series
 *   - 10 horizontal y-grid lines (integers 0..9)
 *   - one vertical grid line per state (xCount)
 *   - hidden series are skipped
 *
 * Plus GEOMETRY-PARITY guards (like gantt/cost): the type must draw with LOCAL
 * scales pinned to the raw extents, NOT the framework's niced primary scales, so
 * the first state lands on the plot-left, the last on the plot-right, y=9 on the
 * plot-top and y=0 on the plot-bottom (±1.5px).
 */

import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import TrendChart from '../../../js/core/chart/types/trend.js';

/** Build a fixed, DOM-free trend config (mirrors computeTrendConfig output). */
function fixtureConfig(extra) {
  return Object.assign({
    isEmpty: false,
    series: [
      { sid: 'a', name: 'Hyp A', color: '#2563eb', visible: true, points: [{ x: 0, y: 2 }, { x: 1, y: 5 }, { x: 2, y: 9 }] },
      { sid: 'b', name: 'Hyp B', color: '#dc2626', visible: true, points: [{ x: 0, y: 0 }, { x: 1, y: 3 }, { x: 2, y: 6 }] },
    ],
    xLabels: [
      { date: '01.01.', name: 'S1' },
      { date: '02.01.', name: 'S2' },
      { date: '03.01.', name: 'S3' },
    ],
    xCount: 3,
    yDomain: [0, 9],
    layout: { padT: 30, padR: 30, padB: 55, padL: 45 },
  }, extra);
}

/** Mount a Trend chart in a sized, attached container; force a render. */
function mount(cfg) {
  const host = document.createElement('div');
  host.style.width = '800px';
  host.style.height = '340px';
  document.body.appendChild(host);
  const chart = new TrendChart(host, cfg, { language: 'de' });
  chart.render();
  return { host, chart, svg: host.querySelector('svg') };
}

/** Series polylines: paths with stroke-width 2.5. */
function polylines(svg) {
  return Array.from(svg.querySelectorAll('path')).filter(
    (p) => p.getAttribute('stroke-width') === '2.5',
  );
}

suite('Trend type — structure', () => {
  test('renders one polyline per visible series', () => {
    const { chart, svg } = mount(fixtureConfig());
    assertEqual(polylines(svg).length, 2);
    chart.destroy();
  });

  test('renders halo + coloured dots and value labels per point', () => {
    const { chart, svg } = mount(fixtureConfig());
    const circles = Array.from(svg.querySelectorAll('circle'));
    // 2 series × 3 points × 2 dots (halo + colour) = 12 dots. Legend adds
    // 1 circle per series (2). So filter dots by r=4.5 (halo) and r=3 (colour).
    const halos = circles.filter((c) => c.getAttribute('r') === '4.5');
    const cores = circles.filter((c) => c.getAttribute('r') === '3');
    assertEqual(halos.length, 6, '6 halo dots');
    assertEqual(cores.length, 6, '6 coloured dots');
    // Bold value labels: 6 points → 6 labels.
    const valLabels = Array.from(svg.querySelectorAll('text')).filter(
      (t) => t.getAttribute('font-weight') === 'bold',
    );
    assertEqual(valLabels.length, 6, '6 value labels');
    chart.destroy();
  });

  test('renders 10 horizontal y-grid lines (integers 0..9)', () => {
    const { chart, svg } = mount(fixtureConfig());
    // Horizontal grid lines: y1 == y2 and the grid colour.
    const hLines = Array.from(svg.querySelectorAll('line')).filter(
      (l) => l.getAttribute('y1') === l.getAttribute('y2') && l.getAttribute('stroke') === 'rgba(128,128,128,0.15)',
    );
    assertEqual(hLines.length, 10);
    chart.destroy();
  });

  test('renders one vertical grid line per state', () => {
    const { chart, svg } = mount(fixtureConfig());
    const vLines = Array.from(svg.querySelectorAll('line')).filter(
      (l) => l.getAttribute('x1') === l.getAttribute('x2') && l.getAttribute('stroke') === 'rgba(128,128,128,0.15)',
    );
    assertEqual(vLines.length, 3);
    chart.destroy();
  });

  test('skips hidden series (visible:false)', () => {
    const cfg = fixtureConfig();
    cfg.series[1].visible = false;
    const { chart, svg } = mount(cfg);
    assertEqual(polylines(svg).length, 1, 'only the visible series draws a polyline');
    chart.destroy();
  });

  test('has no framework legend items', () => {
    const { chart } = mount(fixtureConfig());
    assertEqual(chart._getLegendItems().length, 0);
    chart.destroy();
  });

  test('exposes per-series descriptors for the editor (visibility toggle)', () => {
    const { chart } = mount(fixtureConfig());
    const d = chart._getSeriesDescriptors();
    assertEqual(d.length, 2);
    assertTrue(d[0].isVisible(), 'series 0 visible');
    d[0].setVisible(false);
    assertTrue(!d[0].isVisible(), 'series 0 toggled hidden');
    chart.destroy();
  });

  test('_findNearby returns the nearest point row within proximity', () => {
    const { chart } = mount(fixtureConfig());
    // The point (x=2,y=9) is at the top-right; query its data coords.
    const near = chart._findNearby(2, 9, 20);
    assertEqual(near.length, 1);
    assertTrue(near[0].node.textContent.includes('Hyp A'), 'tooltip names the series');
    chart.destroy();
  });
});

// ── Geometry parity (regression guard) ──────────────────────────────────
// The framework's primary x/yScale are built from generateTicks-NICED bounds, so
// trusting them shifts/compresses the data. The type must draw with LOCAL scales
// pinned to the raw extents so the first state sits on the plot-left, the last on
// the plot-right, y=9 on the plot-top and y=0 on the plot-bottom.
suite('Trend type — geometry parity', () => {
  /** Coloured dot centres in draw order (r=3). */
  function cores(svg) {
    return Array.from(svg.querySelectorAll('circle'))
      .filter((c) => c.getAttribute('r') === '3')
      .map((c) => ({ cx: parseFloat(c.getAttribute('cx')), cy: parseFloat(c.getAttribute('cy')) }));
  }

  test('first state x ≈ plot-left, last state x ≈ plot-right', () => {
    const { chart, svg } = mount(fixtureConfig());
    const pa = chart._plotArea;
    const cs = cores(svg);
    const minX = Math.min(...cs.map((c) => c.cx));
    const maxX = Math.max(...cs.map((c) => c.cx));
    assertTrue(Math.abs(minX - pa.x) <= 1.5, `first state x ${minX.toFixed(2)} ≈ plot-left ${pa.x} (±1.5px)`);
    assertTrue(Math.abs(maxX - (pa.x + pa.w)) <= 1.5, `last state x ${maxX.toFixed(2)} ≈ plot-right ${pa.x + pa.w} (±1.5px)`);
    chart.destroy();
  });

  test('y=9 ≈ plot-top, y=0 ≈ plot-bottom', () => {
    const { chart, svg } = mount(fixtureConfig());
    const pa = chart._plotArea;
    const cs = cores(svg);
    // Series A has a point at y=9 (top) and series B at y=0 (bottom).
    const minY = Math.min(...cs.map((c) => c.cy)); // highest score → smallest y
    const maxY = Math.max(...cs.map((c) => c.cy)); // lowest score → largest y
    assertTrue(Math.abs(minY - pa.y) <= 1.5, `y=9 ${minY.toFixed(2)} ≈ plot-top ${pa.y} (±1.5px)`);
    assertTrue(Math.abs(maxY - (pa.y + pa.h)) <= 1.5, `y=0 ${maxY.toFixed(2)} ≈ plot-bottom ${pa.y + pa.h} (±1.5px)`);
    chart.destroy();
  });

  test('first vertical grid line sits at the plot-left edge', () => {
    const { chart, svg } = mount(fixtureConfig());
    const pa = chart._plotArea;
    const vXs = Array.from(svg.querySelectorAll('line'))
      .filter((l) => l.getAttribute('x1') === l.getAttribute('x2') && l.getAttribute('stroke') === 'rgba(128,128,128,0.15)')
      .map((l) => parseFloat(l.getAttribute('x1')));
    const minVx = Math.min(...vXs);
    assertTrue(Math.abs(minVx - pa.x) <= 1.5, `first vertical line x ${minVx.toFixed(2)} ≈ plot-left ${pa.x} (±1.5px)`);
    chart.destroy();
  });
});

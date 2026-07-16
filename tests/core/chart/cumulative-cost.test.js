/**
 * D.Mike — Cumulative-Cost chart type — Structure Tests
 *
 * Renders the framework `cumulative-cost` type into a detached, sized container
 * and asserts the produced SVG node structure for a small fixed config:
 *   - exactly two <path>s: solid money (#16a34a) + dashed hours (#2563eb 4,2)
 *   - the right-axis (hours) labels present (blue, start-anchored)
 *   - the left-axis (money) labels present (green, end-anchored)
 *   - a baseline line + one tick line/label per supplied tick
 *   - the dashed today line when showToday is set
 *   - correct per-mode unit strings appear in the axis labels
 *   - no legend items via the framework (_getLegendItems → [])
 *   - no tooltip (_findNearby → [])
 *
 * The chart renders on requestAnimationFrame + needs a non-zero layout box, so
 * the container is sized and attached; we force a synchronous render().
 */

import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import CumulativeCost from '../../../js/core/chart/types/cumulative-cost.js';

const DAY = 86400000;
const ms = (s) => new Date(s + 'T00:00:00').getTime();

/** Build a fixed, DOM-free cost config (mirrors computeCostConfig output). */
function fixtureConfig(mode, extra) {
  const min = ms('2020-01-01');
  const max = ms('2020-01-05');
  const cumulative = {
    moneyPts: [
      { t: min, v: 0 }, { t: min + DAY, v: 100 }, { t: min + 2 * DAY, v: 200 },
      { t: min + 3 * DAY, v: 300 }, { t: min + 4 * DAY, v: 400 },
    ],
    hoursPts: [
      { t: min, v: 0 }, { t: min + DAY, v: 2 }, { t: min + 2 * DAY, v: 4 },
      { t: min + 3 * DAY, v: 6 }, { t: min + 4 * DAY, v: 8 },
    ],
    peakMoney: 400, peakHours: 8,
    moneyUnit: '€', hoursUnit: 'h',
  };
  const rate = {
    moneyPts: [
      { t: min, v: 100 }, { t: min + DAY, v: 100 },
      { t: min + DAY, v: 100 }, { t: min + 2 * DAY, v: 100 },
    ],
    hoursPts: [
      { t: min, v: 2 }, { t: min + DAY, v: 2 },
      { t: min + DAY, v: 2 }, { t: min + 2 * DAY, v: 2 },
    ],
    peakMoney: 100, peakHours: 2,
    moneyUnit: '€/d', hoursUnit: 'h/d',
  };
  const series = mode === 'rate' ? rate : cumulative;
  return Object.assign({
    isEmpty: false,
    mode: mode || 'cumulative',
    xDomain: { min, max },
    span: max - min,
    ticks: [min, min + 2 * DAY, min + 4 * DAY],
    tickLabels: ['01.01', '03.01', '05.01'],
    stepDays: 1,
    now: ms('2020-01-03'),
    showToday: true,
    lang: 'de',
    moneyLabel: 'Geld',
    hoursLabel: 'Stunden',
    layout: { labelW: 220, padL: 8, padR: 48, padT: 16, padB: 28, innerH: 140 },
  }, series, extra);
}

/** Mount a CumulativeCost chart in a sized, attached container; force render. */
function mount(cfg) {
  const host = document.createElement('div');
  host.style.width = '900px';
  host.style.height = '200px';
  document.body.appendChild(host);
  const chart = new CumulativeCost(host, cfg, { language: 'de' });
  chart.render();
  return { host, chart, svg: host.querySelector('svg') };
}

suite('Cumulative-Cost type — structure', () => {
  test('renders exactly two series paths: solid money + dashed hours', () => {
    const { chart, svg } = mount(fixtureConfig('cumulative'));
    const paths = Array.from(svg.querySelectorAll('path'));
    assertEqual(paths.length, 2);
    const money = paths.find((p) => p.getAttribute('stroke') === '#16a34a');
    const hours = paths.find((p) => p.getAttribute('stroke') === '#2563eb');
    assertTrue(!!money, 'money path present');
    assertTrue(!!hours, 'hours path present');
    assertEqual(money.getAttribute('stroke-dasharray'), null);
    assertEqual(hours.getAttribute('stroke-dasharray'), '4,2');
    chart.destroy();
  });

  test('renders the right (hours) axis labels start-anchored in blue', () => {
    const { chart, svg } = mount(fixtureConfig('cumulative'));
    const blue = Array.from(svg.querySelectorAll('text')).filter(
      (t) => t.getAttribute('fill') === '#2563eb' && t.getAttribute('text-anchor') === 'start',
    );
    // top label (peak + unit) and bottom "0"
    assertEqual(blue.length, 2);
    assertTrue(blue.some((t) => t.textContent === '0'), 'right axis zero');
    assertTrue(blue.some((t) => /h$/.test(t.textContent)), 'right axis hours unit');
    chart.destroy();
  });

  test('renders the left (money) axis labels end-anchored in green', () => {
    const { chart, svg } = mount(fixtureConfig('cumulative'));
    const green = Array.from(svg.querySelectorAll('text')).filter(
      (t) => t.getAttribute('fill') === '#16a34a' && t.getAttribute('text-anchor') === 'end',
    );
    assertEqual(green.length, 2);
    assertTrue(green.some((t) => /€$/.test(t.textContent)), 'left axis money unit');
    chart.destroy();
  });

  test('renders a baseline + one tick line/label per supplied tick', () => {
    const { chart, svg } = mount(fixtureConfig('cumulative'));
    const tickLabels = Array.from(svg.querySelectorAll('text'))
      .map((t) => t.textContent)
      .filter((t) => /^\d{2}\.\d{2}$/.test(t));
    assertEqual(tickLabels.length, 3);
    chart.destroy();
  });

  test('renders the dashed today line when showToday is set', () => {
    const { chart, svg } = mount(fixtureConfig('cumulative'));
    const dashed = Array.from(svg.querySelectorAll('line')).filter(
      (l) => l.getAttribute('stroke-dasharray') === '3,3',
    );
    assertEqual(dashed.length, 1);
    chart.destroy();
  });

  test('rate mode uses €/d and h/d unit strings', () => {
    const { chart, svg } = mount(fixtureConfig('rate'));
    const texts = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent);
    assertTrue(texts.some((t) => /€\/d$/.test(t)), 'money rate unit');
    assertTrue(texts.some((t) => /h\/d$/.test(t)), 'hours rate unit');
    chart.destroy();
  });

  test('pins the time domain (no auto-padding) and money y-domain', () => {
    const cfg = fixtureConfig('cumulative');
    const { chart } = mount(cfg);
    const ext = chart._getDataExtent();
    assertEqual(ext.xMin, cfg.xDomain.min);
    assertEqual(ext.xMax, cfg.xDomain.max);
    assertEqual(ext.yMin, 0);
    assertEqual(ext.yMax, cfg.peakMoney);
    chart.destroy();
  });

  test('has no framework legend items and no tooltip', () => {
    const { chart } = mount(fixtureConfig('cumulative'));
    assertEqual(chart._getLegendItems().length, 0);
    assertEqual(chart._findNearby(0, 0, 12).length, 0);
    chart.destroy();
  });
});

// ── Geometry parity (regression guard) ──────────────────────────────────
// The framework's primary xScale/yScale are NICED (generateTicks), so trusting
// them shifts the money path off the hand-drawn axis labels:
//   x: left edge +~52px;  y(money 0): -26px (16.7% of plot height).
// The type must draw money + x with LOCAL scales pinned to the raw extents so
// the curve lands exactly on its 0/peak/left/right references. (Top-level suite
// — the lightweight runner does not support nesting suites inside suites.)
suite('Cumulative-Cost type — geometry parity', () => {
  /** Parse an "Mx,y Lx,y …" path d into [{x,y}] points. */
  function pathPoints(d) {
    return d.split(/(?=[ML])/).map((seg) => {
      const [x, y] = seg.slice(1).split(',').map(parseFloat);
      return { x, y };
    });
  }
  function pathByStroke(svg, stroke) {
    const p = Array.from(svg.querySelectorAll('path')).find((el) => el.getAttribute('stroke') === stroke);
    return pathPoints(p.getAttribute('d'));
  }

  test('money path spans the full plot width and height (0→baseline, peak→top)', () => {
    const cfg = fixtureConfig('cumulative');
    const { chart, svg } = mount(cfg);
    const pa = chart._plotArea;
    const pts = pathByStroke(svg, '#16a34a');
    const first = pts[0];
    const last = pts[pts.length - 1];
    // x: first point (minT) at plot-left, last point (maxT) at plot-right.
    assertTrue(Math.abs(first.x - pa.x) <= 1.5, `money first x ${first.x.toFixed(2)} ≈ left ${pa.x}`);
    assertTrue(Math.abs(last.x - (pa.x + pa.w)) <= 1.5, `money last x ${last.x.toFixed(2)} ≈ right ${pa.x + pa.w}`);
    // y: value 0 at the baseline (plot-bottom), peak at the top.
    assertTrue(Math.abs(first.y - (pa.y + pa.h)) <= 1.5, `money 0 y ${first.y.toFixed(2)} ≈ baseline ${pa.y + pa.h}`);
    assertTrue(Math.abs(last.y - pa.y) <= 1.5, `money peak y ${last.y.toFixed(2)} ≈ top ${pa.y}`);
    chart.destroy();
  });

  test('hours path spans the full plot width and height (0→baseline, peak→top)', () => {
    const cfg = fixtureConfig('cumulative');
    const { chart, svg } = mount(cfg);
    const pa = chart._plotArea;
    const pts = pathByStroke(svg, '#2563eb');
    const first = pts[0];
    const last = pts[pts.length - 1];
    assertTrue(Math.abs(first.x - pa.x) <= 1.5, `hours first x ${first.x.toFixed(2)} ≈ left ${pa.x}`);
    assertTrue(Math.abs(last.x - (pa.x + pa.w)) <= 1.5, `hours last x ${last.x.toFixed(2)} ≈ right ${pa.x + pa.w}`);
    assertTrue(Math.abs(first.y - (pa.y + pa.h)) <= 1.5, `hours 0 y ${first.y.toFixed(2)} ≈ baseline ${pa.y + pa.h}`);
    assertTrue(Math.abs(last.y - pa.y) <= 1.5, `hours peak y ${last.y.toFixed(2)} ≈ top ${pa.y}`);
    chart.destroy();
  });

  test('right-axis peak (hours unit) label sits at the plot top', () => {
    const cfg = fixtureConfig('cumulative');
    const { chart, svg } = mount(cfg);
    const pa = chart._plotArea;
    // The peak hours label is blue, start-anchored, ends with the hours unit.
    const peakLbl = Array.from(svg.querySelectorAll('text')).find(
      (t) => t.getAttribute('fill') === '#2563eb'
        && t.getAttribute('text-anchor') === 'start'
        && /h$/.test(t.textContent),
    );
    assertTrue(!!peakLbl, 'peak hours label present');
    const y = parseFloat(peakLbl.getAttribute('y'));
    // Label baseline sits a few px below the plot top (y = pa.y + 4).
    assertTrue(Math.abs(y - (pa.y + 4)) <= 2, `peak label y ${y.toFixed(2)} ≈ plot top ${pa.y + 4}`);
    chart.destroy();
  });
});

/**
 * D.Mike — Gantt chart type — Structure Tests
 *
 * Renders the framework `gantt` type into a detached container and asserts the
 * produced SVG node structure for a small fixed config:
 *   - N task-bar <rect>s with the expected fill colours
 *   - N row-label <text>s (left gutter)
 *   - one tick line + tick label per supplied tick
 *   - the dashed "today" line when showToday is set
 *   - no legend items
 *
 * The chart renders on requestAnimationFrame + needs a non-zero layout box, so
 * the container is sized and attached to the document; we force a synchronous
 * render() after attaching rather than waiting for the rAF.
 */

import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import GanttChart from '../../../js/core/chart/types/gantt.js';

const DAY = 86400000;
const ms = (s) => new Date(s + 'T00:00:00').getTime();

/** Build a fixed, DOM-free gantt config (mirrors computeGanttConfig output). */
function fixtureConfig(extra) {
  const minT = ms('2020-01-01');
  const maxT = ms('2020-01-15');
  return Object.assign({
    isEmpty: false,
    tasks: [
      { start: ms('2020-01-01'), end: ms('2020-01-05'), label: 'Alpha', status: 'done', color: '#16a34a', responsible: 'AA', startDate: '2020-01-01', endDate: '2020-01-05' },
      { start: ms('2020-01-03'), end: ms('2020-01-10'), label: 'Beta', status: 'running', color: '#2563eb', responsible: '', startDate: '2020-01-03', endDate: '2020-01-10' },
      { start: ms('2020-01-08'), end: ms('2020-01-15'), label: 'Gamma', status: 'planned', color: '#94a3b8', responsible: 'CC', startDate: '2020-01-08', endDate: '2020-01-15' },
    ],
    xDomain: { minT, maxT },
    ticks: [minT, minT + 7 * DAY, minT + 14 * DAY],
    tickLabels: ['01.01', '08.01', '15.01'],
    stepDays: 1,
    now: ms('2020-01-06'),
    showToday: true,
    todayLabel: 'Heute',
    clientWidth: 900,
    layout: { labelW: 220, padL: 8, padR: 16, padT: 30, padB: 24, rowH: 26 },
  }, extra);
}

/** Mount a Gantt chart in a sized, attached container; force a render. */
function mount(cfg) {
  const host = document.createElement('div');
  host.style.width = '900px';
  host.style.height = '300px';
  document.body.appendChild(host);
  const chart = new GanttChart(host, cfg, { language: 'de' });
  chart.render();
  return { host, chart, svg: host.querySelector('svg') };
}

suite('Gantt type — structure', () => {
  test('renders one <rect> bar per task with the status colours', () => {
    const { chart, svg } = mount(fixtureConfig());
    // Bars live in the clipped plot group; identify them by rx=3 + opacity.
    const bars = Array.from(svg.querySelectorAll('rect')).filter(
      (r) => r.getAttribute('rx') === '3' && r.getAttribute('opacity') === '0.85',
    );
    assertEqual(bars.length, 3);
    assertEqual(bars[0].getAttribute('fill'), '#16a34a');
    assertEqual(bars[1].getAttribute('fill'), '#2563eb');
    assertEqual(bars[2].getAttribute('fill'), '#94a3b8');
    chart.destroy();
  });

  test('renders one row-label <text> per task (end-anchored, gutter)', () => {
    const { chart, svg } = mount(fixtureConfig());
    const labels = Array.from(svg.querySelectorAll('text')).filter(
      (t) => t.getAttribute('text-anchor') === 'end',
    );
    const texts = labels.map((t) => t.textContent);
    assertTrue(texts.includes('Alpha'), 'Alpha label present');
    assertTrue(texts.includes('Beta'), 'Beta label present');
    assertTrue(texts.includes('Gamma'), 'Gamma label present');
    chart.destroy();
  });

  test('renders one tick line + label per supplied tick', () => {
    const { chart, svg } = mount(fixtureConfig());
    const tickLabels = Array.from(svg.querySelectorAll('text'))
      .map((t) => t.textContent)
      .filter((t) => /^\d{2}\.\d{2}$/.test(t));
    assertEqual(tickLabels.length, 3);
    chart.destroy();
  });

  test('renders the dashed today line when showToday is set', () => {
    const { chart, svg } = mount(fixtureConfig());
    const dashed = Array.from(svg.querySelectorAll('line')).filter(
      (l) => l.getAttribute('stroke-dasharray') === '3,3',
    );
    assertEqual(dashed.length, 1);
    const heute = Array.from(svg.querySelectorAll('text')).some((t) => t.textContent === 'Heute');
    assertTrue(heute, 'today label rendered');
    chart.destroy();
  });

  test('omits the today line when showToday is false', () => {
    const { chart, svg } = mount(fixtureConfig({ showToday: false }));
    const dashed = Array.from(svg.querySelectorAll('line')).filter(
      (l) => l.getAttribute('stroke-dasharray') === '3,3',
    );
    assertEqual(dashed.length, 0);
    chart.destroy();
  });

  test('has no legend items', () => {
    const { chart } = mount(fixtureConfig());
    assertEqual(chart._getLegendItems().length, 0);
    chart.destroy();
  });

  test('pins the time domain (no auto-padding)', () => {
    const cfg = fixtureConfig();
    const { chart } = mount(cfg);
    const ext = chart._getDataExtent();
    assertEqual(ext.xMin, cfg.xDomain.minT);
    assertEqual(ext.xMax, cfg.xDomain.maxT);
    chart.destroy();
  });
});

// ── Geometry parity (regression guard) ──────────────────────────────────
// The framework's primary xScale is built from generateTicks-NICED bounds, so
// trusting it shifts/compresses the bars (left edge +~16px, right edge -~74px ≈
// 11% of plot width for this fixture). The type must draw with a LOCAL x scale
// pinned to the raw [minT,maxT]→[pa.x,pa.x+pa.w] so the earliest bar's x1 sits
// on the plot-left and the latest bar's x2 on the plot-right — matching the
// legacy bespoke geometry. (Top-level suite — the lightweight runner does not
// support nesting suites inside suites.)
suite('Gantt type — geometry parity', () => {
  /** Bars in draw order (rx=3, opacity 0.85), with x/width attributes. */
  function bars(svg) {
    return Array.from(svg.querySelectorAll('rect'))
      .filter((r) => r.getAttribute('rx') === '3' && r.getAttribute('opacity') === '0.85')
      .map((r) => ({
        x: parseFloat(r.getAttribute('x')),
        w: parseFloat(r.getAttribute('width')),
      }));
  }

  test('earliest bar starts at the plot-left edge', () => {
    const cfg = fixtureConfig();
    const { chart, svg } = mount(cfg);
    const pa = chart._plotArea;
    const bs = bars(svg);
    // Alpha starts at minT → x1 must equal the plot-left edge.
    const earliest = Math.min(...bs.map((b) => b.x));
    assertTrue(
      Math.abs(earliest - pa.x) <= 1.5,
      `earliest bar x1 ${earliest.toFixed(2)} ≈ plot-left ${pa.x} (±1.5px)`,
    );
    chart.destroy();
  });

  test('latest bar ends at the plot-right edge', () => {
    const cfg = fixtureConfig();
    const { chart, svg } = mount(cfg);
    const pa = chart._plotArea;
    const bs = bars(svg);
    // Gamma ends at maxT → x2 (= x + width) must equal the plot-right edge.
    const latest = Math.max(...bs.map((b) => b.x + b.w));
    assertTrue(
      Math.abs(latest - (pa.x + pa.w)) <= 1.5,
      `latest bar x2 ${latest.toFixed(2)} ≈ plot-right ${pa.x + pa.w} (±1.5px)`,
    );
    chart.destroy();
  });

  test('first date tick line sits at the plot-left edge', () => {
    const cfg = fixtureConfig();
    const { chart, svg } = mount(cfg);
    const pa = chart._plotArea;
    // The first tick (minT) line: vertical line whose x1==x2 nearest plot-left.
    const tickXs = Array.from(svg.querySelectorAll('line'))
      .filter((l) => l.getAttribute('x1') === l.getAttribute('x2'))
      .map((l) => parseFloat(l.getAttribute('x1')))
      .filter((x) => Number.isFinite(x));
    const minTickX = Math.min(...tickXs);
    assertTrue(
      Math.abs(minTickX - pa.x) <= 1.5,
      `first tick x ${minTickX.toFixed(2)} ≈ plot-left ${pa.x} (±1.5px)`,
    );
    chart.destroy();
  });
});

// ── Tooltip XSS escaping (security guard) ────────────────────────────────
// label + responsible are USER INPUT placed into the tooltip. ChartBase now
// renders the tooltip from DOM NODES (no innerHTML), so `_findNearby` returns a
// `node` whose user text is set via textContent — escaping is structural. A task
// titled `<img src=x onerror=…>` must therefore appear as inert literal text and
// must NOT create an <img> element.
suite('Gantt type — tooltip escaping', () => {
  test('renders the task label as inert text (no <img> element)', () => {
    const cfg = fixtureConfig({
      tasks: [
        {
          start: ms('2020-01-01'), end: ms('2020-01-05'),
          label: '<img src=x onerror=alert(1)>', status: 'done', color: '#16a34a',
          responsible: 'AA', startDate: '2020-01-01', endDate: '2020-01-05',
        },
      ],
    });
    const { chart } = mount(cfg);
    // Huge proximity → the (single) nearest bar always matches; _findNearby
    // returns the tooltip row whose node embeds the user-supplied label.
    const rows = chart._findNearby(0, 0, 1e9);
    assertEqual(rows.length, 1);
    const node = rows[0].node;
    assertTrue(node.querySelector('img') === null, 'no <img> element created from the label');
    assertTrue(node.textContent.indexOf('<img') !== -1, 'label rendered as inert literal text');
    chart.destroy();
  });

  test('renders the responsible field as inert text (no injected element)', () => {
    const cfg = fixtureConfig({
      tasks: [
        {
          start: ms('2020-01-01'), end: ms('2020-01-05'),
          label: 'Alpha', status: 'done', color: '#16a34a',
          responsible: '<b>boss</b>', startDate: '2020-01-01', endDate: '2020-01-05',
        },
      ],
    });
    const { chart } = mount(cfg);
    const rows = chart._findNearby(0, 0, 1e9);
    assertEqual(rows.length, 1);
    const node = rows[0].node;
    assertTrue(node.textContent.indexOf('<b>boss</b>') !== -1, 'responsible rendered as inert literal text');
    const injectedBold = [...node.querySelectorAll('b')].some(b => b.textContent === 'boss');
    assertTrue(!injectedBold, 'responsible was not parsed into a <b> element');
    chart.destroy();
  });
});

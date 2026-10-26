/**
 * D.Mike — Interval-stack chart type — Structure + Geometry Tests
 *
 * Renders the framework `interval-stack` type into a sized container and
 * asserts the SVG: one horizontal segment per interval (newest row on top),
 * a vertical reference line at its value, the miss modifier class instead of
 * inline colours, clipping to `xDomain`, two segments per row in compare mode
 * and an axis-only render for empty rows.
 */

import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import IntervalStackChart from '../../../js/core/chart/types/interval-stack.js';

/** Build a config with the given rows on the 494…506 domain. */
function fixtureConfig(rows, extra) {
  return Object.assign({
    xDomain: [494, 506],
    xLabel: 'Füllmenge (g)',
    reference: { value: 500, label: 'μ = 500' },
    rows,
  }, extra);
}

/** Mount the chart in a sized, attached container; force a render. */
function mount(cfg) {
  const host = document.createElement('div');
  host.style.width = '800px';
  host.style.height = '340px';
  document.body.appendChild(host);
  const chart = new IntervalStackChart(host, cfg, { language: 'de' });
  chart.render();
  return { host, chart, svg: host.querySelector('svg') };
}

/** Drawn interval segments in draw order. */
function segments(svg) {
  return Array.from(svg.querySelectorAll('.chart-interval__segment'));
}

const num = (el, attr) => parseFloat(el.getAttribute(attr));

suite('Interval-stack type — structure', () => {
  test('one segment per interval', () => {
    const rows = [499, 500, 501].map((m) => ({ segments: [{ lo: m - 1, hi: m + 1, hit: true }] }));
    const { chart, host, svg } = mount(fixtureConfig(rows));
    const segs = segments(svg);
    assertEqual(segs.length, 3);
    const ys = segs.map((s) => num(s, 'y1'));
    assertEqual(ys[0], Math.min(...ys), 'rows[0] (newest) is drawn on top');
    chart.destroy(); host.remove();
  });

  test('reference line at its value', () => {
    const { chart, host, svg } = mount(fixtureConfig([{ segments: [{ lo: 499, hi: 501, hit: true }] }]));
    const pa = chart._plotArea;
    const ref = svg.querySelector('.chart-interval__reference');
    assertTrue(!!ref, 'reference line drawn');
    const expected = pa.x + (500 - 494) / 12 * pa.w;
    assertTrue(Math.abs(num(ref, 'x1') - expected) <= 1.5, `x ${num(ref, 'x1')} ≈ ${expected}`);
    assertEqual(num(ref, 'x1'), num(ref, 'x2'), 'vertical');
    assertTrue(svg.textContent.includes('μ = 500'), 'reference label present');
    chart.destroy(); host.remove();
  });

  test('misses carry the miss class', () => {
    const rows = [
      { segments: [{ lo: 501, hi: 503, hit: false }] },
      { segments: [{ lo: 499, hi: 501, hit: true }] },
    ];
    const { chart, host, svg } = mount(fixtureConfig(rows));
    const segs = segments(svg);
    assertTrue(segs[0].classList.contains('chart-interval__segment--miss'), 'miss has modifier');
    assertTrue(!segs[1].classList.contains('chart-interval__segment--miss'), 'hit has none');
    segs.forEach((s) => assertTrue(!/^#/.test(s.getAttribute('stroke') || ''), 'no inline hex stroke'));
    chart.destroy(); host.remove();
  });

  test('segments outside the domain are clipped', () => {
    const { chart, host, svg } = mount(fixtureConfig([{ segments: [{ lo: 490, hi: 510, hit: true }] }]));
    const pa = chart._plotArea;
    const seg = segments(svg)[0];
    assertTrue(Math.abs(num(seg, 'x1') - pa.x) <= 1.5, 'x1 at plot-left');
    assertTrue(Math.abs(num(seg, 'x2') - (pa.x + pa.w)) <= 1.5, 'x2 at plot-right');
    chart.destroy(); host.remove();
  });

  test('two segments per row in compare mode', () => {
    const row = () => ({ segments: [
      { lo: 499, hi: 501, hit: true, kind: 'z' },
      { lo: 498.5, hi: 501.5, hit: true, kind: 't' },
    ] });
    const { chart, host, svg } = mount(fixtureConfig([row(), row()], {
      legend: [{ kind: 'z', label: '1,96 · s' }, { kind: 't', label: 't · s' }],
    }));
    const segs = segments(svg);
    assertEqual(segs.length, 4);
    assertEqual(segs.filter((s) => s.classList.contains('chart-interval__segment--z')).length, 2);
    assertEqual(segs.filter((s) => s.classList.contains('chart-interval__segment--t')).length, 2);
    assertTrue(num(segs[0], 'y1') !== num(segs[1], 'y1'), 'the two kinds sit on separate lines');
    assertTrue(svg.textContent.includes('t · s'), 'legend label drawn');
    chart.destroy(); host.remove();
  });

  test('empty rows render the axis only', () => {
    const { chart, host, svg } = mount(fixtureConfig([]));
    assertEqual(segments(svg).length, 0);
    assertTrue(svg.textContent.includes('Füllmenge (g)'), 'axis label drawn');
    assertTrue(!!svg.querySelector('.chart-interval__reference'), 'reference line drawn');
    chart.destroy(); host.remove();
  });
});

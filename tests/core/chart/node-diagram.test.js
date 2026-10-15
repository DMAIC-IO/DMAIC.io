/**
 * D.Mike — node-diagram chart type
 *
 * Boxes and connecting links at positions the caller computed. Checked:
 * geometry (viewBox for fit/zero, link endpoints), links-only overlays,
 * theme colours without hex literals, highlight class, robustness.
 */

import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import NodeDiagram, { contentBox, linkEndpoints } from '../../../js/core/chart/types/node-diagram.js';
import ChartManager from '../../../js/core/chart/chart-manager.js';

const A = { id: 'a', x: 40, y: 30, w: 100, h: 50, lines: [{ text: 'Alpha' }] };
const B = { id: 'b', x: 200, y: 120, w: 100, h: 40, lines: [{ text: 'Beta', muted: true }] };

function mount(config) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const chart = new NodeDiagram(host, Object.assign({ showModebar: false }, config), { language: 'de' });
  chart.render();
  return { host, chart, svg: host.querySelector('svg'), done: () => { chart.destroy(); host.remove(); } };
}

const paths = (svg) => Array.from(svg.querySelectorAll('path[data-part="link"]'));

/** Run fn with theme tokens overridden on <html>, then restore them. */
function withTokens(tokens, fn) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(tokens)) root.style.setProperty(k, v);
  try { return fn(); } finally { for (const k of Object.keys(tokens)) root.style.removeProperty(k); }
}

suite('node-diagram — geometry', () => {
  test('fit: box is the bounding box plus padding', () => {
    assertDeepEqual(contentBox({ nodes: [A, B], links: [], padding: 20, origin: 'fit' }),
      { x: 20, y: 10, w: 300, h: 170 });
  });

  test('zero: box starts at (0, 0) and spans to the far edge plus padding', () => {
    assertDeepEqual(contentBox({ nodes: [A, B], links: [], padding: 20, origin: 'zero' }),
      { x: 0, y: 0, w: 320, h: 180 });
  });

  test('empty diagram has a 0×0 box and renders without error', () => {
    assertDeepEqual(contentBox({ nodes: [], links: [], padding: 20, origin: 'fit' }), { x: 0, y: 0, w: 0, h: 0 });
    const { svg, done } = mount({ nodes: [], links: [] });
    assertEqual(svg.getAttribute('viewBox'), '0 0 0 0');
    assertEqual(svg.querySelector('.chart-render-error'), null);
    done();
  });

  test('fit renders a 0-based viewBox and translates the content', () => {
    const { svg, chart, done } = mount({ nodes: [A, B], links: [] });
    assertEqual(svg.getAttribute('viewBox'), '0 0 300 170');
    assertEqual(svg.getAttribute('width'), '300');
    assertEqual(svg.getAttribute('height'), '170');
    assertEqual(svg.querySelector('g[data-part="content"]').getAttribute('transform'), 'translate(-20 -10)');
    assertDeepEqual(chart._getSize(), { w: 300, h: 170 }, 'PNG export sizes from content');
    done();
  });

  test('fit keeps nodes at negative coordinates inside the image', () => {
    const left = { ...A, id: 'l', x: -80, y: -40 };
    const box = contentBox({ nodes: [left, B], links: [], padding: 20, origin: 'fit' });
    assertDeepEqual(box, { x: -100, y: -60, w: 420, h: 240 });
    const { svg, done } = mount({ nodes: [left, B], links: [] });
    assertEqual(svg.querySelector('g[data-part="content"]').getAttribute('transform'), 'translate(100 60)');
    done();
  });

  test('elbow endpoints: inset left of the child, parent bottom to child middle', () => {
    const byId = new Map([[A.id, A], [B.id, B]]);
    assertDeepEqual(linkEndpoints({ from: 'a', to: 'b', shape: 'elbow' }, byId, 18),
      { x1: 182, y1: 80, x2: 200, y2: 140 });
    const { svg, done } = mount({ nodes: [A, B], links: [{ from: 'a', to: 'b', shape: 'elbow' }] });
    assertEqual(paths(svg)[0].getAttribute('d'), 'M 182 80 L 182 140 L 200 140');
    done();
  });

  test('curve endpoints: parent bottom-centre to child top-centre', () => {
    const { svg, done } = mount({ nodes: [A, B], links: [{ from: 'a', to: 'b', shape: 'curve' }] });
    assertEqual(paths(svg)[0].getAttribute('d'), 'M 90 80 C 90 100, 250 100, 250 120');
    done();
  });

  test('explicit endpoints win over the derived ones', () => {
    const link = { from: 'a', to: 'b', shape: 'curve', x1: 0, y1: 0, x2: 10, y2: 20 };
    assertDeepEqual(linkEndpoints(link, new Map([[A.id, A], [B.id, B]]), 18), { x1: 0, y1: 0, x2: 10, y2: 20 });
  });
});

suite('node-diagram — links-only overlay', () => {
  test('renders one path per link without nodes', () => {
    const { svg, done } = mount({
      nodes: [], origin: 'zero', padding: 0,
      links: [
        { from: 'a', to: 'b', shape: 'curve', x1: 10, y1: 10, x2: 50, y2: 60 },
        { from: 'a', to: 'c', shape: 'curve', x1: 10, y1: 10, x2: 90, y2: 60 },
      ],
    });
    assertEqual(paths(svg).length, 2);
    assertEqual(svg.querySelectorAll('rect[data-part="node"]').length, 0);
    assertEqual(svg.getAttribute('viewBox'), '0 0 90 60');
    done();
  });

  test('a link without nodes and without endpoints is skipped', () => {
    const { svg, done } = mount({ nodes: [], links: [{ from: 'x', to: 'y', shape: 'elbow' }] });
    assertEqual(paths(svg).length, 0);
    assertEqual(svg.querySelector('.chart-render-error'), null);
    done();
  });

  test('links with negative endpoints render', () => {
    const { svg, done } = mount({
      nodes: [], origin: 'zero', padding: 0,
      links: [{ from: 'a', to: 'b', shape: 'curve', x1: -30, y1: 10, x2: 40, y2: 60 }],
    });
    assertEqual(paths(svg).length, 1);
    done();
  });

  test('highlighted links carry highlightClass, others do not', () => {
    const { svg, done } = mount({
      nodes: [], origin: 'zero', padding: 0, highlightClass: 'pc__org-line--hl',
      links: [
        { from: 'a', to: 'b', shape: 'curve', x1: 0, y1: 0, x2: 10, y2: 10, highlight: true },
        { from: 'a', to: 'c', shape: 'curve', x1: 0, y1: 0, x2: 20, y2: 10 },
      ],
    });
    const [hl, plain] = paths(svg);
    assertTrue(hl.classList.contains('pc__org-line--hl'), 'highlighted');
    assertTrue(!plain.classList.contains('pc__org-line--hl'), 'plain');
    done();
  });
});

suite('node-diagram — colours and text', () => {
  test('unset colours come from theme tokens; serialised SVG has no hex literal', () => {
    withTokens({
      '--color-text-primary': 'rgb(1, 2, 3)',
      '--color-text-secondary': 'rgb(4, 5, 6)',
      '--color-border-secondary': 'rgb(7, 8, 9)',
      '--color-bg-secondary': 'rgb(10, 11, 12)',
      '--color-border-primary': 'rgb(13, 14, 15)',
      '--color-text-inverse': 'rgb(16, 17, 18)',
    }, () => {
      const badged = { ...A, badge: { text: 'VOC', color: 'rgba(230,126,34,1)' } };
      const { svg, done } = mount({ nodes: [badged, B], links: [{ from: 'a', to: 'b', shape: 'elbow' }] });
      const rect = svg.querySelector('rect[data-part="node"]');
      assertEqual(rect.getAttribute('fill'), 'rgb(10, 11, 12)');
      assertEqual(rect.getAttribute('stroke'), 'rgb(7, 8, 9)');
      assertEqual(paths(svg)[0].getAttribute('stroke'), 'rgb(13, 14, 15)');
      const texts = Array.from(svg.querySelectorAll('text[data-part="line"]'));
      assertEqual(texts[0].getAttribute('fill'), 'rgb(1, 2, 3)', 'primary line');
      assertEqual(texts[1].getAttribute('fill'), 'rgb(4, 5, 6)', 'muted line');
      assertEqual(svg.querySelector('text[data-part="badge-text"]').getAttribute('fill'), 'rgb(16, 17, 18)');
      const xml = new XMLSerializer().serializeToString(svg);
      assertTrue(!/#[0-9a-fA-F]{3,8}\b/.test(xml), 'no hex literal');
      done();
    });
  });

  test('caller colours as var(--…) and hex are applied resolved', () => {
    withTokens({ '--test-node-fill': 'rgb(20, 30, 40)' }, () => {
      const n = { ...A, fill: 'var(--test-node-fill)', stroke: '#ff0000' };
      const { svg, done } = mount({ nodes: [n], links: [] });
      const rect = svg.querySelector('rect[data-part="node"]');
      assertEqual(rect.getAttribute('fill'), 'rgb(20, 30, 40)');
      assertEqual(rect.getAttribute('stroke'), '#ff0000');
      done();
    });
  });

  test('line sizes default to labelSize / tickSize; explicit size and weight win', () => {
    const n = { ...A, lines: [{ text: 'a' }, { text: 'b', muted: true }, { text: 'c', size: 13, weight: 600 }] };
    const { svg, done } = mount({ nodes: [n], links: [], labelSize: 12, tickSize: 11 });
    const [a, b, c] = Array.from(svg.querySelectorAll('text[data-part="line"]'));
    assertEqual(a.getAttribute('font-size'), '12');
    assertEqual(b.getAttribute('font-size'), '11');
    assertEqual(c.getAttribute('font-size'), '13');
    assertEqual(c.getAttribute('font-weight'), '600');
    assertEqual(a.getAttribute('font-weight'), null);
    done();
  });

  test('text baselines: badge pushes lines down; padX/padY/lineHeight are honoured', () => {
    const badged = { ...A, badge: { text: 'VOC', color: 'rgb(0, 0, 0)' } };
    const { svg, done } = mount({ nodes: [badged], links: [] });
    // padY 6 + badge 14 + gap 4 + lineHeight 16 - 4 → y + 36
    assertEqual(svg.querySelector('text[data-part="line"]').getAttribute('y'), String(A.y + 36));
    done();
    const org = { ...A, padX: 12, padY: 8, lineHeight: 18, lines: [{ text: 't' }, { text: 'd' }] };
    const m = mount({ nodes: [org], links: [] });
    const [t, d] = Array.from(m.svg.querySelectorAll('text[data-part="line"]'));
    assertEqual(t.getAttribute('y'), String(A.y + 22));
    assertEqual(d.getAttribute('y'), String(A.y + 40));
    assertEqual(t.getAttribute('x'), String(A.x + 12));
    m.done();
  });

  test('special characters stay verbatim and the SVG stays well-formed', () => {
    const n = { ...A, lines: [{ text: 'R&D <Team>' }, { text: '„Zitat“ & "quotes"' }] };
    const { svg, done } = mount({ nodes: [n], links: [] });
    const xml = new XMLSerializer().serializeToString(svg);
    const doc = new DOMParser().parseFromString(xml, 'image/svg+xml');
    assertEqual(doc.querySelector('parsererror'), null, 'well-formed');
    const texts = Array.from(doc.querySelectorAll('text')).map((t) => t.textContent);
    assertTrue(texts.includes('R&D <Team>'), 'first line');
    assertTrue(texts.includes('„Zitat“ & "quotes"'), 'second line');
    done();
  });

  test('a theme change re-renders with the new token values', async () => {
    const handlers = {};
    const bus = { on: (e, f) => { handlers[e] = f; } };
    const manager = new ChartManager(bus, { language: 'de', t: (k) => k });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = document.documentElement;
    root.style.setProperty('--color-text-primary', 'rgb(1, 2, 3)');
    try {
      const chart = await manager.create(host, 'node-diagram', { showModebar: false, nodes: [A], links: [] });
      chart.render();
      root.style.setProperty('--color-text-primary', 'rgb(9, 9, 9)');
      handlers['theme:changed']();
      assertEqual(host.querySelector('text[data-part="line"]').getAttribute('fill'), 'rgb(9, 9, 9)');
      manager.destroy(chart);
    } finally {
      root.style.removeProperty('--color-text-primary');
      host.remove();
    }
  });
});

suite('node-diagram — lifecycle', () => {
  test('render after destroy (late rAF) is a silent no-op', () => {
    const { chart, host } = mount({ nodes: [A], links: [] });
    chart.destroy();
    host.remove();
    const original = console.error;
    let errors = 0;
    console.error = () => { errors++; };
    try { chart.render(); } finally { console.error = original; }
    assertEqual(errors, 0);
  });

  test('30-link update stays within one frame budget', () => {
    const links = Array.from({ length: 30 }, (_, i) => ({
      from: `p${i}`, to: `c${i}`, shape: 'curve', x1: i * 10, y1: 0, x2: i * 10 + 40, y2: 80, highlight: i === 3,
    }));
    const { chart, done } = mount({ nodes: [], links, origin: 'zero', padding: 0, highlightClass: 'hl' });
    const runs = 50;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) chart.update({ links });
    const avg = (performance.now() - t0) / runs;
    console.info(`[node-diagram] 30-link update: ${avg.toFixed(2)} ms`);
    assertTrue(avg < 16, `avg ${avg.toFixed(2)} ms per update`);
    done();
  });
});

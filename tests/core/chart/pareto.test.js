/**
 * D.Mike — Pareto chart type — cumulative line and "other" bucket
 *
 * Findings A-010 / B1-016: when more categories exist than `maxItems`, the
 * cumulative % must still refer to the grand total of all categories (as in
 * Minitab), and the "other" bucket label comes from i18n, not a hardcoded
 * German default.
 */

import { suite, test, assertEqual, assertAlmostEqual } from '../../test-utils.js';
import ParetoChart from '../../../js/core/chart/types/pareto.js';

/** 30 flat items 100, 99, …, 71 — grand total 2565. */
const flatItems = () => Array.from({ length: 30 }, (_, i) => ({ name: `X${i + 1}`, value: 100 - i }));

function mount(cfg, context = { language: 'de' }) {
  const host = document.createElement('div');
  host.style.width = '900px';
  host.style.height = '400px';
  document.body.appendChild(host);
  const chart = new ParetoChart(host, cfg, context);
  chart.render();
  return { host, chart };
}

function unmount({ host, chart }) {
  chart.destroy();
  host.remove();
}

suite('Pareto type — cumulative % against the grand total', () => {
  test('truncated without bucket: bar 20 shows the true share, not 100 %', () => {
    const m = mount({ items: flatItems() });
    const items = m.chart._getItems();
    assertEqual(items.length, 20);
    const pcts = m.chart._cumulativePercents(items);
    // sum(100..81) = 1810 → 1810 / 2565
    assertAlmostEqual(pcts[19], 1810 / 2565 * 100, 1e-9);
    unmount(m);
  });

  test('with bucket the last bar closes at 100 %', () => {
    const m = mount({ items: flatItems(), otherBucket: true });
    const items = m.chart._getItems();
    assertEqual(items.length, 20);
    const pcts = m.chart._cumulativePercents(items);
    assertAlmostEqual(pcts[19], 100, 1e-9);
    unmount(m);
  });

  test('untruncated data is unchanged', () => {
    const m = mount({ items: [{ name: 'a', value: 3 }, { name: 'b', value: 1 }] });
    const pcts = m.chart._cumulativePercents(m.chart._getItems());
    assertAlmostEqual(pcts[0], 75, 1e-9);
    assertAlmostEqual(pcts[1], 100, 1e-9);
    unmount(m);
  });
});

suite('Pareto type — "other" bucket label', () => {
  test('default label comes from i18n chart.pareto.other', () => {
    const i18n = { t: (k) => (k === 'chart.pareto.other' ? 'Other' : k) };
    const m = mount({ items: flatItems(), otherBucket: true }, { language: 'en', i18n });
    const items = m.chart._getItems();
    assertEqual(items[19].name, 'Other');
    unmount(m);
  });

  test('an explicit otherLabel wins', () => {
    const m = mount({ items: flatItems(), otherBucket: true, otherLabel: 'Weitere' });
    assertEqual(m.chart._getItems()[19].name, 'Weitere');
    unmount(m);
  });
});

suite('Pareto type — right axis mirrors the left axis', () => {
  const setup = () => {
    const m = mount({ items: flatItems().slice(0, 5), yLabel: 'Σ Zeile', rightYLabel: 'Kumulativ %' });
    const texts = [...m.host.querySelectorAll('svg text')];
    return {
      m,
      pa: m.chart._getPlotArea(),
      leftTitle: texts.find(t => t.textContent === 'Σ Zeile'),
      rightTitle: texts.find(t => t.textContent === 'Kumulativ %'),
      leftTick: texts.find(t => t.classList.contains('tick-label') && t.getAttribute('text-anchor') === 'end'),
      rightTick: texts.find(t => t.textContent === '100%'),
    };
  };

  test('axis title is as far from the right edge as the left title from the left edge', () => {
    const { m, pa, leftTitle, rightTitle } = setup();
    assertEqual(pa.totalW - Number(rightTitle.getAttribute('x')), Number(leftTitle.getAttribute('x')));
    unmount(m);
  });

  test('tick labels keep the same distance from the axis on both sides', () => {
    const { m, pa, leftTick, rightTick } = setup();
    assertEqual(Number(rightTick.getAttribute('x')) - (pa.x + pa.w), pa.x - Number(leftTick.getAttribute('x')));
    unmount(m);
  });

  test('tick labels and titles use the same font on both sides', () => {
    const { m, leftTitle, rightTitle, leftTick, rightTick } = setup();
    assertEqual(rightTick.getAttribute('font-family'), leftTick.getAttribute('font-family'));
    assertEqual(rightTick.getAttribute('font-size'), leftTick.getAttribute('font-size'));
    assertEqual(rightTitle.getAttribute('font-size'), leftTitle.getAttribute('font-size'));
    unmount(m);
  });
});

suite('Pareto type — tooltip cumulative % follows the locale (Bug 11)', () => {
  const items = () => [{ name: 'A', value: 3 }, { name: 'B', value: 1 }];
  test('de: Σ 75,0 % with a no-break space', () => {
    const m = mount({ items: items() }, { language: 'de' });
    const [hit] = m.chart._findNearby(0, 1, 5);
    assertEqual(hit.node.textContent.includes('Σ 75,0 %'), true, hit.node.textContent);
    unmount(m);
  });
  test('en: Σ 75.0%', () => {
    const m = mount({ items: items() }, { language: 'en' });
    const [hit] = m.chart._findNearby(0, 1, 5);
    assertEqual(hit.node.textContent.includes('Σ 75.0%'), true, hit.node.textContent);
    unmount(m);
  });
});

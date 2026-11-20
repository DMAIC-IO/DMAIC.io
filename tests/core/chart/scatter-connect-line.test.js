/**
 * D.Mike — Scatter chart type — connecting line per series in the editor
 *
 * With `editConnectLine` the editor appends a "connecting line" section to each
 * series entry (show, colour, line style). Without the switch nothing changes.
 */

import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import ScatterChart from '../../../js/core/chart/types/scatter.js';
import de from '../../../i18n/de.json' with { type: 'json' };

/** Minimal i18n over the real German texts (returns the key when missing). */
const i18n = {
  t(key) {
    const val = key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), de);
    return typeof val === 'string' ? val : key;
  },
};

/** Mount a scatter chart with two series and an open editor. */
function mount(extra = {}) {
  const host = document.createElement('div');
  host.style.width = '600px';
  host.style.height = '300px';
  document.body.appendChild(host);
  let notified = 0;
  const cfg = {
    series: [
      { name: 'A', x: [1, 2, 3], y: [3, 4, 5], color: 'rgba(10, 20, 30, 1)' },
      { name: 'B', x: [1, 2, 3], y: [5, 4, 3] },
    ],
    xMin: 0, xMax: 10, yMin: 0, yMax: 10,
    onEditorChange: () => { notified++; },
    ...extra,
  };
  const chart = new ScatterChart(host, cfg, { language: 'de', i18n });
  chart.render();
  chart._editorOpen = true;
  chart._buildEditor();
  return { host, chart, inner: chart._editorInner, notified: () => notified };
}

const sections = (inner) => [...inner.querySelectorAll('[data-ed="connectLine"]')];
const popups = () => document.querySelectorAll('.dmike-chart-ed-cp-popup').length;

function done(m) {
  m.chart.destroy();
  m.host.remove();
}

suite('Scatter type — connecting line editor', () => {
  test('without editConnectLine the editor has no connecting-line section', () => {
    const m = mount();
    assertEqual(sections(m.inner).length, 0);
    done(m);
  });

  test('with editConnectLine one section per series, inside the series entry', () => {
    const m = mount({ editConnectLine: true });
    const secs = sections(m.inner);
    assertEqual(secs.length, 2);
    const items = m.inner.querySelectorAll('.dmike-chart-ed-series-item');
    secs.forEach((sec, i) => {
      assertEqual(sec.parentElement, items[i]);
      assertTrue(sec.classList.contains('dmike-chart-ed-series-detail') && sec.classList.contains('open'));
      assertEqual(sec.querySelector('.dmike-chart-ed-subsection-title').textContent, 'Verbindungslinie');
    });
    // Order: show, colour, line style
    const rows = [...secs[0].children].slice(1);
    assertTrue(rows[0].querySelector('input[type="checkbox"]') !== null, 'show first');
    assertTrue(rows[1].classList.contains('dmike-chart-ed-color-pair'), 'colour second');
    assertTrue(rows[2].querySelector('select') !== null, 'line style third');
    done(m);
  });

  test('ticking show writes connectLine, notifies once and draws a polyline', () => {
    const m = mount({ editConnectLine: true });
    const box = sections(m.inner)[0].querySelector('input[type="checkbox"]');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    assertEqual(m.chart.config.series[0].connectLine.show, true);
    assertEqual(m.notified(), 1);
    assertEqual(m.host.querySelectorAll('svg polyline').length, 1);
    done(m);
  });

  test('line style dashdot writes the dash and draws a dashed polyline', () => {
    const m = mount({ editConnectLine: true });
    const sec = sections(m.inner)[0];
    const box = sec.querySelector('input[type="checkbox"]');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    const sel = sec.querySelector('select');
    sel.value = 'dashdot';
    sel.dispatchEvent(new Event('change'));
    assertEqual(m.chart.config.series[0].connectLine.dash, 'dashdot');
    const line = m.host.querySelector('svg polyline');
    assertTrue(line.hasAttribute('stroke-dasharray'), 'dashed');
    done(m);
  });

  test('line style options carry translated texts', () => {
    const m = mount({ editConnectLine: true });
    const opts = [...sections(m.inner)[0].querySelectorAll('select option')];
    assertDeepEqual(opts.map((o) => o.value), ['solid', 'dash', 'dot', 'dashdot', 'longdash']);
    assertDeepEqual(opts.map((o) => o.textContent),
      ['Durchgezogen', 'Gestrichelt', 'Gepunktet', 'Strich-Punkt', 'Lang gestrichelt']);
    done(m);
  });

  test('series colour set in the base editor: the line follows, no own colour stored', () => {
    const m = mount({ editConnectLine: true });
    const box = sections(m.inner)[0].querySelector('input[type="checkbox"]');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    m.inner.querySelector('.dmike-chart-ed-series-header .dmike-chart-ed-color-swatch')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const hex = document.querySelector('.dmike-chart-ed-cp-popup .dmike-chart-ed-cp-hex-input');
    hex.value = 'ff0000';
    hex.dispatchEvent(new Event('input'));
    document.querySelector('.dmike-chart-ed-cp-overlay').click();
    const color = m.chart.config.series[0].color;
    assertEqual(m.host.querySelector('svg polyline').getAttribute('stroke'), color);
    assertTrue(!('color' in m.chart.config.series[0].connectLine), 'no connectLine.color');
    assertTrue(color.includes('255'), `new colour applied (${color})`);
    // The line row's swatch (no own colour) shows the new series colour too.
    const probe = document.createElement('div');
    probe.style.background = color;
    const lineSwatch = sections(m.inner)[0].querySelector('.dmike-chart-ed-color-swatch');
    assertEqual(lineSwatch.style.background, probe.style.background);
    done(m);
  });

  test('a colour chosen in the line picker is stored on connectLine', () => {
    const m = mount({ editConnectLine: true });
    const sec = sections(m.inner)[0];
    sec.querySelector('.dmike-chart-ed-color-swatch').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const hex = document.querySelector('.dmike-chart-ed-cp-popup .dmike-chart-ed-cp-hex-input');
    hex.value = '00ff00';
    hex.dispatchEvent(new Event('input'));
    const cl = m.chart.config.series[0].connectLine;
    assertTrue(typeof cl.color === 'string' && cl.color.includes('255'), 'colour stored');
    assertEqual(cl.show, false);
    done(m);
    assertEqual(popups(), 0);
  });

  test('open line picker, destroy the chart: popup gone, callback writes nothing', () => {
    const m = mount({ editConnectLine: true });
    sections(m.inner)[0].querySelector('.dmike-chart-ed-color-swatch')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assertEqual(popups(), 1);
    const hex = document.querySelector('.dmike-chart-ed-cp-popup .dmike-chart-ed-cp-hex-input');
    m.chart.destroy();
    assertEqual(popups(), 0);
    hex.value = '00ff00';
    hex.dispatchEvent(new Event('input'));
    assertEqual(m.chart.config.series[0].connectLine, undefined);
    m.host.remove();
  });

  test('open line picker, rebuild the editor: popup gone, callback writes nothing', () => {
    const m = mount({ editConnectLine: true });
    sections(m.inner)[0].querySelector('.dmike-chart-ed-color-swatch')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assertEqual(popups(), 1);
    const hex = document.querySelector('.dmike-chart-ed-cp-popup .dmike-chart-ed-cp-hex-input');
    m.chart._buildEditor();
    assertEqual(popups(), 0);
    hex.value = '00ff00';
    hex.dispatchEvent(new Event('input'));
    assertEqual(m.chart.config.series[0].connectLine, undefined);
    done(m);
  });
});

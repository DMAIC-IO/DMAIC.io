/**
 * D.Mike — Diagrammtyp contour — Tests
 *
 * Rasterbild unter Gitter und Bezugsbereichen, Höhenlinien, Beschriftung,
 * Messpunkte, Tooltip, exakte Achsen, Randfälle (konstante Fläche, Lücken)
 * und der Editor des Typs.
 */

import { suite, test, assertEqual, assertTrue, assertClose } from '../../test-utils.js';
import ContourChart from '../../../js/core/chart/types/contour.js';
import ScatterChart from '../../../js/core/chart/types/scatter.js';
import ChartBase from '../../../js/core/chart/chart-base.js';
import { bilinear } from '../../../js/core/chart/contour-geometry.js';
import { formatNum } from '../../../js/core/chart/chart-core.js';
import { CONTOUR_DEFAULTS } from '../../../js/core/chart/contour-defaults.js';

const RES = 20;

/** z = x·y auf einem RES×RES-Gitter; Zeile 0 liegt bei y = 3. */
function productGrid() {
  const grid = [];
  for (let j = 0; j < RES; j++) {
    const y = 3 - 6 * j / (RES - 1);
    const row = [];
    for (let i = 0; i < RES; i++) row.push((-3 + 6 * i / (RES - 1)) * y);
    grid.push(row);
  }
  return grid;
}

const BASE = { grid: productGrid(), xRange: [-3, 3], yRange: [-3, 3] };

function mount(cfg, Type = ContourChart, context = { language: 'de' }) {
  const host = document.createElement('div');
  host.style.width = '600px';
  host.style.height = '400px';
  document.body.appendChild(host);
  const chart = new Type(host, cfg, context);
  chart.render();
  return { host, chart, svg: host.querySelector('svg') };
}

function done({ host, chart }) {
  chart.destroy();
  host.remove();
}

/** Kein Attribut eines SVG-Elements enthält `NaN`. */
function assertNoNaN(svg) {
  for (const el of svg.querySelectorAll('*')) {
    for (const a of el.attributes) {
      assertTrue(!a.value.includes('NaN'), `${el.tagName}[${a.name}] = ${a.value.slice(0, 80)}`);
    }
  }
}

suite('Chart type contour', () => {
  test('one raster image under the reference areas, filling the plot area', () => {
    const m = mount({ ...BASE, refAreas: [{ dir: 'x', min: -1, max: 1, color: 'var(--color-accent)' }] });
    const images = m.svg.querySelectorAll('image');
    assertEqual(images.length, 1);
    const img = images[0];
    assertTrue(img.getAttribute('href').startsWith('data:image/png'), img.getAttribute('href').slice(0, 30));
    const pa = m.chart._plotArea;
    assertClose(Number(img.getAttribute('width')), pa.w * RES / (RES - 1), 0.5);
    assertClose(Number(img.getAttribute('height')), pa.h * RES / (RES - 1), 0.5);
    assertClose(Number(img.getAttribute('x')), pa.x, 0.5);
    assertClose(Number(img.getAttribute('y')), pa.y, 0.5);
    const firstArea = [...m.svg.querySelectorAll('[clip-path]')].find((g) => !g.contains(img));
    assertTrue(!!firstArea, 'reference-area group exists');
    assertTrue(!!(img.compareDocumentPosition(firstArea) & Node.DOCUMENT_POSITION_FOLLOWING),
      'image precedes the first reference-area group');
    done(m);
  });

  test('numLevels sets the number of contour lines', () => {
    const m = mount({ ...BASE, numLevels: 6 });
    assertEqual(m.svg.querySelectorAll('path.chart-contour-line').length, 6);
    done(m);
  });

  test('showLines: false draws no lines and no labels', () => {
    const m = mount({ ...BASE, showLines: false });
    assertEqual(m.svg.querySelectorAll('path.chart-contour-line').length, 0);
    assertEqual(m.svg.querySelectorAll('text.chart-contour-label').length, 0);
    done(m);
  });

  test('showLabels: false keeps the lines but drops the labels', () => {
    const m = mount({ ...BASE, showLabels: false });
    assertTrue(m.svg.querySelectorAll('path.chart-contour-line').length > 0, 'lines drawn');
    assertEqual(m.svg.querySelectorAll('text.chart-contour-label').length, 0);
    done(m);
  });

  test('labels use the German decimal comma', () => {
    const m = mount({ ...BASE, numLevels: 6 });
    const labels = [...m.svg.querySelectorAll('text.chart-contour-label')].map((t) => t.textContent);
    assertTrue(labels.length > 0, 'labels drawn');
    assertTrue(labels.every((s) => /^-?\d+,\d$/.test(s)), labels.join(' | '));
    done(m);
  });

  test('data points only with showDataPoints', () => {
    const pts = [{ x: 0, y: 0, z: 1 }];
    const on = mount({ ...BASE, points: pts, showDataPoints: true });
    assertEqual(on.svg.querySelectorAll('.chart-contour-point').length, 1);
    done(on);
    const off = mount({ ...BASE, points: pts });
    assertEqual(off.svg.querySelectorAll('.chart-contour-point').length, 0);
    done(off);
  });

  test('tooltip in the plot centre shows the interpolated z', () => {
    const m = mount({ ...BASE, xLabel: 'A', yLabel: 'B', zLabel: 'Ausbeute' });
    const pa = m.chart._plotArea;
    const dx = m.chart._xScaleInv(pa.x + pa.w * 0.6);
    const dy = m.chart._yScaleInv(pa.y + pa.h * 0.3);
    const hits = m.chart._findNearby(dx, dy, 10);
    assertEqual(hits.length, 1);
    const text = hits[0].node.textContent;
    const z = bilinear(BASE.grid, BASE.xRange, BASE.yRange, dx, dy);
    assertTrue(text.includes('Ausbeute'), text);
    assertTrue(text.includes(formatNum(z, 3, 'de')), `${text} / ${z}`);
    assertTrue(text.includes(formatNum(dx, 3, 'de')), text);
    done(m);
  });

  test('tooltip outside the plot area has no hit', () => {
    const m = mount(BASE);
    assertEqual(m.chart._findNearby(5, 0, 10).length, 0);
    done(m);
  });

  test('tooltip labels are text, never markup', () => {
    const m = mount({ ...BASE, zLabel: '<img src=x onerror=1>' });
    const hits = m.chart._findNearby(0.5, 0.5, 10);
    assertEqual(hits.length, 1);
    assertEqual(hits[0].node.querySelector('img'), null);
    assertTrue(hits[0].node.textContent.includes('<img src=x onerror=1>'), hits[0].node.textContent);
    done(m);
  });

  test('x axis is exact: -3 maps to the plot edge', () => {
    const m = mount(BASE);
    const pa = m.chart._plotArea;
    assertTrue(m.chart._xTick.ticks[0] >= -3, `first tick ${m.chart._xTick.ticks[0]}`);
    assertClose(m.chart._xScale(-3), pa.x, 1e-6);
    assertClose(m.chart._xScale(3), pa.x + pa.w, 1e-6);
    done(m);
  });

  test('constant grid: no lines, no NaN', () => {
    const grid = Array.from({ length: RES }, () => Array(RES).fill(5));
    const m = mount({ ...BASE, grid });
    assertEqual(m.svg.querySelectorAll('path.chart-contour-line').length, 0);
    assertEqual(m.svg.querySelectorAll('text.chart-contour-label').length, 0);
    assertEqual(m.svg.querySelectorAll('image').length, 1);
    assertNoNaN(m.svg);
    done(m);
  });

  test('grid with Infinity and null: no throw, no NaN', () => {
    const grid = productGrid();
    grid[3][4] = Infinity;
    grid[10][10] = null;
    grid[12][2] = -Infinity;
    grid[15][15] = NaN;
    const m = mount({ ...BASE, grid, showDataPoints: true, points: [{ x: 0, y: 0, z: 1 }] });
    assertTrue(m.svg.querySelectorAll('path.chart-contour-line').length > 0, 'lines drawn');
    assertNoNaN(m.svg);
    done(m);
  });

  test('empty grid renders without image and without NaN', () => {
    const m = mount({ grid: [], xRange: [0, 1], yRange: [0, 1] });
    assertEqual(m.svg.querySelectorAll('image').length, 0);
    assertNoNaN(m.svg);
    done(m);
  });

  test('editorKeys lists the own editor settings', () => {
    const own = ['colorScheme', 'numLevels', 'gridRes', 'showLines', 'showLabels', 'showDataPoints',
      'markerSymbol', 'markerSize', 'markerColor', 'markerStroke', 'markerStrokeWidth', 'markerStrokeDash'];
    assertEqual(JSON.stringify(ContourChart.editorKeys), JSON.stringify([...ChartBase.editorKeys, ...own]));
  });

  test('defaults come from CONTOUR_DEFAULTS', () => {
    const m = mount(BASE);
    for (const [k, v] of Object.entries(CONTOUR_DEFAULTS)) assertEqual(m.chart.config[k], v, k);
    assertTrue(Object.isFrozen(CONTOUR_DEFAULTS), 'frozen');
    assertEqual(m.chart.config.showLegend, false);
    done(m);
  });

  test('editor: appearance, marker section and translated dash styles', () => {
    const i18n = { t: (k) => `T:${k}` };
    const m = mount(BASE, ContourChart, { language: 'de', i18n });
    const inner = document.createElement('div');
    m.chart._buildTypeEditor(inner, (k) => k, () => {}, () => {});
    const sections = inner.querySelectorAll('.dmike-chart-ed-section');
    assertEqual(sections.length, 2);
    assertEqual(sections[0].querySelector('.dmike-chart-ed-section-title').textContent,
      'T:chart.editor.contour.appearance');
    assertEqual(sections[1].querySelector('.dmike-chart-ed-section-title').textContent,
      'T:chart.editor.contour.dataPoints');

    const schemeSel = sections[0].querySelector('select');
    assertEqual(schemeSel.options.length, 5);
    assertTrue(!!sections[0].querySelector('.dmike-chart-ed__color-preview'), 'colour preview');

    const ranges = [...sections[0].querySelectorAll('input[type=range]')]
      .map((r) => `${r.min}/${r.max}/${r.step}`);
    assertEqual(JSON.stringify(ranges), JSON.stringify(['4/20/1', '40/200/10']));
    assertEqual(sections[0].querySelectorAll('input[type=checkbox]').length, 3);

    const dashSel = [...sections[1].querySelectorAll('select')].at(-1);
    const opts = [...dashSel.options].map((o) => `${o.value}=${o.textContent}`);
    assertEqual(JSON.stringify(opts), JSON.stringify(
      ['solid', 'dash', 'dot', 'dashdot', 'longdash'].map((v) => `${v}=T:chart.editor.contour.dash.${v}`)));
    done(m);
  });

  test('editor texts exist in de and en', async () => {
    const keys = ['appearance', 'colorScheme', 'schemeGreen', 'schemeGray', 'numLevels', 'gridRes',
      'showLines', 'showLabels', 'showDataPoints', 'dataPoints', 'markerStrokeDash',
      'dash.solid', 'dash.dash', 'dash.dot', 'dash.dashdot', 'dash.longdash'];
    for (const lang of ['de', 'en']) {
      const res = await fetch(new URL(`../../../i18n/${lang}.json`, import.meta.url));
      const json = await res.json();
      const sec = json.chart.editor.contour;
      for (const k of keys) {
        const v = k.split('.').reduce((o, p) => o?.[p], sec);
        assertTrue(typeof v === 'string' && v.length > 0, `${lang}: chart.editor.contour.${k}`);
      }
    }
  });

  test('base _renderUnderlay draws nothing (scatter keeps its groups)', () => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    ChartBase.prototype._renderUnderlay.call({}, g, (v) => v, (v) => v, { x: 0, y: 0, w: 1, h: 1 }, null);
    assertEqual(g.childNodes.length, 0);
    const m = mount({ series: [{ name: 'A', x: [1, 2], y: [1, 2] }] }, ScatterChart);
    const clipGroups = [...m.svg.children].filter((el) => el.tagName === 'g' && el.hasAttribute('clip-path'));
    assertEqual(clipGroups.length, 5, 'area, grid, reference lines, data, highlight');
    done(m);
  });
});

/**
 * D.Mike — Control-chart type — `data-ref` auf Mittel- und Eingriffsgrenzen
 *
 * CL, UCL und LCL müssen von außen flach ansprechbar und damit eindeutig
 * annotierbar sein. Gezeichnet werden sie je nach Konfiguration als `<line>` (konstante
 * Grenze) oder als `<path>` (variable Grenze bei wechselnder Stichprobengröße);
 * beide Varianten tragen darum dieselbe Konvention wie die Referenzlinien in
 * `chart-base.js`: `data-ref="line"` plus `data-ref-label`.
 */

import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import ControlChartType from '../../../js/core/chart/types/control-chart.js';

function mount(cfg) {
  const host = document.createElement('div');
  host.style.width = '800px';
  host.style.height = '340px';
  document.body.appendChild(host);
  const chart = new ControlChartType(host, cfg, { language: 'de' });
  chart.render();
  return { host, chart, svg: host.querySelector('svg') };
}

function refs(svg, label) {
  return Array.from(svg.querySelectorAll(`[data-ref="line"][data-ref-label="${label}"]`));
}

const VALUES = [10, 11, 9, 10.5, 10.2, 9.8, 10.1, 10.4];

suite('Control-chart type — konstante Grenzen', () => {
  test('CL, UCL und LCL sind je als <line> adressierbar', () => {
    const { chart, svg } = mount({
      values: VALUES, cl: 10, ucl: 12, lcl: 8, sigma: 0.667,
    });
    for (const label of ['CL', 'UCL', 'LCL']) {
      const found = refs(svg, label);
      assertEqual(found.length, 1, `${label} genau einmal`);
      assertEqual(found[0].tagName.toLowerCase(), 'line', `${label} ist <line>`);
    }
    chart.destroy();
  });

  test('Spezifikationsgrenzen tragen USL/LSL als Label', () => {
    const { chart, svg } = mount({
      values: VALUES, cl: 10, ucl: 12, lcl: 8, sigma: 0.667, usl: 13, lsl: 7,
    });
    assertEqual(refs(svg, 'USL').length, 1, 'USL');
    assertEqual(refs(svg, 'LSL').length, 1, 'LSL');
    chart.destroy();
  });
});

suite('Control-chart type — variable Grenzen', () => {
  test('gestufte UCL/LCL sind als <path> adressierbar', () => {
    const { chart, svg } = mount({
      values: VALUES,
      cl: 10,
      ucl: VALUES.map((_, i) => 12 + (i % 2) * 0.3),
      lcl: VALUES.map((_, i) => 8 - (i % 2) * 0.3),
      sigma: 0.667,
    });
    for (const label of ['UCL', 'LCL']) {
      const found = refs(svg, label);
      assertEqual(found.length, 1, `${label} genau einmal`);
      assertEqual(found[0].tagName.toLowerCase(), 'path', `${label} ist <path>`);
      assertTrue(Boolean(found[0].getAttribute('d')), `${label} hat eine Pfadgeometrie`);
    }
    // Die konstante Mittellinie bleibt daneben eine <line>.
    assertEqual(refs(svg, 'CL')[0].tagName.toLowerCase(), 'line', 'CL ist <line>');
    chart.destroy();
  });
});

suite('Control-chart type — xOffset', () => {
  test('ohne xOffset beginnt die Achse bei Stichprobe 1', () => {
    const { chart } = mount({ values: VALUES, cl: 10, ucl: 12, lcl: 8, sigma: 0.667 });
    const ext = chart._getDataExtent();
    assertEqual(ext.xMin, 0.5);
    assertEqual(ext.xMax, VALUES.length + 0.5);
    chart.destroy();
  });

  test('xOffset verschiebt Achse und Tooltip auf die echten Stichprobennummern', () => {
    const { chart } = mount({ values: VALUES, cl: 10, ucl: 12, lcl: 8, sigma: 0.667, xOffset: 20 });
    const ext = chart._getDataExtent();
    assertEqual(ext.xMin, 20.5);
    assertEqual(ext.xMax, 20 + VALUES.length + 0.5);
    const [hit] = chart._findNearby(21, VALUES[0], 1);
    assertEqual(hit.px, 21, 'erster Punkt sitzt bei x = 21');
    assertEqual(hit.node.querySelector('strong').textContent, '#21');
    chart.destroy();
  });
});

suite('Control-chart type — Lücken (null) in values', () => {
  /** Stützpunkte der Datenlinie (einziger Pfad mit Strichstärke 1.8). */
  function linePoints(svg) {
    const paths = Array.from(svg.querySelectorAll('path[stroke-width="1.8"]'));
    assertEqual(paths.length, 1, 'genau eine Datenlinie, ohne Unterbrechung');
    const d = paths[0].getAttribute('d');
    assertEqual((d.match(/M/g) || []).length, 1, 'ein Teilpfad');
    return Array.from(d.matchAll(/[ML]([-\d.e]+),([-\d.e]+)/g), (m) => [Number(m[1]), Number(m[2])]);
  }

  const CASES = [
    ['Lücke an Index 0 (MR-Form)', [null, 2, 1, 3, 2]],
    ['Lücke in der Mitte (t-Karte)', [4, 5, null, 6, 5]],
  ];
  for (const [name, values] of CASES) {
    test(name, () => {
      const { chart, svg } = mount({ values, cl: 4, ucl: 8, lcl: 0, sigma: 1.3 });
      const nums = values.filter((v) => v !== null);
      const pts = Array.from(svg.querySelectorAll('circle[r="3"]'));
      assertEqual(pts.length, nums.length, 'ein Datenpunkt je Zahl');
      const line = linePoints(svg);
      assertEqual(line.length, nums.length, 'ein Stützpunkt je Zahl');
      // x-Lage am Index: Abstand zum Vorgänger in Stichproben-Schritten.
      const idx = values.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0);
      const step = (line[line.length - 1][0] - line[0][0]) / (idx[idx.length - 1] - idx[0]);
      for (let k = 0; k < line.length; k++) {
        const want = line[0][0] + (idx[k] - idx[0]) * step;
        assertTrue(Math.abs(line[k][0] - want) < 1e-6, `Stützpunkt ${k} bei Stichprobe ${idx[k] + 1}`);
        assertTrue(Math.abs(Number(pts[k].getAttribute('cx')) - line[k][0]) < 1e-6, `Punkt ${k} auf der Linie`);
      }
      const ext = chart._getDataExtent();
      assertEqual(ext.xMax, values.length + 0.5, 'x-Achse über alle Plätze');
      assertTrue(Number.isFinite(ext.yMin) && Number.isFinite(ext.yMax), 'y-Bereich ohne null endlich');
      const gap = values.indexOf(null);
      assertEqual(chart._findNearby(gap + 1, 0, 1000).every((hit) => hit.px !== gap + 1), true, 'kein Tooltip-Ziel für die Lücke');
      assertEqual(chart._findNearby(gap + 1, 0, 0.1).length, 0, 'an der Lücke nichts in der Nähe');
      for (const el of svg.querySelectorAll('*')) {
        for (const a of el.attributes) assertTrue(!/NaN/.test(a.value), `kein NaN in ${el.tagName}@${a.name}`);
      }
      chart.destroy();
    });
  }
});

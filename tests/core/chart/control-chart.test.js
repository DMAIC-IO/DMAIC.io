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

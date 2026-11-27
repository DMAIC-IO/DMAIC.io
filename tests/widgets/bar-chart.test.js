/**
 * D.Mike — Widget bar-chart: Farbe je Balken (`groups[].colors`), wie sie die
 * Regression für die Quadratsummen braucht (Balken in der Farbe ihres
 * Kreisstücks).
 */
import { suite, test, assertDeepEqual, assertThrows, assertEqual } from '../test-utils.js';
import { checkValue } from '../../js/core/model.js';
import barChart from '../../js/widgets/bar-chart/schema.js';
import BarChart from '../../js/core/chart/types/bar.js';

suite('bar-chart: colors je Balken', () => {
  const cfg = {
    categories: ['A', 'B', 'C'],
    groups: [{ name: 'SS', values: [3, 2, 1], colors: ['rgb(255, 0, 0)', 'rgb(0, 128, 0)', 'rgb(0, 0, 255)'] }],
    showLegend: false,
  };

  test('Schema nimmt eine Liste von Farbtexten an', () => {
    assertDeepEqual(checkValue(barChart.props.config, 'c', cfg), cfg);
  });

  test('Schema lehnt Nicht-Texte in colors ab', () => {
    assertThrows(() => checkValue(barChart.props.config, 'c', { groups: [{ name: 'g', values: [1], colors: [1] }] }), /colors/);
  });

  test('jeder Balken trägt seine Farbe; ohne Eintrag gilt color der Gruppe', () => {
    /** @param {object} config @returns {string[]} */
    const fills = (config) => {
      const host = document.createElement('div');
      host.style.width = '600px';
      host.style.height = '400px';
      document.body.appendChild(host);
      const chart = new BarChart(host, checkValue(barChart.props.config, 'c', config), { language: 'de' });
      chart.render();
      const out = [...chart._svg.querySelectorAll('rect[fill-opacity]')].map((r) => r.getAttribute('fill'));
      chart.destroy();
      host.remove();
      return out;
    };
    assertDeepEqual(fills(cfg), ['rgb(255, 0, 0)', 'rgb(0, 128, 0)', 'rgb(0, 0, 255)']);
    const partial = { ...cfg, groups: [{ name: 'SS', values: [3, 2], color: 'rgb(1, 2, 3)', colors: ['rgb(255, 0, 0)'] }], categories: ['A', 'B'] };
    const out = fills(partial);
    assertEqual(out[0], 'rgb(255, 0, 0)');
    assertEqual(out[1], 'rgb(1, 2, 3)');
  });
});

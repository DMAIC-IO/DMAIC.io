/**
 * D.Mike — Widget scatter-chart: Konfigurationsschlüssel xDec/yDec
 * (Nachkommastellen der Achsen, nicht editierbar) und ihre Wirkung auf die
 * gezeichneten Achsenbeschriftungen.
 */
import { suite, test, assertDeepEqual, assertThrows, assertTrue } from '../test-utils.js';
import { checkValue } from '../../js/core/model.js';
import scatterChart from '../../js/widgets/scatter-chart/schema.js';
import ScatterChart from '../../js/core/chart/types/scatter.js';

suite('scatter-chart: xDec/yDec', () => {
  test('Schema nimmt ganze Zahlen ab 0 und null an', () => {
    for (const cfg of [{ xDec: 0, yDec: 0 }, { xDec: 2, yDec: null }, {}]) {
      assertDeepEqual(checkValue(scatterChart.props.config, 'c', cfg), cfg);
    }
  });

  test('Schema lehnt negative und gebrochene Stellenzahlen ab', () => {
    assertThrows(() => checkValue(scatterChart.props.config, 'c', { yDec: -1 }), /yDec/);
    assertThrows(() => checkValue(scatterChart.props.config, 'c', { xDec: 1.5 }), /xDec/);
  });

  test('xDec/yDec sind nicht editierbar (die Altform speicherte sie nicht)', () => {
    assertTrue(!scatterChart.editable.base.includes('xDec'));
    assertTrue(!scatterChart.editable.base.includes('yDec'));
    assertThrows(() => checkValue(scatterChart.edits(), 'e', { yDec: 0 }), /yDec/);
  });

  test('yDec bestimmt die Stellen der y-Achse', () => {
    /** @param {number} yDec @returns {string[]} */
    const yLabels = (yDec) => {
      const host = document.createElement('div');
      host.style.width = '900px';
      host.style.height = '480px';
      document.body.appendChild(host);
      const chart = new ScatterChart(host, {
        yMin: 0, yMax: 100, xMin: 0, xDec: 0, yDec,
        series: [{ name: 'P', x: [4, 10, 20], y: [10, 50, 90] }],
      }, { language: 'de' });
      chart.render();
      const xs = new Set([...chart._svg.querySelectorAll('text.tick-label')]
        .filter((el) => el.getAttribute('text-anchor') === 'end')
        .map((el) => el.textContent));
      chart.destroy();
      host.remove();
      return [...xs];
    };
    assertTrue(yLabels(0).includes('20'));
    assertTrue(yLabels(0).every((s) => !s.includes(',')));
    assertTrue(yLabels(1).includes('20,0'));
  });
});

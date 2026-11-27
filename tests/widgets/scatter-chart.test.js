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

suite('scatter-chart: connectLine.foreground', () => {
  const cfg = {
    series: [
      { name: 'P', x: [1, 2, 3, 4], y: [1, 3, 2, 4], markerSize: 4 },
      { name: 'L', x: [1, 4], y: [1, 4], markerSize: 0, connectLine: { show: true, dash: 'solid', width: 2, color: 'red', foreground: true } },
    ],
  };

  test('Schema nimmt foreground: true an', () => {
    assertDeepEqual(checkValue(scatterChart.props.config, 'c', cfg), cfg);
  });

  test('Schema lehnt foreground als Nicht-Wahrheitswert ab', () => {
    const bad = { series: [{ name: 'L', x: [1], y: [1], connectLine: { show: true, foreground: 'ja' } }] };
    assertThrows(() => checkValue(scatterChart.props.config, 'c', bad), /foreground/);
  });

  test('foreground: die Linie liegt im SVG nach den Punkten, ohne davor', () => {
    /** @param {boolean} foreground @returns {{ line: number, marker: number }} */
    const order = (foreground) => {
      const host = document.createElement('div');
      host.style.width = '600px';
      host.style.height = '400px';
      document.body.appendChild(host);
      const series = cfg.series.map((s) => (s.connectLine ? { ...s, connectLine: { ...s.connectLine, foreground } } : s));
      const chart = new ScatterChart(host, checkValue(scatterChart.props.config, 'c', { series }), { language: 'de' });
      chart.render();
      const nodes = [...chart._svg.querySelectorAll('polyline, circle')];
      const line = nodes.findIndex((n) => n.tagName === 'polyline');
      const marker = nodes.findIndex((n) => n.tagName === 'circle');
      chart.destroy();
      host.remove();
      return { line, marker };
    };
    const fg = order(true);
    assertTrue(fg.line > fg.marker, 'Vordergrund: nach den Punkten');
    const bg = order(false);
    assertTrue(bg.line < bg.marker, 'Hintergrund: vor den Punkten');
  });
});

/**
 * D.Mike — ChartBase: the y axis title keeps the same distance to its tick
 * labels as the x axis title does, whatever the width of the tick labels.
 */
import { suite, test, assertTrue } from '../../test-utils.js';
import ChartBase from '../../../js/core/chart/chart-base.js';

function makeChart(yMax) {
  return class extends ChartBase {
    _getDataExtent() { return { xMin: 0, xMax: 10, yMin: 0, yMax }; }
    _getLegendItems() { return []; }
  };
}

function mount(yMax) {
  const host = document.createElement('div');
  host.style.width = '700px';
  host.style.height = '400px';
  document.body.appendChild(host);
  const Chart = makeChart(yMax);
  const chart = new Chart(host, { xLabel: 'Messwert', yLabel: 'Probability of Occurance', showLegend: false }, { language: 'de' });
  chart.render();
  const svg = host.querySelector('svg');
  const texts = [...svg.querySelectorAll('text')];
  const rect = (el) => el.getBoundingClientRect();
  const yTitle = rect(texts.find(t => t.textContent === 'Probability of Occurance'));
  const xTitle = rect(texts.find(t => t.textContent === 'Messwert'));
  const ticks = texts.filter(t => t.classList.contains('tick-label'));
  const yTicks = ticks.filter(t => t.getAttribute('text-anchor') === 'end').map(rect);
  const xTicks = ticks.filter(t => t.getAttribute('text-anchor') === 'middle').map(rect);
  const gapY = Math.min(...yTicks.map(r => r.left)) - yTitle.right;
  const gapX = xTitle.top - Math.max(...xTicks.map(r => r.bottom));
  return { host, chart, gapY, gapX, svgLeft: rect(svg).left, yTitle };
}

suite('ChartBase — axis title distance', () => {
  test('short tick labels: y title as close to the ticks as the x title', () => {
    const m = mount(10);
    assertTrue(Math.abs(m.gapY - m.gapX) <= 4, `gapY=${m.gapY.toFixed(1)}, gapX=${m.gapX.toFixed(1)}`);
    m.chart.destroy(); m.host.remove();
  });

  test('wide tick labels: the y title does not run into them and stays inside', () => {
    const m = mount(12345678);
    assertTrue(Math.abs(m.gapY - m.gapX) <= 4, `gapY=${m.gapY.toFixed(1)}, gapX=${m.gapX.toFixed(1)}`);
    assertTrue(m.yTitle.left >= m.svgLeft, 'y title inside the image');
    m.chart.destroy(); m.host.remove();
  });
});

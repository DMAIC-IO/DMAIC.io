/**
 * D.Mike — ChartBase: the title stays centred and inside the image.
 * Short titles centre over the plot area; a title that would leave the image
 * there (long title, wide left margin or legend) centres over the image.
 */
import { suite, test, assertTrue } from '../../test-utils.js';
import ChartBase from '../../../js/core/chart/chart-base.js';

class Legendy extends ChartBase {
  _getDataExtent() { return { xMin: 0, xMax: 10, yMin: 0, yMax: 10 }; }
  _getLegendItems() {
    return [{ type: 'rect', color: 'red', label: 'A very long legend entry that takes a lot of room' }];
  }
}

function mount(title) {
  const host = document.createElement('div');
  host.style.width = '600px';
  host.style.height = '400px';
  document.body.appendChild(host);
  const chart = new Legendy(host, { title }, { language: 'de' });
  chart.render();
  const svg = host.querySelector('svg');
  const el = [...svg.querySelectorAll('text')].find(t => t.textContent === title);
  return { host, chart, svg, el };
}

suite('ChartBase — title centring', () => {
  test('a long title stays inside the image and centres on it', () => {
    const title = 'Monatliche Reklamationen je Produktlinie und Werk im Geschäftsjahr 2026';
    const m = mount(title);
    const w = Number(m.svg.getAttribute('width'));
    const x = Number(m.el.getAttribute('x'));
    const len = m.el.getComputedTextLength();
    assertTrue(x - len / 2 >= 0, `left edge inside (${x - len / 2})`);
    assertTrue(x + len / 2 <= w, `right edge inside (${x + len / 2} > ${w})`);
    assertTrue(Math.abs(x - w / 2) < 1, `centred on the image (x=${x}, w/2=${w / 2})`);
    m.chart.destroy(); m.host.remove();
  });

  test('a short title centres over the plot area', () => {
    const m = mount('Kurz');
    const pa = m.chart._getPlotArea();
    const x = Number(m.el.getAttribute('x'));
    assertTrue(Math.abs(x - (pa.x + pa.w / 2)) < 1, `x=${x}`);
    m.chart.destroy(); m.host.remove();
  });
});

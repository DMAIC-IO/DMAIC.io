/**
 * D.Mike — Mosaic chart type — tooltip percentage follows the locale (Bug 11)
 *
 * The conditional share in the cell tooltip is formatted with formatPct:
 * de „33,3 %“ (no-break space), en „33.3%“.
 */

import { suite, test, assertTrue } from '../../test-utils.js';
import MosaicChart from '../../../js/core/chart/types/mosaic.js';

const cfg = () => ({
  categories: ['A', 'B'],
  groups: [{ name: 'X', values: [3, 1] }, { name: 'Y', values: [6, 1] }],
});

function mount(language) {
  const host = document.createElement('div');
  host.style.width = '900px';
  host.style.height = '400px';
  document.body.appendChild(host);
  const chart = new MosaicChart(host, cfg(), { language });
  chart.render();
  return { host, chart };
}
function unmount(m) { m.chart.destroy(); m.host.remove(); }

/** Tooltip text of cell (A, X) — 3 of 9 in column A. */
function tipOfFirstCell(m) {
  const cell = m.chart._cellRects.find(c => c.ci === 0 && c.gi === 0);
  m.chart._xScale = (v) => v;
  m.chart._yScale = (v) => v;
  const [hit] = m.chart._findNearby(cell.x + 1, cell.y + 1, 5);
  return hit.node.textContent;
}

suite('Mosaic type — tooltip share follows the locale (Bug 11)', () => {
  test('de: n = 3 (33,3 %) with a no-break space', () => {
    const m = mount('de');
    const txt = tipOfFirstCell(m);
    assertTrue(txt.includes('n = 3 (33,3 %)'), txt);
    unmount(m);
  });
  test('en: n = 3 (33.3%)', () => {
    const m = mount('en');
    const txt = tipOfFirstCell(m);
    assertTrue(txt.includes('n = 3 (33.3%)'), txt);
    unmount(m);
  });
});

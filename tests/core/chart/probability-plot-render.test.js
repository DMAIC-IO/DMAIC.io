/**
 * D.Mike — Wahrscheinlichkeitsnetz — Prozentbeschriftungen folgen der Sprache (Bug 11)
 *
 * Achsenbeschriftung und Tooltip formatieren den Anteil mit formatPct:
 * de „50 %“ / „P = 45,0 %“ (geschütztes Leerzeichen), en „50%“ / „P = 45.0%“.
 */

import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import ProbabilityPlot from '../../../js/core/chart/types/probability-plot.js';

const DATA = [4.1, 4.8, 5.0, 5.2, 5.3, 5.5, 5.9, 6.2, 6.4, 7.0];

function mount(language) {
  const host = document.createElement('div');
  host.style.width = '900px';
  host.style.height = '480px';
  document.body.appendChild(host);
  const chart = new ProbabilityPlot(host, { data: DATA }, { language });
  chart.render();
  return { host, chart };
}
function unmount(m) { m.chart.destroy(); m.host.remove(); }

const texts = (m) => [...m.host.querySelectorAll('svg text')].map(t => t.textContent);

function tip(m) {
  const s = m.chart._seriesRender[0];
  m.chart._xScale = (v) => v;
  m.chart._yScale = (v) => v;
  const [hit] = m.chart._findNearby(s.sorted[0], s.zScores[0], 5);
  return hit.node.textContent;
}

suite('Probability plot — percentages follow the locale (Bug 11)', () => {
  test('de: axis 50 % with a no-break space, tooltip P = d,d %', () => {
    const m = mount('de');
    const all = texts(m);
    assertTrue(all.includes('50 %'), all.join(' | '));
    assertEqual(all.some(t => /\d%$/.test(t)), false, 'kein „50%“ ohne Leerzeichen');
    assertTrue(/P = \d+,\d %/.test(tip(m)), tip(m));
    unmount(m);
  });
  test('en: axis 50%, tooltip P = d.d%', () => {
    const m = mount('en');
    const all = texts(m);
    assertTrue(all.includes('50%'), all.join(' | '));
    assertTrue(/P = \d+\.\d%/.test(tip(m)), tip(m));
    unmount(m);
  });
});

/**
 * D.Mike — Boxplot chart type — `data-part` addressing
 *
 * Die Bestandteile einer Box brauchen flache, stabile Selektoren, damit sie
 * sich von außen eindeutig adressieren und annotieren lassen. Geprüft wird
 * darum nur die Adressierung — Whisker, Caps, IQR-Box, Median, Mittelwert und Ausreißer
 * müssen in **beiden** Orientierungen dieselben `data-part`-Werte tragen.
 * Geometrie und Darstellung prüfen andere Suiten.
 */

import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import BoxplotChart from '../../../js/core/chart/types/boxplot.js';

/** Eine Gruppe mit genau einem Ausreißer (100 liegt über der 1,5×IQR-Grenze). */
function fixtureConfig(extra) {
  return Object.assign({
    groups: [{ name: 'A', values: [1, 2, 3, 4, 5, 6, 7, 8, 100] }],
    showMean: true,
    showOutliers: true,
  }, extra);
}

function mount(cfg) {
  const host = document.createElement('div');
  host.style.width = '800px';
  host.style.height = '340px';
  document.body.appendChild(host);
  const chart = new BoxplotChart(host, cfg, { language: 'de' });
  chart.render();
  return { host, chart, svg: host.querySelector('svg') };
}

function parts(svg, name) {
  return Array.from(svg.querySelectorAll(`[data-part="${name}"]`));
}

for (const orientation of ['horizontal', 'vertical']) {
  suite(`Boxplot type — data-part (${orientation})`, () => {
    test('Whisker-Spines und -Caps sind je zweimal adressierbar', () => {
      const { chart, svg } = mount(fixtureConfig({ orientation }));
      assertEqual(parts(svg, 'whisker').length, 2, 'whisker spines');
      assertEqual(parts(svg, 'whisker-cap').length, 2, 'whisker caps');
      assertTrue(
        parts(svg, 'whisker').every((el) => el.tagName.toLowerCase() === 'line'),
        'Spines bleiben <line>',
      );
      chart.destroy();
    });

    test('IQR-Rechteck, Medianlinie und Mittelwert-Raute sind einmalig', () => {
      const { chart, svg } = mount(fixtureConfig({ orientation }));
      assertEqual(parts(svg, 'box').length, 1, 'box');
      assertEqual(parts(svg, 'median').length, 1, 'median');
      assertEqual(parts(svg, 'mean').length, 1, 'mean');
      assertEqual(parts(svg, 'box')[0].tagName.toLowerCase(), 'rect', 'box bleibt <rect>');
      assertEqual(parts(svg, 'mean')[0].tagName.toLowerCase(), 'polygon', 'mean bleibt <polygon>');
      chart.destroy();
    });

    test('jeder Ausreißer-Marker trägt data-part="outlier"', () => {
      const { chart, svg } = mount(fixtureConfig({ orientation }));
      assertEqual(parts(svg, 'outlier').length, 1, 'ein Ausreißer');
      chart.destroy();
    });

    test('ohne showMean entfällt die Raute, der Rest bleibt adressierbar', () => {
      const { chart, svg } = mount(fixtureConfig({ orientation, showMean: false }));
      assertEqual(parts(svg, 'mean').length, 0, 'keine Raute');
      assertEqual(parts(svg, 'median').length, 1, 'median bleibt');
      chart.destroy();
    });

    test('zwei Gruppen liefern zwei Boxen und vier Whisker', () => {
      const { chart, svg } = mount(fixtureConfig({
        orientation,
        groups: [
          { name: 'A', values: [1, 2, 3, 4, 5] },
          { name: 'B', values: [2, 3, 4, 5, 6] },
        ],
      }));
      assertEqual(parts(svg, 'box').length, 2, 'boxes');
      assertEqual(parts(svg, 'whisker').length, 4, 'whisker spines');
      assertEqual(parts(svg, 'median').length, 2, 'median lines');
      chart.destroy();
    });
  });
}

/**
 * D.Mike — Run chart type — `data-part` addressing
 *
 * Die gezeichneten Teile des Verlaufs brauchen flache, stabile Selektoren,
 * damit sie sich von außen eindeutig adressieren und annotieren lassen.
 * Geprüft wird darum nur die Adressierung — Mittellinie, ihr Randlabel, der
 * Verlaufspfad und jeder Datenpunkt. Geometrie und Darstellung prüfen andere
 * Suiten.
 */

import { suite, test, assertEqual } from '../../test-utils.js';
import RunChartType from '../../../js/core/chart/types/run-chart.js';

/** Fünf Werte, deren Median 3 ist — die Mittellinie liegt also im Plot. */
function fixtureConfig(extra) {
  return Object.assign({
    values: [1, 2, 3, 4, 5],
    median: 3,
  }, extra);
}

function mount(cfg) {
  const host = document.createElement('div');
  host.style.width = '800px';
  host.style.height = '340px';
  document.body.appendChild(host);
  const chart = new RunChartType(host, cfg, { language: 'de' });
  chart.render();
  return { host, chart, svg: host.querySelector('svg') };
}

function parts(svg, name) {
  return Array.from(svg.querySelectorAll(`[data-part="${name}"]`));
}

suite('Run chart type — data-part', () => {
  test('Mittellinie und Randlabel sind je einmal adressierbar', () => {
    const { chart, svg } = mount(fixtureConfig());
    assertEqual(parts(svg, 'median').length, 1, 'median line');
    assertEqual(parts(svg, 'median-label').length, 1, 'median label');
    assertEqual(parts(svg, 'median')[0].tagName.toLowerCase(), 'line', 'Linie bleibt <line>');
    assertEqual(parts(svg, 'median-label')[0].tagName.toLowerCase(), 'text', 'Label bleibt <text>');
    chart.destroy();
  });

  test('ohne showMedianLabel entfaellt das Label, die Linie bleibt adressierbar', () => {
    const { chart, svg } = mount(fixtureConfig({ showMedianLabel: false }));
    assertEqual(parts(svg, 'median-label').length, 0, 'kein Label');
    assertEqual(parts(svg, 'median').length, 1, 'Linie bleibt');
    chart.destroy();
  });

  test('der Verlaufspfad ist einmal adressierbar', () => {
    const { chart, svg } = mount(fixtureConfig());
    assertEqual(parts(svg, 'line').length, 1, 'ein Pfad');
    assertEqual(parts(svg, 'line')[0].tagName.toLowerCase(), 'path', 'Pfad bleibt <path>');
    chart.destroy();
  });

  test('jeder Datenpunkt traegt data-part="point", in Zeichenreihenfolge der x-Achse', () => {
    // Die Reihenfolge IST die Adresse eines Punktes — und sie zählt ab 1 wie
    // die x-Achse, nicht ab 0.
    const { chart, svg } = mount(fixtureConfig());
    assertEqual(parts(svg, 'point').length, 5, 'fünf Punkte');
    chart.destroy();
  });

  test('Luecken in der Reihe zeichnen keinen Punkt und verschieben die Adressen entsprechend', () => {
    const { chart, svg } = mount(fixtureConfig({ values: [1, null, 3, 4, 5] }));
    assertEqual(parts(svg, 'point').length, 4, 'vier gezeichnete Punkte');
    chart.destroy();
  });

  test('eine leere Reihe zeichnet nichts Adressierbares', () => {
    const { chart, svg } = mount(fixtureConfig({ values: [], median: 0 }));
    assertEqual(parts(svg, 'point').length, 0, 'keine Punkte');
    assertEqual(parts(svg, 'line').length, 0, 'kein Pfad');
    chart.destroy();
  });
});

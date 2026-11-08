/**
 * Widget stats-table — Zeichnen über renderStatsTable, Dezimalkomma nach Sprache,
 * Konfidenzniveau im Kopf, Reihen ohne Farbschlüssel.
 */
import Alpine from '../../vendor/alpinejs/csp.js';
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { computeSeriesStats } from '../../js/core/stats-panel.js';
import { mount as mountStatsTable } from '../../js/widgets/stats-table/mount.js';

const i18n = { t: (k, p) => (p ? `${k}|${p.n}` : k), getLanguage: () => 'de' };
const flush = () => new Promise((r) => setTimeout(r, 0));

async function host(extra = {}) {
  if (!Alpine.version) Alpine.start();
  registerWidgetDirective(Alpine, { i18n, widgets: WIDGETS });
  const services = { eventBus: null, stateManager: null, i18n, chartManager: null, instanceId: 'i1', moduleId: 'demo' };
  const name = `st${Math.random().toString(36).slice(2)}`;
  Alpine.data(name, () => {
    const comp = {
      model: { confLevel: 95 },
      get stats() { return computeSeriesStats([{ name: 'A', values: [1, 2, 3, 4], color: '#f00', visible: true }]); },
      ...extra,
    };
    Object.defineProperty(comp, '_ui', { enumerable: false, get() { return { services }; } });
    return comp;
  });
  const root = document.createElement('div');
  root.setAttribute('x-data', name);
  root.innerHTML = '<div class="t" x-widget="stats-table" x-widget-rows="stats" x-widget-conf-level="model.confLevel"></div>';
  document.body.append(root);
  const ow = console.warn; const seen = []; console.warn = (...a) => seen.push(a.join(' '));
  Alpine.initTree(root);
  await flush(); await flush();
  console.warn = ow; if (seen.length) throw new Error('WARN ' + seen.join(' || '));
  return { root, data: Alpine.$data(root) };
}

suite('Widget stats-table', () => {
  test('zeichnet die Tabelle mit Dezimalkomma', async () => {
    const { root } = await host();
    assertEqual(root.querySelector('td[data-stat="mean"]').textContent.startsWith('2,5000'), true);
    assertTrue(root.querySelector('.widget-root').classList.contains('dmike-stats-panel'));
    root.remove();
  });

  test('confLevel ändern zeigt den neuen Wert im Intervalltitel', async () => {
    const { root, data } = await host();
    assertEqual(root.querySelector('.dmike-stats-ci').getAttribute('title'), 'common.statsPanel.ciTitle|95');
    data.model.confLevel = 90;
    await flush();
    assertEqual(root.querySelector('.dmike-stats-ci').getAttribute('title'), 'common.statsPanel.ciTitle|90');
    root.remove();
  });

  test('Reihe ohne color-Schlüssel (nach JSON-Klon) bindet ohne Fehler', async () => {
    const { root } = await host({
      get stats() { return [{ name: 'B', stats: null, ci: {} }]; },
    });
    assertEqual(root.querySelectorAll('tbody tr').length, 1);
    root.remove();
  });

  test('Farbfeld: ohne color kein Hintergrund, mit color gesetzt', async () => {
    const { root } = await host({
      get stats() { return [{ name: 'B', stats: null, ci: {} }, { name: 'C', color: '#ff0000', stats: null, ci: {} }]; },
    });
    const swatches = root.querySelectorAll('tbody tr .dmike-stats-color');
    assertEqual(swatches.length, 2, 'ein Farbfeld je Zeile');
    assertEqual(swatches[0].getAttribute('style'), null, 'ohne color kein style-Attribut');
    assertTrue(swatches[1].getAttribute('style').includes('#ff0000'), 'mit color gesetzt');
    root.remove();
  });

  test('destroy entfernt Klasse und display vom Wirtselement', () => {
    const root = document.createElement('div');
    const handle = mountStatsTable(root, {
      props: { rows: [], confLevel: 95 },
      services: { i18n },
      effect: (fn) => fn(),
    });
    assertTrue(root.classList.contains('dmike-stats-panel'));
    assertEqual(root.style.display, 'none', 'mount blendet die leere Tabelle aus');
    handle.destroy();
    assertEqual(root.classList.contains('dmike-stats-panel'), false);
    assertEqual(root.style.display, '');
  });
});

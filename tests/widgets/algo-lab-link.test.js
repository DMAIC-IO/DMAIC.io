/**
 * Widget algo-lab-link — Knopf zum Algorithm Lab: Titel nach Sprache,
 * Navigationsereignis, Klick bleibt am Knopf, leere id ohne Knopf.
 */
import Alpine from '../../vendor/alpinejs/csp.js';
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function host(algoId) {
  if (!Alpine.version) Alpine.start();
  const lang = Alpine.reactive({ v: 'de' });
  const emitted = [];
  const i18n = { t: (k) => `${lang.v}:${k}`, getLanguage: () => lang.v };
  registerWidgetDirective(Alpine, { i18n, widgets: WIDGETS });
  const services = { eventBus: { emit: (...a) => emitted.push(a) }, stateManager: null, i18n, chartManager: null, instanceId: 'i1', moduleId: 'demo' };
  const name = `al${Math.random().toString(36).slice(2)}`;
  Alpine.data(name, () => {
    const comp = { id: algoId };
    Object.defineProperty(comp, '_ui', { enumerable: false, get() { return { services }; } });
    return comp;
  });
  const parent = document.createElement('div');
  const seen = [];
  parent.addEventListener('click', () => seen.push('parent'));
  const root = document.createElement('div');
  root.setAttribute('x-data', name);
  root.innerHTML = '<span class="t" x-widget="algo-lab-link" x-widget-algo-id="id"></span>';
  parent.append(root);
  document.body.append(parent);
  Alpine.initTree(root);
  await flush(); await flush();
  return { root, parent, lang, emitted, seen, data: Alpine.$data(root) };
}

suite('Widget algo-lab-link', () => {
  test('zeichnet genau einen Knopf mit id, Symbol und Titel', async () => {
    const { root, parent } = await host('grr');
    const btns = root.querySelectorAll('button.dmike-algo-link[data-algo-id="grr"]');
    assertEqual(btns.length, 1);
    assertEqual(btns[0].getAttribute('type'), 'button');
    assertEqual(btns[0].title, 'de:common.algoLabTitle');
    assertEqual(btns[0].getAttribute('aria-label'), 'de:common.algoLabTitle');
    assertTrue(btns[0].querySelector('.icon.icon--sm.icon--text[data-icon="nav.algorithm-lab"]') !== null);
    parent.remove();
  });

  test('Klick sendet lab:navigate und erreicht das Elternelement nicht', async () => {
    const { root, parent, emitted, seen } = await host('grr');
    root.querySelector('button').click();
    assertDeepEqual(emitted, [['lab:navigate', { algoId: 'grr', tab: 'docs' }]]);
    assertEqual(seen.length, 0);
    parent.remove();
  });

  test('leere oder fehlende id: kein Knopf', async () => {
    for (const v of [null, '']) {
      const { root, parent } = await host(v);
      assertEqual(root.querySelectorAll('.t button').length, 0);
      parent.remove();
    }
  });

  test('Sprachwechsel setzt den Titel neu', async () => {
    const { root, parent, lang } = await host('grr');
    lang.v = 'en';
    await flush();
    assertEqual(root.querySelector('button').title, 'en:common.algoLabTitle');
    parent.remove();
  });
});

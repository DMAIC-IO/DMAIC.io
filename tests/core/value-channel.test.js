/**
 * Wertkanal (core/value-channel.js) — Pfad auflösen, lesen, prüfend schreiben, Ablehnung.
 */
import Alpine from '../../vendor/alpinejs/csp.js';
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { defineModel, number } from '../../js/core/model.js';
import { openChannel, anchorHelp, isNumeric } from '../../js/core/value-channel.js';

const i18n = { t: (k, p) => (p ? `${k}:${JSON.stringify(p)}` : k), getLanguage: () => 'de' };
const Doc = defineModel({
  fields: { n: number({ min: 0, max: 10, default: 1 }) },
  invariants: { small: { fields: ['n'], test(m) { return m.n !== 7; } } },
});
const flush = () => new Promise((r) => setTimeout(r, 0));

async function host() {
  if (!Alpine.version) Alpine.start();
  const name = `vc${Math.random().toString(36).slice(2)}`;
  Alpine.data(name, () => ({ model: new Doc(), moduleId: 'demo' }));
  const root = document.createElement('div');
  root.setAttribute('x-data', name);
  const el = document.createElement('div');
  root.append(el);
  document.body.append(root);
  Alpine.initTree(root);
  await flush();
  return { root, el, data: Alpine.$data(el) };
}

suite('value-channel', () => {
  test('liest und schreibt über den prüfenden Setter', async () => {
    const { root, el, data } = await host();
    const ch = openChannel(Alpine, el, 'model.n', { where: 'test', i18n });
    assertEqual(ch.get(), 1);
    assertTrue(ch.set(5));
    assertEqual(data.model.n, 5);
    assertEqual(ch.rejected.message, '');
    assertEqual(ch.helpKey, 'fields.n.help');
    root.remove();
  });

  test('Ablehnung: false, Model bleibt, Meldung mit Bereich', async () => {
    const { root, el, data } = await host();
    const ch = openChannel(Alpine, el, 'model.n', { where: 'test', i18n });
    assertEqual(ch.set(99), false);
    assertEqual(data.model.n, 1);
    assertTrue(ch.rejected.message.startsWith('common.inputRejected'));
    assertEqual(ch.rejected.invariant, null);
    assertEqual(JSON.stringify(ch.rejected.fields), '["n"]', 'Feldregel: das Wurzelfeld');
    assertTrue(ch.set(3));
    assertEqual(ch.rejected.message, '');
    assertEqual(ch.rejected.invariant, null);
    root.remove();
  });

  test('Invariante: Hinweis aus modules.<id>.invariants.<name>', async () => {
    const { root, el } = await host();
    const ch = openChannel(Alpine, el, 'model.n', { where: 'test', i18n });
    assertEqual(ch.set(7), false);
    assertEqual(ch.rejected.message, 'modules.demo.invariants.small');
    assertEqual(ch.rejected.invariant, 'small');
    assertEqual(JSON.stringify(ch.rejected.fields), '["n"]', 'Invariante: ihre Felder');
    root.remove();
  });

  test('anchorHelp setzt den Anker nur, wenn er fehlt', async () => {
    const { root, el, data } = await host();
    anchorHelp(el, data, 'fields.n.help');
    assertEqual(el.getAttribute('data-help-key'), 'modules.demo.fields.n.help');
    el.setAttribute('data-help-key', '');
    anchorHelp(el, data, 'fields.n.help');
    assertEqual(el.getAttribute('data-help-key'), '');
    root.remove();
  });

  test('isNumeric: number und index', () => {
    assertTrue(isNumeric({ kind: 'number' }));
    assertTrue(isNumeric({ kind: 'index' }));
    assertEqual(isNumeric({ kind: 'text' }), false);
  });

  test('rejected entsteht erst, wenn ein Hinweis gezeigt wird', async () => {
    const { root, el } = await host();
    const desc = Object.getOwnPropertyDescriptor(Alpine, 'reactive');
    const orig = Alpine.reactive;
    let reactives = 0;
    Object.defineProperty(Alpine, 'reactive', { configurable: true, value: (...a) => { reactives++; return orig(...a); } });
    try {
      const ch = openChannel(Alpine, el, 'model.n', { where: 'test', i18n });
      assertTrue(ch.set(4));
      assertEqual(reactives, 0);
      assertEqual(ch.set(99), false);
      assertEqual(reactives, 1);
      assertTrue(ch.rejected.message.startsWith('common.inputRejected'));
      assertTrue(ch.set(3));
      assertEqual(ch.rejected.message, '');
      assertEqual(reactives, 1);
    } finally { Object.defineProperty(Alpine, 'reactive', desc); }
    root.remove();
  });
});

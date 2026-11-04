/**
 * I18n: Katalogtexte (js/modules/catalog.<lang>.json) und Sprach-Haken —
 * braucht document (setLanguage → _updateDOM) und fetch, darum im Browser.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { I18n } from '../../js/core/i18n.js';

/** fetch für die Dauer von fn ersetzen; liefert die angefragten URLs. */
async function withFetch(routes, fn) {
  const original = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    seen.push(u);
    const key = Object.keys(routes).find((k) => u.startsWith(k));
    if (!key) return new Response('', { status: 404 });
    return new Response(JSON.stringify(routes[key]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try { await fn(); } finally { globalThis.fetch = original; }
  return seen;
}

suite('I18n: Katalogtexte und Sprach-Haken', () => {
  test('loadLanguage holt catalog.<lang>.json mit und mischt es unter modules.<id>', async () => {
    const i18n = new I18n('de');
    const seen = await withFetch({
      'i18n/de.json': { modules: { alt: { name: 'Alt' } } },
      'js/modules/catalog.de.json': { neu: { name: 'Neu', description: 'Kurz', whenToUse: 'Wann' } },
    }, () => i18n.loadLanguage('de'));
    assertEqual(i18n._resolve('modules.neu.name', 'de'), 'Neu');
    assertEqual(i18n._resolve('modules.alt.name', 'de'), 'Alt');
    const v = document.querySelector('meta[name="i18n-version"]')?.content;
    const q = v ? `?v=${v}` : '';
    assertDeepEqual(seen.sort(), [`i18n/de.json${q}`, `js/modules/catalog.de.json${q}`].sort());
  });

  test('loadLanguage ohne Katalogdatei: Sprache trotzdem geladen', async () => {
    const i18n = new I18n('de');
    const errors = [];
    const orig = console.error;
    console.error = (...a) => errors.push(a.join(' '));
    try {
      await withFetch({ 'i18n/en.json': { greeting: 'Hello' } }, () => i18n.loadLanguage('en'));
    } finally { console.error = orig; }
    assertEqual(i18n._resolve('greeting', 'en'), 'Hello');
    assertEqual(errors.length, 1);
  });

  test('setLanguage wartet auf Haken, bevor language:changed kommt', async () => {
    const i18n = new I18n('de');
    i18n._cache.set('de', {}); i18n._cache.set('en', {});
    const order = [];
    i18n.connect({ emit: (name) => order.push(`event:${name}`) }, null);
    i18n.addLanguageHook(async (lang) => {
      await new Promise((r) => setTimeout(r, 5));
      i18n.mergeModule('neu', lang, { col: 'Column' });
      order.push(`hook:${lang}`);
    });
    await i18n.setLanguage('en');
    assertDeepEqual(order, ['hook:en', 'event:language:changed']);
    assertEqual(i18n.t('modules.neu.col'), 'Column');
  });
});

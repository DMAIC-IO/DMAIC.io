/**
 * Tests for js/core/module-resources.js — Templates (XHR document), CSS
 * (<link>) und UI-Texte eines Moduls in neuer Form nachladen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { ModuleResources, readModuleResources, fetchDocument } from '../../js/core/module-resources.js';
import { I18n } from '../../js/core/i18n.js';
import { ModuleRegistry } from '../../js/core/module-registry.js';

const FIX = (file) => new URL(`../fixtures/module-resources/probe/${file}`, import.meta.url).href;

const MANIFEST = {
  probe: {
    templates: FIX('templates.html'),
    style: FIX('style.css'),
    files: { 'i18n/ui.de.json': FIX('ui.de.json'), 'i18n/ui.en.json': FIX('ui.en.json') },
  },
};

function makeI18n(lang = 'de') {
  const i18n = new I18n(lang);
  i18n._cache.set('de', {}); i18n._cache.set('en', {});
  return i18n;
}

/**
 * Alpines `initInterceptors` (vendor/alpinejs/csp.js) im Kleinen: steigt über
 * aufzählbare eigene Eigenschaften in Objekte hinab, überspringt `__v_skip`
 * und nur die direkte Selbstreferenz. Gibt die erreichte Tiefe zurück; über
 * `limit` heißt: ein Kreis, Alpine liefe in den Stapelüberlauf.
 */
function interceptorDepth(obj, limit = 200, depth = 0) {
  if (depth > limit) return depth;
  let max = depth;
  for (const { value, enumerable } of Object.values(Object.getOwnPropertyDescriptors(obj))) {
    if (!enumerable || value === undefined) continue;
    if (typeof value === 'object' && value !== null && value.__v_skip) continue;
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && value !== obj && !(value instanceof Element)) {
      max = Math.max(max, interceptorDepth(value, limit, depth + 1));
      if (max > limit) return max;
    }
  }
  return max;
}

function cleanup() {
  document.querySelectorAll('template[data-tpl^="js/modules/probe/"]').forEach((t) => t.remove());
  document.querySelectorAll(`link[href="${FIX('style.css')}"]`).forEach((l) => l.remove());
}

suite('ModuleResources', () => {
  test('ist nicht reaktiv (__v_skip): Alpine steigt nicht über die Registry in i18n/stateManager hinab', () => {
    const i18n = makeI18n();
    const resources = new ModuleResources({ manifest: MANIFEST, i18n });
    assertEqual(resources.__v_skip, true);
    // Verdrahtung wie in bootKernel: stateManager → Registry → Resources → i18n → stateManager.
    const registry = new ModuleRegistry();
    registry.setResources(resources);
    const stateManager = { _moduleRegistry: registry };
    i18n.connect(null, stateManager);
    // Ein Viewmodel, das den Modulkontext als Feld hält (ishikawa, doe-planner, survey-builder).
    const data = { vm: { deps: { context: { stateManager, i18n } } } };
    assertTrue(interceptorDepth(data) < 20, 'kein Kreis über ModuleResources');
  });

  test('readModuleResources liest den JSON-Block, sonst {}', () => {
    const doc = document.implementation.createHTMLDocument('');
    assertDeepEqual(readModuleResources(doc), {});
    const s = doc.createElement('script');
    s.type = 'application/json'; s.id = 'module-resources'; s.textContent = '{"a":{"templates":"t","files":{}}}';
    doc.head.append(s);
    assertDeepEqual(readModuleResources(doc), { a: { templates: 't', files: {} } });
    s.textContent = 'kaputt';
    assertDeepEqual(readModuleResources(doc), {});
  });

  test('fetchDocument liefert ein Dokument mit den Templates; Umlaute und <tr> bleiben', async () => {
    const doc = await fetchDocument(FIX('templates.html'));
    const view = doc.querySelector('template[data-tpl="js/modules/probe/resources/view.html"]');
    assertTrue(Boolean(view));
    assertTrue(Boolean(view.content.querySelector('tr.probe-row')), '<tr> im Template erhalten');
    assertEqual(view.content.querySelector('td').textContent, 'Größe');
  });

  test('prepare: Templates im Dokument, Stylesheet aktiv, UI-Texte der aktiven Sprache', async () => {
    cleanup();
    const i18n = makeI18n('de');
    const res = new ModuleResources({ manifest: MANIFEST, i18n });
    await res.prepare('probe');
    assertTrue(Boolean(document.querySelector('template[data-tpl="js/modules/probe/resources/view.html"]')));
    assertTrue(Boolean(document.querySelector('template[data-tpl="js/modules/probe/resources/tile.html"]')));
    const probe = document.createElement('section');
    probe.className = 'probe-view';
    document.body.append(probe);
    assertEqual(getComputedStyle(probe).marginLeft, '3px');
    probe.remove();
    assertEqual(i18n.t('modules.probe.col'), 'Spalte');
    assertEqual(i18n._resolve('modules.probe.col', 'en'), undefined, 'nur die aktive Sprache');
    cleanup();
  });

  test('prepare lädt je Modul nur einmal', async () => {
    cleanup();
    let docs = 0;
    const res = new ModuleResources({ manifest: MANIFEST, i18n: makeI18n(),
      loaders: { fetchDocument: (url) => { docs++; return fetchDocument(url); } } });
    await Promise.all([res.prepare('probe'), res.prepare('probe')]);
    await res.prepare('probe');
    assertEqual(docs, 1);
    assertEqual(document.querySelectorAll('template[data-tpl="js/modules/probe/resources/view.html"]').length, 1);
    cleanup();
  });

  test('prepare: Fehlschlag wird nicht gespeichert', async () => {
    cleanup();
    let fail = true;
    const res = new ModuleResources({ manifest: MANIFEST, i18n: makeI18n(),
      loaders: { fetchDocument: (url) => (fail ? Promise.reject(new Error('net')) : fetchDocument(url)) } });
    let threw = false;
    try { await res.prepare('probe'); } catch { threw = true; }
    assertTrue(threw);
    fail = false;
    await res.prepare('probe');
    assertTrue(Boolean(document.querySelector('template[data-tpl="js/modules/probe/resources/view.html"]')));
    cleanup();
  });

  test('prepare für ein unbekanntes Modul wirft', async () => {
    const res = new ModuleResources({ manifest: {}, i18n: makeI18n() });
    let msg = '';
    try { await res.prepare('nope'); } catch (e) { msg = e.message; }
    assertEqual(msg, '[module-resources] nope: nicht in #module-resources');
  });

  test('loadLanguage lädt die UI-Texte vorbereiteter Module nach', async () => {
    cleanup();
    const i18n = makeI18n('de');
    const res = new ModuleResources({ manifest: MANIFEST, i18n });
    await res.prepare('probe');
    await res.loadLanguage('en');
    assertEqual(i18n._resolve('modules.probe.col', 'en'), 'Column');
    cleanup();
  });

  test('has und url', () => {
    const res = new ModuleResources({ manifest: MANIFEST, i18n: makeI18n() });
    assertTrue(res.has('probe'));
    assertEqual(res.has('nope'), false);
    assertEqual(res.url('probe', 'i18n/ui.en.json'), FIX('ui.en.json'));
    assertEqual(res.url('probe', 'i18n/help.de.json'), undefined);
  });

  test('prepare während eines laufenden setLanguage: Texte der Zielsprache sind danach da', async () => {
    cleanup();
    const i18n = makeI18n('de');
    const res = new ModuleResources({ manifest: MANIFEST, i18n });
    i18n.addLanguageHook((lang) => res.loadLanguage(lang));
    let release;
    i18n.addLanguageHook(() => new Promise((r) => { release = r; }));
    const switching = i18n.setLanguage('en');
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const preparing = res.prepare('probe');
    await preparing;
    release();
    await switching;
    assertEqual(i18n.t('modules.probe.col'), 'Column');
    cleanup();
  });

  test('erneutes prepare nach Teil-Fehlschlag hängt das Stylesheet nicht doppelt an', async () => {
    cleanup();
    let fail = true;
    const res = new ModuleResources({ manifest: MANIFEST, i18n: makeI18n(),
      loaders: { fetchDocument: (url) => (fail ? Promise.reject(new Error('net')) : fetchDocument(url)) } });
    try { await res.prepare('probe'); } catch { /* erwartet */ }
    fail = false;
    await res.prepare('probe');
    assertEqual(document.querySelectorAll(`link[href="${FIX('style.css')}"]`).length, 1);
    cleanup();
  });
});

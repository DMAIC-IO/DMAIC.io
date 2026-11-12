/**
 * Ishikawa: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem echten
 * Modul, der echten Vorlage resources/view.html und Attrappen für
 * stateManager, Event-Bus, Dialog und Meldungen. Prüft das Gerüst (Reiter über
 * x-tablist, Route), die Bildgalerien (Hinzufügen über x-file-drop, Größe,
 * Lightbox) und dass große Bilder einen Neuaufbau der Komponente überstehen.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import Alpine from '../../../vendor/alpinejs/csp.js';
import mod from '../../../js/modules/ishikawa/viewmodel/viewmodel.js';
import { registerTablistDirective } from '../../../js/core/tablist.js';
import { registerFileDropDirective } from '../../../js/core/file-drop-directive.js';
import { registerFieldDirective } from '../../../js/core/field-directive.js';
import { registerCommandDirectives } from '../../../js/core/command-directives.js';
import { registerWidgetDirective } from '../../../js/core/widget-directive.js';
import { registerRouteDirectives, setRouteStore } from '../../../js/core/router/route-store.js';
import { WIDGETS } from '../../../js/widgets/registry.js';
import { WIDGET_I18N } from '../../widget-i18n.js';

const ID = 'ishikawa';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 4; i++) await flush(); };
/** Wartet, bis `ok()` gilt; höchstens zwei Sekunden. */
async function until(ok) {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
}
const mounted = [];
let ready = false;
/** Ziele von `$route.go` (Adresse). */
const routed = [];

/** Texte mit Parametern sichtbar; sonst der Schlüssel. */
const tf = (k, p) => (p ? `${k}${JSON.stringify(p)}` : k);

/** Echte Vorlage unter ihrem Schlüssel; Direktiven wie in app.js. */
async function ensureTemplate() {
  if (ready) return;
  registerTablistDirective(Alpine);
  registerFileDropDirective(Alpine);
  registerFieldDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
  registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
  registerCommandDirectives(Alpine);
  registerRouteDirectives(Alpine, { onGo: (sub) => routed.push(sub) });
  if (!Alpine.version) Alpine.start();
  if (!document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) {
    const html = await (await fetch(new URL(`../../../${TPL_KEY}`, import.meta.url), { cache: 'no-cache' })).text();
    const tpl = document.createElement('template');
    tpl.setAttribute('data-tpl', TPL_KEY);
    tpl.innerHTML = html;
    document.body.append(tpl);
  }
  ready = true;
}

/**
 * Modul einhängen.
 * @param {object|null} [model] gespeicherter Zustand der Instanz
 */
async function mount(model = null) {
  await ensureTemplate();
  routed.length = 0;
  while (mounted.length) mounted.pop().remove();
  const states = { 'ish-1': model };
  const notes = [];
  const shows = [];
  const confirms = [];
  const handlers = [];
  const bus = {
    on: (n, fn) => handlers.push([n, fn]),
    off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (n, p) => { for (const [a, f] of [...handlers]) if (a === n) f(p); },
  };
  const lang = { current: 'de' };
  const context = {
    instanceId: 'ish-1',
    stateManager: {
      get: () => undefined,
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'dmaic',
    },
    i18n: { t: (k) => k, tf: () => tf, getLanguage: () => lang.current },
    eventBus: bus,
    notify: (msg, type) => notes.push([msg, type]),
    dialog: {
      confirm: async (opts) => { confirms.push(opts); return true; },
      show(opts) {
        shows.push(opts);
        return { close: () => opts.onClose?.(), setTitle() {} };
      },
    },
    theme: 'light',
    get language() { return lang.current; },
  };
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  await mod.init(container, context);
  await settle();
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  return { container, vm, notes, shows, confirms, states, lang, $: (s) => container.querySelector(s), $$: (s) => [...container.querySelectorAll(s)] };
}

/**
 * Ein echtes PNG (Leinwand), als Datei.
 * @param {string} name @returns {Promise<File>}
 */
async function pngFile(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 8;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgb(200, 30, 30)';
  g.fillRect(0, 0, 8, 8);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  return new File([blob], name, { type: 'image/png' });
}

suite('ishikawa view: Gerüst, Reiter, Problem', () => {
  test('Modul hängt ein: vier Reiter, Problem aktiv', async () => {
    const h = await mount();
    assertTrue(h.$('.ishikawa') !== null, 'kein Modulcontainer');
    assertDeepEqual(h.$$('[role="tab"]').map((b) => b.dataset.tab), ['problem', 'facts', 'hypotheses', 'experiments']);
    assertEqual(h.vm().state.tab, 'problem');
    assertEqual(h.$('[role="tab"][aria-selected="true"]').dataset.tab, 'problem');
    assertTrue(h.$('.ishikawa__problem-tab') !== null, 'Problem-Bereich fehlt');
  });

  test('Reiter über x-tablist: Klick setzt state.tab, aria-selected folgt', async () => {
    const h = await mount();
    h.$('[role="tab"][data-tab="facts"]').click();
    await settle();
    assertEqual(h.vm().state.tab, 'facts');
    assertEqual(h.$('[role="tab"][aria-selected="true"]').dataset.tab, 'facts');
    assertEqual(h.$('.ishikawa__problem-tab'), null);
  });

  test('Reiterwechsel schreibt die Adresse; eine andere angezeigte Instanz nicht', async () => {
    const h = await mount();
    try {
      setRouteStore(Alpine, { kind: 'module', instanceId: 'ish-1', sub: [] });
      h.$('[role="tab"][data-tab="experiments"]').click();
      await settle();
      assertDeepEqual(routed, [['experiments']]);
      setRouteStore(Alpine, { kind: 'module', instanceId: 'other', sub: [] });
      h.$('[role="tab"][data-tab="facts"]').click();
      await settle();
      assertEqual(h.vm().state.tab, 'facts');
      assertDeepEqual(routed, [['experiments']]);
    } finally {
      setRouteStore(Alpine, {});
    }
  });

  test('onRouteChanged: bekannter Reiter wird aktiv, unbekannter Name und leere Route ändern nichts', async () => {
    const h = await mount();
    h.vm().onRouteChanged(['facts']);
    assertEqual(h.vm().state.tab, 'facts');
    h.vm().onRouteChanged(['nope']);
    assertEqual(h.vm().state.tab, 'facts');
    h.vm().onRouteChanged([]);
    assertEqual(h.vm().state.tab, 'facts');
    h.vm().onRouteChanged(['experiments', 'x']);
    assertEqual(h.vm().state.tab, 'experiments');
  });

  test('Problemtext über x-model', async () => {
    const h = await mount();
    const ta = h.$('.ishikawa__problem-textarea');
    ta.value = 'Ausschuss steigt';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    assertEqual(h.vm().model.problem, 'Ausschuss steigt');
  });

  test('addImages: Bild als Daten-URL in die Galerie, leere Unterschrift; Nicht-Bilder fallen weg', async () => {
    const h = await mount();
    await h.vm().addImages([await pngFile('a.png'), new File(['x'], 'b.txt', { type: 'text/plain' })], { scope: 'outScope' });
    await settle();
    const imgs = h.vm().model.images.outScope;
    assertEqual(imgs.length, 1);
    assertTrue(imgs[0].dataUrl.startsWith('data:image/'), imgs[0].dataUrl.slice(0, 30));
    assertEqual(imgs[0].caption, '');
    assertEqual(h.vm().model.images.inScope.length, 0);
    assertEqual(h.$$('.ishikawa__img-gallery--out .ishikawa__img-card').length, 1);
  });

  test('Ablegen auf der Galerie ruft addImages mit der Galerie', async () => {
    const h = await mount();
    const zone = h.$('.ishikawa__img-gallery--in');
    const e = new Event('drop', { bubbles: true, cancelable: true });
    e.dataTransfer = { files: [await pngFile('c.png')] };
    zone.dispatchEvent(e);
    await until(() => h.vm().model.images.inScope.length === 1);
    assertEqual(h.vm().model.images.inScope.length, 1);
    assertEqual(h.vm().model.images.outScope.length, 0);
  });

  test('imageSize: Typ aus dem Präfix, Zahl im Format der Sprache', async () => {
    const h = await mount();
    const vm = h.vm();
    assertEqual(vm.imageSize({ dataUrl: `data:image/svg+xml;base64,${'A'.repeat(4)}` }), 'imageSizeBytes{"size":"3"}');
    assertEqual(vm.imageSize({ dataUrl: `data:image/png;base64,${'A'.repeat(4)}` }), 'imageSizeBytes{"size":"3"}');
    assertEqual(vm.imageSize({ dataUrl: `data:image/png;base64,${'A'.repeat(1646080)}` }), 'imageSizeKb{"size":"1.206"}');
  });

  test('openLightbox: state.lightbox, Inhalt über ctx.dialog; Schließen räumt auf', async () => {
    const h = await mount({
      _schema: { version: '1.0' },
      images: { inScope: [{ id: 4, dataUrl: 'data:image/png;base64,AAAA', caption: 'Riss' }], outScope: [] },
    });
    h.vm().openLightbox('inScope', 4);
    await settle();
    assertDeepEqual(h.vm().state.lightbox, { scope: 'inScope', id: 4 });
    assertEqual(h.shows.length, 1);
    assertEqual(h.shows[0].title, 'openImage');
    const content = h.shows[0].content;
    assertTrue(content.classList.contains('ishikawa__img-lightbox'), content.className);
    assertEqual(content.querySelector('img').getAttribute('src'), 'data:image/png;base64,AAAA');
    assertEqual(content.querySelector('.ishikawa__img-lightbox-caption').textContent, 'Riss');
    h.shows[0].onClose();
    assertEqual(h.vm().state.lightbox, null);
  });

  test('openLightbox mit unbekanntem Bild öffnet nichts', async () => {
    const h = await mount();
    h.vm().openLightbox('inScope', 99);
    h.vm().openLightbox('nope', 1);
    await settle();
    assertEqual(h.shows.length, 0);
    assertEqual(h.vm().state.lightbox, null);
  });

  test('Klick auf ein Vorschaubild öffnet die Lightbox', async () => {
    const h = await mount({
      _schema: { version: '1.0' },
      images: { inScope: [], outScope: [{ id: 2, dataUrl: 'data:image/png;base64,AAAA', caption: '' }] },
    });
    h.$('.ishikawa__img-gallery--out .ishikawa__img-thumb').click();
    await settle();
    assertDeepEqual(h.vm().state.lightbox, { scope: 'outScope', id: 2 });
  });

  test('Löschen über x-command: die Zahl-id erreicht die Rückfrage, danach ist das Bild weg', async () => {
    const h = await mount({
      _schema: { version: '1.0' },
      images: { inScope: [{ id: 1, dataUrl: 'data:image/png;base64,AAAA', caption: 'Riss' }], outScope: [] },
    });
    h.$('.ishikawa__img-gallery--in .ishikawa__img-del').click();
    await until(() => h.vm().model.images.inScope.length === 0);
    assertEqual(h.confirms.length, 1);
    assertTrue(JSON.stringify(h.confirms[0]).includes('delImageConfirm'), JSON.stringify(h.confirms[0]));
    assertEqual(h.vm().model.images.inScope.length, 0);
    assertDeepEqual(h.notes.filter(([, type]) => type === 'error'), []);
  });

  test('Bild über 1 MB übersteht den Neuaufbau der Komponente', async () => {
    const h = await mount();
    const big = `data:image/png;base64,${'A'.repeat(1_400_000)}`;
    h.vm().model.addImage({ scope: 'inScope', dataUrl: big, caption: 'groß' });
    await settle();
    h.lang.current = 'en';
    mod.onLanguageChange();
    await settle();
    const imgs = h.vm().model.images.inScope;
    assertEqual(imgs.length, 1);
    assertEqual(imgs[0].dataUrl.length, big.length);
    assertEqual(imgs[0].caption, 'groß');
    assertEqual(h.$$('.ishikawa__img-gallery--in .ishikawa__img-card').length, 1);
  });
});

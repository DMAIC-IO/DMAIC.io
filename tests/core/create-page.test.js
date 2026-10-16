import { suite, test, assertEqual, beforeEach, afterEach } from '../test-utils.js';
import { createPage } from '../../js/core/create-page.js';
import { setChunkErrorHandler } from '../../js/core/chunks.js';

function makeBus() {
  const map = new Map();
  return {
    on(ev, cb) { (map.get(ev) || map.set(ev, []).get(ev)).push(cb); },
    off(ev, cb) { const a = map.get(ev) || []; const i = a.indexOf(cb); if (i >= 0) a.splice(i, 1); },
    emit(ev, ...args) { (map.get(ev) || []).slice().forEach(cb => cb(...args)); },
  };
}

const fakeI18n = { t: (k) => k, tf: () => (k) => k };

// NOTE: beforeEach/afterEach in this framework are suite-scoped — they only
// register when called inside the suite() callback (where _currentSuite is set).
suite('createPage — lifecycle', () => {
  let container, button, bus, page;

  let tplEl;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'cp-test-area';
    container.style.display = 'none';
    button = document.createElement('button');
    button.id = 'cp-test-btn';
    document.body.append(container, button);
    // Inline the page template (cloneTemplate contract — no fetch). templateKey()
    // resolves the relative URL against baseURI and slices from /js/ → this key.
    tplEl = document.createElement('template');
    tplEl.setAttribute('data-tpl', 'js/pages/cp-test/cp-test.html');
    tplEl.innerHTML = '<section x-data="cpTest"><span x-text="hello()"></span><em x-text="t(\'lbl\')"></em></section>';
    document.body.append(tplEl);
    bus = makeBus();
    page = createPage({
      id: 'cp-test',
      // No i18nKey → exercises the bare-t fallback (_t = (k,p) => i18n.t(k,p)).
      templateUrl: 'js/pages/cp-test/cp-test.html',
      container: '#cp-test-area',
      button: '#cp-test-btn',
      overlay: 'cp-test',
      data(_ctx, t) { return { hello: () => 'hi', greet: () => t('lbl') }; },
    });
  });

  afterEach(() => {
    page.destroy();
    container.remove();
    button.remove();
    tplEl.remove();
  });

  test('starts closed and hidden', async () => {
    await page.init({ i18n: fakeI18n, eventBus: bus });
    assertEqual(page.isOpen(), false);
    assertEqual(container.style.display, 'none');
  });

  test('show() mounts lazily, displays, marks button active, emits overlay:opened', async () => {
    let openedWith = null;
    bus.on('overlay:opened', (id) => { openedWith = id; });
    await page.init({ i18n: fakeI18n, eventBus: bus });
    await page.show();
    assertEqual(page.isOpen(), true);
    assertEqual(container.style.display, '');
    assertEqual(button.classList.contains('btn--active'), true);
    assertEqual(openedWith, 'cp-test');
    assertEqual(container.querySelector('span').textContent, 'hi');
  });

  test('another overlay opening closes this page', async () => {
    await page.init({ i18n: fakeI18n, eventBus: bus });
    await page.show();
    bus.emit('overlay:opened', 'something-else');
    assertEqual(page.isOpen(), false);
    assertEqual(container.style.display, 'none');
  });

  test('toggle() flips open state', async () => {
    await page.init({ i18n: fakeI18n, eventBus: bus });
    await page.toggle();
    assertEqual(page.isOpen(), true);
    await page.toggle();
    assertEqual(page.isOpen(), false);
  });
});

suite('createPage — imperative mount hooks', () => {
  let container, button, bus, page, calls, handle;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'cp-imp-area';
    container.style.display = 'none';
    button = document.createElement('button');
    button.id = 'cp-imp-btn';
    document.body.append(container, button);
    bus = makeBus();
    calls = [];
    handle = { kind: 'lab', destroyed: false };
    page = createPage({
      id: 'cp-imp',
      // No template / templateUrl → purely imperative.
      container: '#cp-imp-area',
      button: '#cp-imp-btn',
      overlay: 'cp-imp',
      bodyClass: 'cp-imp-open',
      mount(el, _ctx) {
        calls.push('mount');
        el.appendChild(document.createElement('span'));
        return handle;
      },
      unmount(el, ctx, h) { calls.push('unmount'); h.destroyed = true; },
      onShow() { calls.push('show'); },
      onHide() { calls.push('hide'); },
    });
  });

  afterEach(() => {
    page.destroy();
    container.remove();
    button.remove();
    document.body.classList.remove('cp-imp-open');
  });

  test('mount runs once on first show; mountHandle() exposes the handle', async () => {
    await page.init({ i18n: fakeI18n, eventBus: bus });
    assertEqual(page.mountHandle(), null);            // not mounted yet
    await page.show();
    assertEqual(calls.includes('mount'), true);
    assertEqual(page.mountHandle(), handle);
    assertEqual(container.querySelector('span') !== null, true);
    // Re-show after hide does not re-mount (instance reused).
    page.hide();
    await page.show();
    assertEqual(calls.filter(c => c === 'mount').length, 1);
  });

  test('onShow / onHide fire at the end of show() / hide()', async () => {
    await page.init({ i18n: fakeI18n, eventBus: bus });
    await page.show();
    assertEqual(calls.includes('show'), true);
    page.hide();
    assertEqual(calls.includes('hide'), true);
  });

  test('unmount runs on destroy with the stored handle', async () => {
    await page.init({ i18n: fakeI18n, eventBus: bus });
    await page.show();
    page.destroy();
    assertEqual(calls.includes('unmount'), true);
    assertEqual(handle.destroyed, true);
    assertEqual(page.mountHandle(), null);            // cleared on destroy
  });

  test('no template + no mount leaves an empty container (no throw)', async () => {
    const bare = createPage({ id: 'cp-bare', container: '#cp-imp-area' });
    await bare.init({ i18n: fakeI18n, eventBus: bus });
    await bare.show();
    assertEqual(container.childElementCount, 0);
    bare.destroy();
  });
});

suite('createPage — load hook', () => {
  let container, tplEl, bus;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'cp-load-area';
    container.style.display = 'none';
    document.body.append(container);
    tplEl = document.createElement('template');
    tplEl.setAttribute('data-tpl', 'js/pages/cp-load/cp-load.html');
    tplEl.innerHTML = '<section x-data="cpLoadComp"><span class="v" x-text="value"></span></section>';
    document.body.append(tplEl);
    bus = makeBus();
  });

  afterEach(() => { container.remove(); tplEl.remove(); });

  const makePage = (load) => createPage({
    id: 'cp-load', templateUrl: 'js/pages/cp-load/cp-load.html', container: '#cp-load-area', load,
  });

  test('registers loaded components before initTree and runs the loaded mount', async () => {
    const order = [];
    const page = makePage(async () => ({
      components: { cpLoadComp: () => ({ value: 'loaded' }) },
      mount(el) { order.push(el.querySelector('.v')?.textContent); return { h: 1 }; },
    }));
    await page.init({ i18n: fakeI18n, eventBus: bus });
    await page.show();
    assertEqual(page.isOpen(), true);
    assertEqual(order[0], 'loaded', 'mount sees hydrated component');
    assertEqual(page.mountHandle().h, 1);
    page.destroy();
  });

  test('concurrent show() calls load and mount once', async () => {
    let loads = 0, mounts = 0;
    const page = makePage(async () => {
      loads++;
      await new Promise((r) => setTimeout(r, 10));
      return { components: { cpLoadComp: () => ({ value: 'x' }) }, mount() { mounts++; } };
    });
    await page.init({ i18n: fakeI18n, eventBus: bus });
    await Promise.all([page.show(), page.show(), page._ensureMounted()]);
    assertEqual(loads, 1);
    assertEqual(mounts, 1);
    page.destroy();
  });

  test('concurrent show() calls open once (one overlay:opened, one onShow)', async () => {
    let onShows = 0;
    const page = createPage({
      id: 'cp-load', templateUrl: 'js/pages/cp-load/cp-load.html', container: '#cp-load-area',
      overlay: 'cp-load', onShow: () => { onShows++; },
      load: async () => {
        await new Promise((r) => setTimeout(r, 10));
        return { components: { cpLoadComp: () => ({ value: 'x' }) } };
      },
    });
    let overlays = 0;
    bus.on('overlay:opened', () => { overlays++; });
    await page.init({ i18n: fakeI18n, eventBus: bus });
    await Promise.all([page.show(), page.show()]);
    assertEqual(onShows, 1, 'onShow once');
    assertEqual(overlays, 1, 'overlay:opened once');
    page.destroy();
  });

  test('destroy() during an in-flight load: nothing mounts afterwards', async () => {
    let mounts = 0;
    let release;
    const page = makePage(() => new Promise((r) => {
      release = () => r({ components: { cpLoadComp: () => ({ value: 'x' }) }, mount() { mounts++; } });
    }));
    await page.init({ i18n: fakeI18n, eventBus: bus });
    const shown = page.show();
    await Promise.resolve();
    page.destroy();
    release();
    await shown;
    assertEqual(mounts, 0, 'stale load does not mount');
    assertEqual(container.childElementCount, 0, 'template not cloned');
    assertEqual(page.isOpen(), false);
  });

  test('a failing load leaves the page closed, the next show() retries', async () => {
    setChunkErrorHandler(() => {});
    let n = 0;
    const page = makePage(() => (++n === 1
      ? Promise.reject(new TypeError('Failed to fetch'))
      : Promise.resolve({ components: { cpLoadComp: () => ({ value: 'ok' }) } })));
    await page.init({ i18n: fakeI18n, eventBus: bus });
    await page.show();
    assertEqual(page.isOpen(), false);
    assertEqual(container.style.display, 'none');
    assertEqual(container.childElementCount, 0, 'template not cloned');
    await page.show();
    assertEqual(page.isOpen(), true);
    setChunkErrorHandler(null);
    page.destroy();
  });
});

suite('createPage — dialog option', () => {
  let container, tplEl, bus, page, opened, langCount;

  /** Minimal dialog service: records show() calls, lends content like the real one. */
  function fakeDialog() {
    return {
      show(opts) {
        const entry = { opts, home: opts.content.parentNode, open: true };
        opened.push(entry);
        document.body.append(opts.content);
        const close = () => {
          if (!entry.open) return;
          entry.open = false;
          entry.home.append(opts.content);
          opts.onClose?.();
        };
        return { close, setTitle: (t) => { entry.opts.title = t; } };
      },
    };
  }

  beforeEach(() => {
    opened = [];
    langCount = 0;
    container = document.createElement('div');
    container.id = 'cp-dlg-area';
    container.style.display = 'none';
    document.body.append(container);
    tplEl = document.createElement('template');
    tplEl.setAttribute('data-tpl', 'js/pages/cp-dlg/cp-dlg.html');
    tplEl.innerHTML = '<div class="cp-dlg__root" x-data="cpDlg"><span x-text="t(\'title\')"></span></div>';
    document.body.append(tplEl);
    bus = makeBus();
    page = createPage({
      id: 'cp-dlg',
      templateUrl: 'js/pages/cp-dlg/cp-dlg.html',
      container: '#cp-dlg-area',
      overlay: 'cp-dlg',
      dialog: { titleKey: 'title' },
      data() { langCount += 1; return {}; },
    });
  });

  afterEach(() => { page.destroy(); container.remove(); tplEl.remove(); });

  let lang = 'de';
  const ctx = () => ({ i18n: { t: (k) => `${lang}:${k}`, tf: () => (k) => `${lang}:${k}` }, eventBus: bus, dialog: fakeDialog() });

  test('show lends the template root to one dialog; container stays hidden', async () => {
    lang = 'de';
    await page.init(ctx());
    await page.show();
    assertEqual(opened.length, 1);
    assertEqual(opened[0].opts.title, 'de:title');
    assertEqual(opened[0].opts.content.classList.contains('cp-dlg__root'), true);
    assertEqual(container.style.display, 'none');
    assertEqual(page.isOpen(), true);
  });

  test('hide closes the dialog and the root returns to the container', async () => {
    await page.init(ctx());
    await page.show();
    page.hide();
    assertEqual(opened[0].open, false);
    assertEqual(container.firstElementChild.classList.contains('cp-dlg__root'), true);
    assertEqual(page.isOpen(), false);
  });

  test('dismissing the dialog hides the page once (one page:closed)', async () => {
    let closed = 0;
    bus.on('page:closed', () => { closed += 1; });
    await page.init(ctx());
    await page.show();
    opened[0].opts.onClose();          // ✕ / Escape / overlay path
    assertEqual(page.isOpen(), false);
    assertEqual(closed, 1);
  });

  test('language change while open reopens with the new title, page stays open', async () => {
    let closed = 0;
    bus.on('page:closed', () => { closed += 1; });
    lang = 'de';
    await page.init(ctx());
    await page.show();
    lang = 'en';
    bus.emit('language:changed', 'en');
    assertEqual(opened.length, 2);
    assertEqual(opened[0].open, false);
    assertEqual(opened[1].open, true);
    assertEqual(opened[1].opts.title, 'en:title');
    assertEqual(page.isOpen(), true);
    assertEqual(closed, 0);
  });
});

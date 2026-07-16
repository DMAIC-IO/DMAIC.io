import { suite, test, assertEqual, beforeEach, afterEach } from '../test-utils.js';
import { createPage } from '../../js/core/create-page.js';

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

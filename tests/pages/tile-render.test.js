import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { renderTileSafely, disposeTile } from '../../js/pages/dashboard/tile-render.js';

const i18n = { t: (k) => k };

function silenced(fn) {
  return async () => {
    const original = console.error;
    console.error = () => {};
    try { await fn(); } finally { console.error = original; }
  };
}

/** Inline (or replace) a test template under `key`, like the build does for js/**\/*.html. */
function inline(key, html) {
  let tpl = document.querySelector(`template[data-tpl="${key}"]`);
  if (!tpl) {
    tpl = document.createElement('template');
    tpl.setAttribute('data-tpl', key);
    document.head.append(tpl);
  }
  tpl.innerHTML = html;
}

inline('test/scope.html', '<p class="a" x-text="vm.title"></p><ul><template x-for="item in vm.items"><li x-text="item"></li></template></ul>');
inline('test/blank.html', '<div class="w">\n  <span x-text="vm.a"></span>\n  <span> </span>\n  <template x-if="vm.on">\n    <b>on</b>\n  </template>\n</div>\n');
inline('test/slot.html', '<template x-if="vm.on"><div data-tile-slot="chart"></div></template>');

const scopeTile = (vm) => ({ template: 'test/scope.html', viewModel: () => vm });

suite('renderTileSafely: contract', () => {
  test('a tile with only render() is not called and shows the error placeholder', silenced(async () => {
    const body = document.createElement('div');
    let called = false;
    const ok = await renderTileSafely({ render: () => { called = true; } }, body, { tileId: 't' }, i18n);
    assertEqual(ok, false);
    assertEqual(called, false);
    assertEqual(body.querySelector('.dashboard-area__tile-error').textContent, 'dashboard.tileSettings.renderError');
  }));
});

suite('renderTileSafely: template + viewModel', () => {
  test('mounts the template with vm as scope on every top-level element, no wrapper', async () => {
    const body = document.createElement('div');
    const ok = await renderTileSafely(scopeTile({ title: 'T', items: ['x', 'y'] }), body, { tileId: 't' }, i18n);
    assertTrue(ok);
    assertDeepEqual([...body.children].map(e => e.tagName), ['P', 'UL']);
    assertEqual(body.querySelector('.a').textContent, 'T');
    assertDeepEqual([...body.querySelectorAll('li')].map(e => e.textContent), ['x', 'y']);
  });

  test('passes args to viewModel and vm + args to mount', async () => {
    const body = document.createElement('div');
    const seen = {};
    const tile = {
      template: 'test/scope.html',
      viewModel: async (args) => { seen.vmArgs = args; return { title: 'T', items: [] }; },
      mount: (root, vm, args) => { seen.root = root; seen.vm = vm; seen.mountArgs = args; },
    };
    const args = { tileId: 't', settings: { topN: 2 } };
    await renderTileSafely(tile, body, args, i18n);
    assertTrue(seen.vmArgs === args);
    assertTrue(seen.root === body);
    assertEqual(seen.vm.title, 'T');
    assertTrue(seen.mountArgs === args);
  });

  test('strips whitespace-only text nodes, keeps NBSP, also inside x-if templates', async () => {
    const body = document.createElement('div');
    await renderTileSafely({ template: 'test/blank.html', viewModel: () => ({ a: 'A', on: true }) }, body, { tileId: 't' }, i18n);
    const w = body.querySelector('.w');
    assertTrue([...w.childNodes].every(n => n.nodeType === Node.ELEMENT_NODE), 'no text nodes between children');
    assertEqual(w.textContent, 'A on');
    assertEqual(body.childNodes.length, 1);
  });

  test('a slot inside x-if is present when mount runs', async () => {
    const body = document.createElement('div');
    let slot = null;
    await renderTileSafely({ template: 'test/slot.html', viewModel: () => ({ on: true }),
      mount: (root) => { slot = root.querySelector('[data-tile-slot="chart"]'); } }, body, { tileId: 't' }, i18n);
    assertTrue(slot !== null);
  });

  test('a throwing viewModel shows the error placeholder', silenced(async () => {
    const body = document.createElement('div');
    const ok = await renderTileSafely({ template: 'test/scope.html', viewModel: () => { throw new Error('boom'); } },
      body, { tileId: 't' }, i18n);
    assertEqual(ok, false);
    assertEqual(body.querySelector('.dashboard-area__tile-error').textContent, 'dashboard.tileSettings.renderError');
  }));

  test('a throwing mount shows the placeholder and disposes the tile', silenced(async () => {
    const body = document.createElement('div');
    const disposed = [];
    const ok = await renderTileSafely({ ...scopeTile({ title: 'T', items: [] }),
      mount: async () => { throw new Error('boom'); },
      dispose: (host, { tileId }) => disposed.push([host, tileId]) }, body, { tileId: 't' }, i18n);
    assertEqual(ok, false);
    assertTrue(body.querySelector('.dashboard-area__tile-error') !== null);
    assertEqual(body.querySelector('.a'), null);
    assertEqual(disposed.length, 1);
    assertTrue(disposed[0][0] === body);
    assertEqual(disposed[0][1], 't');
  }));

  test('an unknown template shows the error placeholder', silenced(async () => {
    const body = document.createElement('div');
    const ok = await renderTileSafely({ template: 'test/missing.html', viewModel: () => ({}) }, body, { tileId: 't' }, i18n);
    assertEqual(ok, false);
    assertTrue(body.querySelector('.dashboard-area__tile-error') !== null);
  }));

  test('a re-render destroys the old Alpine scopes', async () => {
    const body = document.createElement('div');
    await renderTileSafely(scopeTile({ title: 'old', items: ['x'] }), body, { tileId: 't' }, i18n);
    const old = body.querySelector('.a');
    assertTrue(old._x_marker !== undefined, 'initialised by Alpine');
    await renderTileSafely(scopeTile({ title: 'new', items: ['y', 'z'] }), body, { tileId: 't' }, i18n);
    assertEqual(old._x_marker, undefined);
    assertEqual(body.querySelector('.a').textContent, 'new');
    assertEqual(body.querySelectorAll('li').length, 2);
  });

  test('a second Alpine.initTree does not duplicate x-for rows', async () => {
    const body = document.createElement('div');
    await renderTileSafely(scopeTile({ title: 'T', items: ['x', 'y'] }), body, { tileId: 't' }, i18n);
    for (const el of body.children) Alpine.initTree(el);
    assertEqual(body.querySelectorAll('li').length, 2);
  });

  test('an attached body is not initialised twice by the mutation observer', async () => {
    if (!Alpine.version) Alpine.start();
    const body = document.createElement('div');
    document.body.append(body);
    try {
      await renderTileSafely(scopeTile({ title: 'T', items: ['x', 'y'] }), body, { tileId: 't' }, i18n);
      await new Promise(r => setTimeout(r, 20));
      assertEqual(body.querySelectorAll('li').length, 2);
      assertEqual(body.querySelector('.a').textContent, 'T');
    } finally {
      disposeTile(null, body, { tileId: 't' });
      body.remove();
    }
  });

  test('an older render whose viewModel resolves late is dropped', async () => {
    const body = document.createElement('div');
    let release = null;
    const tile = {
      template: 'test/scope.html',
      viewModel: (args) => (args.slow
        ? new Promise(r => { release = () => r({ title: 'old', items: [] }); })
        : { title: 'new', items: [] }),
    };
    const first = renderTileSafely(tile, body, { tileId: 't', slow: true }, i18n);
    assertTrue(await renderTileSafely(tile, body, { tileId: 't' }, i18n));
    release();
    assertEqual(await first, false);
    assertEqual(body.querySelector('.a').textContent, 'new');
  });
});

suite('disposeTile', () => {
  test('calls dispose before Alpine.destroyTree', async () => {
    const body = document.createElement('div');
    const calls = [];
    const tile = { ...scopeTile({ title: 'T', items: [] }), dispose: (host, { tileId }) => calls.push(`dispose:${tileId}`) };
    await renderTileSafely(tile, body, { tileId: 't' }, i18n);
    const original = Alpine.destroyTree;
    Alpine.destroyTree = (el) => { calls.push('destroy'); original(el); };
    try {
      disposeTile(tile, body, { tileId: 't' });
    } finally {
      Alpine.destroyTree = original;
    }
    assertDeepEqual(calls, ['dispose:t', 'destroy']);
  });

  test('a throwing dispose is logged and the tree is still destroyed', silenced(async () => {
    const body = document.createElement('div');
    const tile = { ...scopeTile({ title: 'T', items: [] }), dispose: () => { throw new Error('boom'); } };
    await renderTileSafely(tile, body, { tileId: 't' }, i18n);
    const el = body.querySelector('.a');
    disposeTile(tile, body, { tileId: 't' });
    assertEqual(el._x_marker, undefined);
  }));

  test('a render pending during disposeTile is dropped', async () => {
    const body = document.createElement('div');
    let release = null;
    const tile = { template: 'test/scope.html',
      viewModel: () => new Promise(r => { release = () => r({ title: 'late', items: [] }); }) };
    const pending = renderTileSafely(tile, body, { tileId: 't' }, i18n);
    disposeTile(tile, body, { tileId: 't' });
    release();
    assertEqual(await pending, false);
    assertEqual(body.childNodes.length, 0);
  });
});

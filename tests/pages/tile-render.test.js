import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { renderTileSafely } from '../../js/pages/dashboard/tile-render.js';

const i18n = { t: (k) => k };

function silenced(fn) {
  return async () => {
    const original = console.error;
    console.error = () => {};
    try { await fn(); } finally { console.error = original; }
  };
}

suite('renderTileSafely', () => {
  test('passes args through and reports success', async () => {
    const body = document.createElement('div');
    let seen = null;
    const ok = await renderTileSafely({ render: (host, args) => { seen = args; host.textContent = 'hi'; } },
      body, { tileId: 't', settings: { topN: 2 } }, i18n);
    assertTrue(ok);
    assertEqual(body.textContent, 'hi');
    assertEqual(seen.settings.topN, 2);
  });

  test('a throwing render shows the error placeholder', silenced(async () => {
    const body = document.createElement('div');
    body.textContent = 'stale';
    const ok = await renderTileSafely({ render: () => { throw new Error('boom'); } }, body, { tileId: 't' }, i18n);
    assertEqual(ok, false);
    assertEqual(body.querySelector('.dashboard-area__empty').textContent, 'dashboard.tileSettings.renderError');
  }));

  test('a rejecting async render shows the error placeholder', silenced(async () => {
    const body = document.createElement('div');
    const ok = await renderTileSafely({ render: async () => { throw new Error('boom'); } }, body, { tileId: 't' }, i18n);
    assertEqual(ok, false);
    assertTrue(body.querySelector('.dashboard-area__tile-error') !== null);
  }));
});

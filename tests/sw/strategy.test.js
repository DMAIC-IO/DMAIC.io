import { suite, test, assertEqual } from '../test-utils.js';
import { strategyFor } from '../../js/sw/strategy.js';

const SCOPE = 'https://dmaic.io/app/v1.2.0/';
const PRECACHE = new Set([
  './', 'index.html',
  'js/app.min.js?v=1a2b3c4d', 'css/app.min.css?v=5e6f7a8b',
  'js/chunks/lab-AB12CD34.min.js',
  'i18n/de.json?v=9c0d1e2f',
  'examples/index.json',
]);

/** A request as the fetch event delivers it; only url, method and mode are read. */
function req(path, { method = 'GET', mode = 'cors', origin = 'https://dmaic.io' } = {}) {
  return { url: `${origin}${path}`, method, mode };
}

const opts = { scope: SCOPE, precache: PRECACHE };

suite('sw strategy — navigations', () => {
  test('the scope root is page', () => {
    assertEqual(strategyFor(req('/app/v1.2.0/', { mode: 'navigate' }), opts), 'page');
  });

  test('index.html is page', () => {
    assertEqual(strategyFor(req('/app/v1.2.0/index.html', { mode: 'navigate' }), opts), 'page');
  });

  test('navigation with a query is page', () => {
    assertEqual(strategyFor(req('/app/v1.2.0/?e2e=1', { mode: 'navigate' }), opts), 'page');
    assertEqual(strategyFor(req('/app/v1.2.0/?example=pareto', { mode: 'navigate' }), opts), 'page');
  });

  test('the static handbook passes through', () => {
    assertEqual(strategyFor(req('/app/v1.2.0/docs/index.html', { mode: 'navigate' }), opts), 'passthrough');
  });
});

suite('sw strategy — subresources', () => {
  test('a listed chunk is cache-first', () => {
    assertEqual(strategyFor(req('/app/v1.2.0/js/chunks/lab-AB12CD34.min.js'), opts), 'cache-first');
  });

  test('a chunk missing from the list is still cache-first', () => {
    // An old tab after a deploy: its chunk lives only in the previous cache.
    assertEqual(strategyFor(req('/app/v1.2.0/js/chunks/lab-OLD00000.min.js'), opts), 'cache-first');
  });

  test('entry and stylesheet with ?v= are cache-first', () => {
    assertEqual(strategyFor(req('/app/v1.2.0/js/app.min.js?v=1a2b3c4d'), opts), 'cache-first');
    assertEqual(strategyFor(req('/app/v1.2.0/css/app.min.css?v=5e6f7a8b'), opts), 'cache-first');
  });

  test('fonts are cache-first', () => {
    assertEqual(strategyFor(req('/app/v1.2.0/css/fonts/KaTeX_Main-Regular.woff2'), opts), 'cache-first');
    assertEqual(strategyFor(req('/app/v1.2.0/assets/fonts/dmsans-latin.ttf'), opts), 'cache-first');
  });

  test('listed data is network-first, the ?v= query is part of the key', () => {
    assertEqual(strategyFor(req('/app/v1.2.0/i18n/de.json?v=9c0d1e2f'), opts), 'network-first');
    assertEqual(strategyFor(req('/app/v1.2.0/examples/index.json'), opts), 'network-first');
    assertEqual(strategyFor(req('/app/v1.2.0/i18n/de.json?v=00000000'), opts), 'passthrough');
  });

  test('an unlisted URL passes through', () => {
    assertEqual(strategyFor(req('/app/v1.2.0/videos/index.json'), opts), 'passthrough');
  });

  test('POST, a foreign origin and another scope pass through', () => {
    assertEqual(strategyFor(req('/app/v1.2.0/examples/index.json', { method: 'POST' }), opts), 'passthrough');
    assertEqual(strategyFor(req('/app/v1.2.0/examples/index.json', { origin: 'https://cdn.example' }), opts), 'passthrough');
    assertEqual(strategyFor(req('/app/v1.2/js/chunks/lab-AB12CD34.min.js'), opts), 'passthrough');
  });
});

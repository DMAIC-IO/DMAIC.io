import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPrecache, fontUrlsFromCss, precacheVersion, bundleServiceWorker } from './service-worker.mjs';
import { assertEvalFree } from './build.mjs';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A tiny app tree with one file per precache root plus files that must stay out. */
function fixtureTree() {
  const dir = mkdtempSync(join(tmpdir(), 'dmike-sw-'));
  const put = (rel, text = rel) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  };
  put('i18n/de.json', '{}');
  put('i18n/en.json', '{}');
  put('examples/index.json');
  put('examples/projects/pareto.json');
  put('examples/data/werte.csv');
  put('examples/projects/pareto.json.map');
  put('js/algorithm-lab/algorithms/index.json');
  put('js/algorithm-lab/algorithms/capability/cpk.json');
  put('js/modules/triz-sufield/data/standards.json');
  put('js/modules/triz-sufield/triz-sufield.js');
  put('js/core/tips/tips.json');
  put('release.json');
  put('assets/logo.svg');
  put('assets/fonts/dmsans-latin.woff2');
  put('assets/fonts/dmsans-latin.ttf');
  put('assets/icons/own/flag.svg');
  put('assets/icons/icon-map.json');
  put('docs/index.html');
  put('tests/fixtures/a.json');
  put('tools/build/x.json');
  return dir;
}

const BUILD = {
  jsHref: 'js/app.min.js?v=11111111',
  cssHref: 'css/app.min.css?v=22222222',
  cssCode: '@font-face{src:url("./fonts/KaTeX_Main-Regular.woff2") format("woff2"),url("./fonts/KaTeX_Main-Regular.woff") format("woff")}'
    + '@font-face{src:url("./fonts/KaTeX_Main-Regular.woff2")}',
  chunks: ['js/chunks/lab-AAAA1111.min.js', 'js/chunks/xlsx-BBBB2222.min.js'],
  i18nHash: '33333333',
};

test('fontUrlsFromCss takes each .woff2 once, below css/', () => {
  assert.deepEqual(fontUrlsFromCss(BUILD.cssCode), ['css/fonts/KaTeX_Main-Regular.woff2']);
});

test('collectPrecache lists every runtime file and nothing else', () => {
  const dir = fixtureTree();
  try {
    const urls = collectPrecache(dir, BUILD);
    for (const expected of [
      './', 'index.html', BUILD.jsHref, BUILD.cssHref, ...BUILD.chunks,
      'css/fonts/KaTeX_Main-Regular.woff2',
      'i18n/de.json?v=33333333', 'i18n/en.json?v=33333333',
      'examples/index.json', 'examples/projects/pareto.json', 'examples/data/werte.csv',
      'js/algorithm-lab/algorithms/index.json', 'js/algorithm-lab/algorithms/capability/cpk.json',
      'js/modules/triz-sufield/data/standards.json', 'js/core/tips/tips.json', 'release.json',
      'assets/logo.svg', 'assets/fonts/dmsans-latin.woff2', 'assets/fonts/dmsans-latin.ttf',
      'assets/icons/own/flag.svg',
    ]) assert.ok(urls.includes(expected), `missing ${expected}`);
    for (const url of urls) {
      assert.ok(!url.endsWith('.map'), `source map listed: ${url}`);
      assert.ok(!/^(docs|tests|tools|node_modules)\//.test(url), `excluded tree listed: ${url}`);
    }
    assert.ok(!urls.includes('js/modules/triz-sufield/triz-sufield.js'), 'module source listed');
    assert.ok(!urls.includes('assets/icons/icon-map.json'), 'icon map listed');
    assert.deepEqual(urls, [...urls].sort(), 'sorted');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('precacheVersion follows the content of listed files and the shell', () => {
  const dir = fixtureTree();
  try {
    const urls = collectPrecache(dir, BUILD);
    const v1 = precacheVersion(dir, urls, { html: '<html>1</html>' });
    assert.match(v1, /^[0-9a-f]{8}$/);
    assert.equal(precacheVersion(dir, urls, { html: '<html>1</html>' }), v1, 'deterministic');

    writeFileSync(join(dir, 'docs', 'index.html'), 'changed');
    assert.equal(precacheVersion(dir, urls, { html: '<html>1</html>' }), v1, 'unlisted file ignored');

    writeFileSync(join(dir, 'examples', 'index.json'), '{"changed":true}');
    const v2 = precacheVersion(dir, urls, { html: '<html>1</html>' });
    assert.notEqual(v2, v1, 'listed file changes the version');

    assert.notEqual(precacheVersion(dir, urls, { html: '<html>2</html>' }), v2, 'shell changes the version');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('bundleServiceWorker emits one eval-free classic script with both constants', async () => {
  const code = await bundleServiceWorker(APP_DIR, { version: 'abcd1234', precache: ['./', 'js/app.min.js?v=11111111'] });
  assert.doesNotThrow(() => assertEvalFree(code));
  assert.ok(!/\bimport\b|\bexport\b/.test(code), 'no module syntax left');
  assert.ok(code.includes('abcd1234'), 'VERSION inlined');
  assert.ok(code.includes('js/app.min.js?v=11111111'), 'PRECACHE inlined');
  assert.ok(code.includes('dmaic:'), 'cache prefix present');
});

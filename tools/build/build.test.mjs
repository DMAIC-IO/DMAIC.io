import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleJs, assertEvalFree, readCssLinks, bundleCss, hash8, rewriteBlock, buildStylesBlock, buildScriptsBlock, runBuild } from './build.mjs';
import { renderIndexHtml } from '../build-templates/build.mjs';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('assertEvalFree throws on eval', () => {
  assert.throws(() => assertEvalFree('var x=eval("1")'), /eval/);
  assert.throws(() => assertEvalFree('new Function("a","return a")'), /Function/);
  assert.doesNotThrow(() => assertEvalFree('const x = 1 + 1;'));
});

test('bundleJs writes an eval-free app.min.js', async () => {
  const { outfile, code } = await bundleJs(APP_DIR);
  assert.ok(existsSync(outfile), 'app.min.js exists');
  assert.ok(code.length > 1000, 'bundle non-trivial');
  assert.doesNotThrow(() => assertEvalFree(code));
});

test('readCssLinks preserves order excludes non-stylesheet links', () => {
  const html = `
<link rel="icon" href="favicon.svg">
<link rel="stylesheet" href="css/variables.css">
<link rel="stylesheet" href="css/layout.css">`;
  assert.deepEqual(readCssLinks(html), ['css/variables.css', 'css/layout.css']);
});

test('readCssLinks excludes vendor stylesheets, keeps first-party order', () => {
  const html = `
  <link rel="icon" href="favicon.svg">
  <link rel="stylesheet" href="css/variables.css">
  <link rel="stylesheet" href="vendor/katex/katex.min.css">
  <link rel="stylesheet" href="css/layout.css">`;
  assert.deepEqual(readCssLinks(html), ['css/variables.css', 'css/layout.css']);
});

test('hash8 is stable and 8 chars', () => {
  assert.equal(hash8('abc'), hash8('abc'));
  assert.equal(hash8('abc').length, 8);
  assert.notEqual(hash8('abc'), hash8('abd'));
});

test('rewriteBlock replaces between markers, keeps markers', () => {
  const html = 'x\n<!-- STYLES:START -->\nOLD\n<!-- STYLES:END -->\ny';
  const out = rewriteBlock(html, 'STYLES', 'NEW');
  assert.match(out, /<!-- STYLES:START -->\nNEW\n<!-- STYLES:END -->/);
  assert.match(out, /^x\n/);
  assert.match(out, /\ny$/);
});

test('rewriteBlock handles indented markers', () => {
  const html = 'x\n  <!-- STYLES:START -->\nOLD\n  <!-- STYLES:END -->\ny';
  const out = rewriteBlock(html, 'STYLES', 'NEW');
  assert.match(out, / {2}<!-- STYLES:START -->\nNEW\n {2}<!-- STYLES:END -->/);
});

test('buildStylesBlock emits a hashed link', () => {
  assert.match(buildStylesBlock('css/app.min.css?v=abc123de'),
    /<link rel="stylesheet" href="css\/app\.min\.css\?v=abc123de">/);
});

test('SCRIPTS block has no vendor script tags (single bundle include)', () => {
  const block = buildScriptsBlock('js/app.min.js?v=abc');
  assert.equal(/vendor\//.test(block), false);
  assert.equal((block.match(/<script/g) || []).length, 1);
});

test('index.dist.html declares no vendor assets', () => {
  const html = readFileSync(join(APP_DIR, 'index.dist.html'), 'utf8');
  assert.equal(/vendor\//.test(html), false);
});

test('bundled CSS includes katex + prism rules and copies katex fonts', async () => {
  // Source stylesheet list (index.dist.html), NOT the built index.html whose
  // single app.min.css link would re-import the just-emitted url(fonts/…).
  const html = readFileSync(join(APP_DIR, 'index.dist.html'), 'utf8');
  const { code } = await bundleCss(APP_DIR, readCssLinks(html), { write: true });
  assert.match(code, /\.katex/);   // KaTeX styles folded in
  assert.match(code, /token/);     // Prism token classes folded in
  assert.ok(existsSync(join(APP_DIR, 'css', 'fonts')), 'katex fonts copied to css/fonts');
});

test('built index.html contains the pre-JS loading overlay', () => {
  const html = readFileSync(join(APP_DIR, 'index.html'), 'utf8');
  assert.match(html, /id="app-loading"/);
});

test('runBuild --check passes immediately after a real build', async () => {
  await runBuild(APP_DIR, { check: false });          // produce artifacts
  const res = await runBuild(APP_DIR, { check: true }); // verify clean
  assert.deepEqual(res.changed, [], 'no stale artifacts after a build');
});

test('build emits license artifacts', async () => {
  const { existsSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const appDir = APP_DIR; // already imported in test file
  const mod = join(appDir, 'js', 'pages', 'licenses', 'licenses-data.generated.js');
  const txt = join(appDir, 'THIRD-PARTY-LICENSES.txt');
  assert.ok(existsSync(mod), 'licenses-data.generated.js exists after build');
  assert.ok(existsSync(txt), 'THIRD-PARTY-LICENSES.txt exists after build');
  assert.match(readFileSync(mod, 'utf8'), /export const LICENSES/);
  assert.match(readFileSync(txt, 'utf8'), /Apache-2\.0/);
});

test('renderIndexHtml liefert die fertige Shell, ohne zu schreiben', () => {
  const indexPath = join(APP_DIR, 'index.html');
  const before = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : null;
  const html = renderIndexHtml(APP_DIR);
  assert.match(html, /<template data-tpl="js\//);
  const after = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : null;
  assert.equal(after, before, 'renderIndexHtml darf index.html nicht anfassen');
});

test('runBuild schreibt index.html nie im Dev-Entry-Zustand', async () => {
  const indexPath = join(APP_DIR, 'index.html');
  // index.html löschen: gelingt der Build trotzdem, kann Schritt 3 die
  // CSS-Hrefs nicht mehr aus einer bereits geschriebenen Datei lesen — genau
  // die Kopplung, die das Rennen erzeugt hat.
  if (existsSync(indexPath)) rmSync(indexPath);
  await runBuild(APP_DIR, { check: false });
  const html = readFileSync(indexPath, 'utf8');
  assert.match(html, /src="js\/app\.min\.js\?v=/);
  assert.doesNotMatch(html, /src="js\/app\.js"/);
});

/**
 * brand.test.mjs — keeps the retired product names out of everything a user
 * reads. The app is called "Qprovement"; "DMAIC.io", "dmaic.io" and "D.Mike"
 * must not come back into UI strings, help sources, example data, algorithm
 * descriptions or the generated handbook.
 *
 * Exempt on purpose:
 * - GitHub URLs to DMAIC-IO/DMAIC.io — the organisation and repo really carry
 *   that name.
 * - Code comments (file headers etc.) — not user-facing. They are stripped
 *   before matching, so the check covers string literals only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = p => readFileSync(join(APP_DIR, p), 'utf8');

const OLD_NAMES = [/DMAIC\.io/, /dmaic\.io/, /D\.Mike/];

/** Removes GitHub links to the real repository before matching. */
const stripGithub = s => s.replace(/github\.com\/DMAIC-IO\/DMAIC\.io[^\s"'<)]*/g, '');

/** Removes block and line comments. Good enough for this codebase: a `//`
 *  inside a string is only treated as a comment when preceded by whitespace
 *  at line start, which keeps URLs in strings intact. */
const stripComments = s => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/<!--[\s\S]*?-->/g, '');

/** Recursively lists files below `dir` whose name matches `re`. */
function walk(dir, re, out = []) {
  const abs = join(APP_DIR, dir);
  if (!existsSync(abs)) return out;
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, re, out);
    else if (re.test(e.name)) out.push(p);
  }
  return out;
}

function assertClean(file, text) {
  const s = stripGithub(text);
  for (const re of OLD_NAMES) {
    const m = s.match(new RegExp(`.{0,40}${re.source}.{0,40}`));
    assert.equal(m, null, `${file} still names ${re.source}: …${m?.[0]}…`);
  }
}

/** Build output and vendored/generated bundles are covered via their sources. */
const GENERATED = /(\.min\.js|\.generated\.js)$/;

test('UI strings carry no retired product name', () => {
  for (const f of ['i18n/de.json', 'i18n/en.json']) assertClean(f, read(f));
});

test('JS string literals (help sources, messages) carry no retired product name', () => {
  const files = walk('js', /\.(js|html)$/).filter(f => !GENERATED.test(f));
  assert.ok(files.length > 100, 'js tree not found');
  for (const f of files) assertClean(f, stripComments(read(f)));
});

test('example data and algorithm descriptions carry no retired product name', () => {
  const files = [
    ...walk('examples', /\.json$/),
    ...walk('js/algorithm-lab/algorithms', /\.json$/),
    // Inlined into the Algorithm Lab's validation tab (tools/build/lab-data.mjs).
    ...walk('tests/fixtures', /\.fixtures\.json$/),
  ];
  assert.ok(files.length > 10, 'example/algorithm JSON not found');
  for (const f of files) assertClean(f, read(f));
});

test('handbook generator and shipped licence notice carry no retired product name', () => {
  for (const f of walk('tools/static-handbook', /\.mjs$/).filter(f => !f.endsWith('.test.mjs'))) {
    assertClean(f, stripComments(read(f)));
  }
  assertClean('tools/license-report/license-report.mjs', stripComments(read('tools/license-report/license-report.mjs')));
  assertClean('THIRD-PARTY-LICENSES.txt', read('THIRD-PARTY-LICENSES.txt'));
});

/* The handbook under docs/ is gitignored and only exists after `npm run docs`.
   When it is there, its pages are checked as well — that is what users read. */
test('generated handbook carries no retired product name', (t) => {
  const pages = walk('docs', /\.(html|xml)$/);
  if (pages.length === 0) return t.skip('docs/ not built — run `npm run docs`');
  for (const f of pages) assertClean(relative(APP_DIR, join(APP_DIR, f)), read(f));
});

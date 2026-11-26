import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBlockHeadingAnchors, scanBlockHeadingAnchors } from './help-anchor-placement.mjs';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('a help key directly on a section title is reported', () => {
  const html = '<div class="dmike-split__section-title" data-help-key="modules.x.help" x-text="t(\'a\')"></div>';
  assert.equal(findBlockHeadingAnchors(html).length, 1);
});

test('a dynamic help key and extra classes are reported too', () => {
  const html = '<div class="foo dmike-split__section-title" :data-help-key="k"></div>';
  assert.equal(findBlockHeadingAnchors(html).length, 1);
});

test('the help key on a span inside the section title passes', () => {
  const html = '<div class="dmike-split__section-title"><span data-help-key="modules.x.help" x-text="t(\'a\')"></span></div>';
  assert.deepEqual(findBlockHeadingAnchors(html), []);
});

test('a lookalike class name does not count', () => {
  const html = '<div class="dmike-split__section-title-row" data-help-key="modules.x.help"></div>';
  assert.deepEqual(findBlockHeadingAnchors(html), []);
});

test('a help key on screen-reader-only text is reported (position: relative makes it take space)', () => {
  const html = '<span class="dmike-sr-only" data-help-key="modules.x.help" x-text="t(\'a\')"></span>';
  assert.equal(findBlockHeadingAnchors(html).length, 1);
});

test('the help key on the visible wrapper around screen-reader-only text passes', () => {
  const html = '<span class="context-help-anchor--overlay" data-help-key="modules.x.help"><span class="dmike-sr-only" x-text="t(\'a\')"></span></span>';
  assert.deepEqual(findBlockHeadingAnchors(html), []);
});

test('no section title and no screen-reader-only text in the app carries a help key itself', () => {
  assert.deepEqual(scanBlockHeadingAnchors(APP_DIR), []);
});

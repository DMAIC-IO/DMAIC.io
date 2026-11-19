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

test('no section title in the app carries its help key itself (key belongs on a span around the text)', () => {
  assert.deepEqual(scanBlockHeadingAnchors(APP_DIR), []);
});

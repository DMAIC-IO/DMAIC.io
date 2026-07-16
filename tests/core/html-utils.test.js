/**
 * Tests for js/core/html-utils.js
 *
 * Covers the HTML escaping helpers (esc / escAttr). The former setHTML /
 * Trusted-Types policy was removed in the CSP/DOM cleanup — the app builds
 * DOM nodes directly (createElement/textContent / dom.js h()), so there is
 * no HTML-string sink left to test.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { esc, escAttr } from '../../js/core/html-utils.js';

suite('html-utils: esc / escAttr', () => {
  test('esc encodes &, <, >', () => {
    assertEqual(esc('a & <b>'), 'a &amp; &lt;b&gt;', 'esc HTML-encodes');
  });

  test('escAttr encodes the double quote', () => {
    assertEqual(escAttr('say "hi" <b>'), 'say &quot;hi&quot; &lt;b&gt;', 'escAttr quotes');
  });

  test('esc / escAttr null-safe', () => {
    assertEqual(esc(null), '', 'esc(null) → empty');
    assertEqual(escAttr(undefined), '', 'escAttr(undefined) → empty');
  });
});

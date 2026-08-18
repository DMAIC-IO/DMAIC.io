/**
 * DOM-bound half of the chainViewMixin tests — `autoSize` measures a live
 * textarea (clientHeight/scrollHeight), so this file runs in the browser
 * bridge, not in the headless node runner. The DOM-free mixin tests live in
 * `flowchart-view.test.js`.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { chainViewMixin } from '../../js/core/flowchart/flowchart-view.js';

suite('chainViewMixin — autoSize', () => {
  test('adds the borders back under box-sizing: border-box', () => {
    // scrollHeight is the CONTENT height; assigning it verbatim to `height`
    // under border-box clips the last line by the border width.
    const el = document.createElement('textarea');
    el.style.boxSizing = 'border-box';
    el.style.border = '1px solid black';
    el.style.width = '120px';
    el.value = 'eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf';
    document.body.appendChild(el);
    try {
      const m = chainViewMixin(null, (k) => k);
      m.autoSize({ target: el });
      assertEqual(el.clientHeight >= el.scrollHeight, true);
    } finally {
      el.remove();
    }
  });
});

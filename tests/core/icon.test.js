import { suite, test, assertEqual } from '../test-utils.js';
import { icon } from '../../js/core/icon.js';

suite('icon: helper', () => {
  test('returns a <span> with data-icon + class', () => {
    const el = icon('close');
    assertEqual(el.tagName, 'SPAN', 'span');
    assertEqual(el.getAttribute('data-icon'), 'close', 'data-icon');
    assertEqual(el.classList.contains('icon'), true, 'icon class');
  });
  test('is decorative (aria-hidden)', () => {
    assertEqual(icon('close').getAttribute('aria-hidden'), 'true', 'aria-hidden');
  });
  test('has no src (mask-based, no <img>)', () => {
    const el = icon('close');
    assertEqual(el.hasAttribute('src'), false, 'no src');
  });
  test('extra class merged', () => {
    assertEqual(icon('close', { cls: 'big' }).classList.contains('big'), true, 'extra cls');
  });
});

suite('icon: raw variant', () => {
  test('raw:true adds .icon--raw class', () => {
    const el = icon('chart-thumb-pie', { raw: true });
    assertEqual(el.classList.contains('icon'), true, 'base class');
    assertEqual(el.classList.contains('icon--raw'), true, 'raw class');
    assertEqual(el.getAttribute('data-icon'), 'chart-thumb-pie', 'data-icon');
  });
  test('raw:true merges with cls', () => {
    const el = icon('chart-thumb-pie', { raw: true, cls: 'thumb' });
    assertEqual(el.classList.contains('icon--raw'), true, 'raw');
    assertEqual(el.classList.contains('thumb'), true, 'extra cls');
  });
  test('without raw, no icon--raw class', () => {
    assertEqual(icon('close').classList.contains('icon--raw'), false, 'no raw by default');
  });
});

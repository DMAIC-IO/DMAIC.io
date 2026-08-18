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

suite('icon: sizes', () => {
  test('md is the default and adds no size class', () => {
    const el = icon('action.close');
    assertEqual(el.classList.contains('icon--sm'), false, 'no sm');
    assertEqual(el.classList.contains('icon--lg'), false, 'no lg');
    assertEqual(el.classList.contains('icon--md'), false, 'no md class either');
  });
  test('size sm adds icon--sm', () => {
    assertEqual(icon('action.close', { size: 'sm' }).classList.contains('icon--sm'), true, 'sm');
  });
  test('size lg adds icon--lg', () => {
    assertEqual(icon('action.close', { size: 'lg' }).classList.contains('icon--lg'), true, 'lg');
  });
  test('an explicit md behaves like the default', () => {
    assertEqual(icon('action.close', { size: 'md' }).className, 'icon', 'only the base class');
  });
});

suite('icon: colour variants', () => {
  test('variant muted adds icon--muted', () => {
    assertEqual(icon('action.close', { variant: 'muted' }).classList.contains('icon--muted'), true, 'muted');
  });
  test('variant danger adds icon--danger', () => {
    assertEqual(icon('action.delete', { variant: 'danger' }).classList.contains('icon--danger'), true, 'danger');
  });
  test('size and variant combine with an extra class', () => {
    const el = icon('action.delete', { size: 'sm', variant: 'danger', cls: 'row__btn-icon' });
    assertEqual(el.className, 'icon icon--sm icon--danger row__btn-icon', 'class order');
  });
});

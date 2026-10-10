import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { cacheName, cachesToDelete } from '../../js/sw/caches.js';

const SCOPE = 'https://dmaic.io/app/v1.2/';

suite('sw caches — naming', () => {
  test('the name carries the scope path and the version', () => {
    assertEqual(cacheName(SCOPE, '3f9a1c2e'), 'dmaic:/app/v1.2/:3f9a1c2e');
  });
});

suite('sw caches — cleanup on activate', () => {
  test('keeps the current and the newest previous version of its own scope', () => {
    const names = ['dmaic:/app/v1.2/:aaaa0001', 'dmaic:/app/v1.2/:aaaa0002', 'dmaic:/app/v1.2/:aaaa0003', 'dmaic:/app/v1.2/:aaaa0004'];
    assertDeepEqual(cachesToDelete(names, SCOPE, 'aaaa0004'), ['dmaic:/app/v1.2/:aaaa0001', 'dmaic:/app/v1.2/:aaaa0002']);
  });

  test('nothing to delete with only the current and one previous', () => {
    assertDeepEqual(cachesToDelete(['dmaic:/app/v1.2/:aaaa0001', 'dmaic:/app/v1.2/:aaaa0002'], SCOPE, 'aaaa0002'), []);
  });

  test('after a rollback the version that was current stays as previous', () => {
    // v1 → v2 → back to v1: keys() still lists v1 first.
    const names = ['dmaic:/app/v1.2/:aaaa0001', 'dmaic:/app/v1.2/:aaaa0002'];
    assertDeepEqual(cachesToDelete(names, SCOPE, 'aaaa0001'), []);
  });

  test('other scopes and foreign caches stay', () => {
    const names = ['dmaic:/app/latest/:bbbb0001', 'workbox-precache', 'dmaic:/app/v1.2/:aaaa0001', 'dmaic:/app/latest/:bbbb0002', 'dmaic:/app/v1.2/:aaaa0002', 'dmaic:/app/v1.2/:aaaa0003'];
    assertDeepEqual(cachesToDelete(names, SCOPE, 'aaaa0003'), ['dmaic:/app/v1.2/:aaaa0001']);
  });

  test('a scope that is a string prefix of another stays apart', () => {
    const names = ['dmaic:/app/v1.2.0/:cccc0001', 'dmaic:/app/v1.2.0/:cccc0002', 'dmaic:/app/v1.2.0/:cccc0003', 'dmaic:/app/v1.2/:aaaa0001'];
    assertDeepEqual(cachesToDelete(names, SCOPE, 'aaaa0001'), []);
  });
});

// app/dev/tests/core/uid.test.js
import { suite, test, assertTrue, assertEqual } from '../test-utils.js';
import { uid } from '../../js/core/uid.js';

/**
 * Run `fn` with `crypto.randomUUID` hidden, the way every insecure context
 * sees it: over plain http on a non-localhost host the browser exposes no
 * randomUUID at all (window.isSecureContext === false). An own property on
 * the crypto instance shadows Crypto.prototype's method for the duration.
 */
function withoutRandomUUID(fn) {
  const had = Object.prototype.hasOwnProperty.call(crypto, 'randomUUID');
  Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true, writable: true });
  try { return fn(); } finally {
    if (had) Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true, writable: true });
    else delete crypto.randomUUID;
  }
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

suite('core/uid', () => {
  test('returns a v4-shaped id in a secure context', () => {
    assertTrue(UUID_SHAPE.test(uid()), `not uuid-shaped: ${uid()}`);
  });

  test('still returns a v4-shaped id without crypto.randomUUID', () => {
    withoutRandomUUID(() => {
      const id = uid();
      assertTrue(UUID_SHAPE.test(id), `not uuid-shaped: ${id}`);
    });
  });

  test('ids are unique, with and without randomUUID', () => {
    const ids = new Set([uid(), uid(), uid()]);
    withoutRandomUUID(() => { ids.add(uid()); ids.add(uid()); ids.add(uid()); });
    assertEqual(ids.size, 6);
  });
});

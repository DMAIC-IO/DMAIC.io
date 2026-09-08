/**
 * Tests for js/core/debounce.js
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { debounce } from '../../js/core/debounce.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

suite('debounce', () => {
  test('fires once after the quiet period', async () => {
    let calls = 0;
    const d = debounce(() => { calls++; }, 20);
    d(); d(); d();
    assertEqual(calls, 0, 'darf vor Ablauf der Ruhezeit nicht feuern');
    await wait(60);
    assertEqual(calls, 1);
  });

  test('passes the last arguments and preserves `this`', async () => {
    let seen = null;
    let self = null;
    const host = { d: debounce(function (val) { seen = val; self = this; }, 10) };
    host.d('erster');
    host.d('letzter');
    await wait(40);
    assertEqual(seen, 'letzter');
    assertEqual(self, host);
  });

  test('cancel() discards a pending call', async () => {
    let calls = 0;
    const d = debounce(() => { calls++; }, 20);
    d();
    d.cancel();
    await wait(60);
    assertEqual(calls, 0);
  });

  test('cancel() on an idle debouncer is a no-op, and the debouncer stays usable', async () => {
    let calls = 0;
    const d = debounce(() => { calls++; }, 20);
    d.cancel();
    await wait(40);
    assertEqual(calls, 0);
    d();
    await wait(60);
    assertEqual(calls, 1);
  });

  test('cancel() after the call has fired changes nothing', async () => {
    let calls = 0;
    const d = debounce(() => { calls++; }, 10);
    d();
    await wait(40);
    assertEqual(calls, 1);
    d.cancel();
    await wait(40);
    assertEqual(calls, 1);
  });
});

import { suite, test, assert, assertEqual, assertDeepEqual } from '../test-utils.js';
import { fetchWithRetry, withTimeout, runLimited } from '../../js/sw/retry.js';

/** A fake fetch that plays `script` in order: an Error is thrown, a number is a status. */
function scripted(script) {
  const calls = [];
  const fetch = async (request) => {
    calls.push(request);
    const step = script[calls.length - 1];
    if (step instanceof Error) throw step;
    return { ok: step >= 200 && step < 300, status: step };
  };
  return { fetch, calls };
}

function recordingSleep() {
  const waits = [];
  return { sleep: async (ms) => { waits.push(ms); }, waits };
}

suite('sw retry — fetchWithRetry', () => {
  test('first success returns at once without waiting', async () => {
    const { fetch, calls } = scripted([200]);
    const { sleep, waits } = recordingSleep();
    const res = await fetchWithRetry('a.js', { fetch, sleep });
    assertEqual(res.status, 200);
    assertEqual(calls.length, 1);
    assertDeepEqual(waits, []);
  });

  test('succeeds on the third attempt after waiting 500 and 1000 ms', async () => {
    const { fetch, calls } = scripted([new TypeError('Failed to fetch'), new TypeError('Failed to fetch'), 200]);
    const { sleep, waits } = recordingSleep();
    const res = await fetchWithRetry('a.js', { fetch, sleep });
    assertEqual(res.status, 200);
    assertEqual(calls.length, 3);
    assertDeepEqual(waits, [500, 1000]);
  });

  test('fails after three attempts with the last error', async () => {
    const last = new TypeError('third');
    const { fetch, calls } = scripted([new TypeError('first'), new TypeError('second'), last]);
    const { sleep } = recordingSleep();
    let caught = null;
    try { await fetchWithRetry('a.js', { fetch, sleep }); } catch (err) { caught = err; }
    assertEqual(caught, last);
    assertEqual(calls.length, 3);
  });

  test('a 404 counts as a failed attempt', async () => {
    const { fetch, calls } = scripted([404, 404, 404]);
    const { sleep } = recordingSleep();
    let caught = null;
    try { await fetchWithRetry('a.js', { fetch, sleep }); } catch (err) { caught = err; }
    assert(caught instanceof Error, 'throws');
    assert(caught.message.includes('404'), `message names the status: ${caught.message}`);
    assertEqual(calls.length, 3);
  });
});

suite('sw retry — withTimeout', () => {
  test('passes a faster result through', async () => {
    assertEqual(await withTimeout(Promise.resolve('page'), 50), 'page');
  });

  test('withTimeout rejects a promise that takes longer', async () => {
    const slow = new Promise((resolve) => setTimeout(() => resolve('late'), 200));
    let caught = null;
    try { await withTimeout(slow, 10); } catch (err) { caught = err; }
    assert(caught && caught.message.includes('timeout'), 'rejects with a timeout error');
  });
});

suite('sw retry — runLimited', () => {
  test('runs every item with at most `limit` at once', async () => {
    let running = 0;
    let peak = 0;
    const done = [];
    await runLimited([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++; peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      done.push(n); running--;
    });
    assertEqual(done.length, 7);
    assert(peak <= 3, `peak ${peak} exceeds the limit`);
  });

  test('rejects on the first failure and starts no new item', async () => {
    const started = [];
    let caught = null;
    try {
      await runLimited([1, 2, 3, 4, 5], 1, async (n) => {
        started.push(n);
        if (n === 2) throw new Error('boom');
      });
    } catch (err) { caught = err; }
    assertEqual(caught?.message, 'boom');
    assertDeepEqual(started, [1, 2]);
  });
});

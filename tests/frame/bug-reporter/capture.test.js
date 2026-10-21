import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { captureScreen, CaptureError } from '../../../js/frame/bug-reporter/capture.js';

function fakeEnv() {
  const stopped = [];
  const stream = { getTracks: () => [{ stop: () => stopped.push(1) }] };
  const nav = { mediaDevices: { getDisplayMedia: async () => stream } };
  const doc = {
    createElement() {
      return { readyState: 0, addEventListener() {}, play: async () => {} };
    },
  };
  return { nav, doc, stopped };
}

suite('bug-reporter capture', () => {
  test('times out when no first frame arrives and still stops the tracks', async () => {
    const { nav, doc, stopped } = fakeEnv();
    let err;
    try { await captureScreen(nav, doc, 20); } catch (e) { err = e; }
    assertTrue(err instanceof CaptureError);
    assertEqual(err.reason, 'failed');
    assertEqual(stopped.length, 1);
  });
});

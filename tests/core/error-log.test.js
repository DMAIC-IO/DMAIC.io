import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { createErrorLog } from '../../js/core/error-log.js';

function fakes() {
  const target = new EventTarget();
  const calls = [];
  const consoleObj = { error: (...a) => calls.push(a) };
  const now = () => new Date('2026-10-08T14:29:58Z');
  return { target, calls, consoleObj, now };
}

suite('error-log', () => {
  test('keeps only the last 20 entries', () => {
    const log = createErrorLog(fakes());
    for (let i = 0; i < 25; i++) log.record('error', `e${i}`, null);
    const e = log.getEntries();
    assertEqual(e.length, 20);
    assertEqual(e[0].message, 'e5');
    assertEqual(e[19].message, 'e24');
  });

  test('cuts stacks to 2000 chars', () => {
    const log = createErrorLog(fakes());
    log.record('error', 'x', 's'.repeat(5000));
    assertEqual(log.getEntries()[0].stack.length, 2000);
  });

  test('captures error events', () => {
    const f = fakes();
    const log = createErrorLog(f);
    log.install();
    const ev = new Event('error');
    ev.message = 'boom';
    ev.error = new TypeError('boom');
    f.target.dispatchEvent(ev);
    const [entry] = log.getEntries();
    assertEqual(entry.kind, 'error');
    assertEqual(entry.message, 'boom');
    assertTrue(entry.stack.includes('TypeError'));
    assertEqual(entry.at, '2026-10-08T14:29:58.000Z');
  });

  test('captures unhandled rejections', () => {
    const f = fakes();
    const log = createErrorLog(f);
    log.install();
    const ev = new Event('unhandledrejection');
    ev.reason = new Error('nope');
    f.target.dispatchEvent(ev);
    assertEqual(log.getEntries()[0].kind, 'unhandledrejection');
    assertEqual(log.getEntries()[0].message, 'Error: nope');
  });

  test('captures console.error and still calls the original', () => {
    const f = fakes();
    const log = createErrorLog(f);
    log.install();
    f.consoleObj.error('bad', 42);
    assertEqual(f.calls.length, 1);
    assertEqual(log.getEntries()[0].kind, 'console.error');
    assertEqual(log.getEntries()[0].message, 'bad 42');
  });

  test('install is idempotent and uninstall restores console', () => {
    const f = fakes();
    const original = f.consoleObj.error;
    const log = createErrorLog(f);
    log.install();
    log.install();
    f.consoleObj.error('once');
    assertEqual(log.getEntries().length, 1);
    log.uninstall();
    assertEqual(f.consoleObj.error, original);
  });

  test('records the error name, null without an Error', () => {
    const f = fakes();
    const log = createErrorLog(f);
    log.install();
    const ev = new Event('unhandledrejection');
    ev.reason = new RangeError('too far');
    f.target.dispatchEvent(ev);
    f.consoleObj.error('plain text');
    const [rejection, plain] = log.getEntries();
    assertEqual(rejection.name, 'RangeError');
    assertEqual(plain.name, null);
  });

  test('console.error without an Error records the call site', () => {
    const f = fakes();
    const log = createErrorLog(f);
    log.install();
    f.consoleObj.error('no error object');
    const { stack } = log.getEntries()[0];
    assertTrue(typeof stack === 'string' && stack.includes('error-log.test.js'));
    assertTrue(!stack.includes('no error object'));
  });

  test('getEntries returns a copy', () => {
    const log = createErrorLog(fakes());
    log.record('error', 'a', null);
    log.getEntries().push({});
    assertEqual(log.getEntries().length, 1);
  });
});

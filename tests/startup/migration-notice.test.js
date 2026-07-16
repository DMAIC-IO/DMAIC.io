/**
 * Tests for js/startup/migration-notice.js
 */
import { suite, test, assertEqual, beforeEach, afterEach } from '../test-utils.js';
import migrationNotice from '../../js/startup/migration-notice.js';

const KEY = 'dmike_import_migrated';

function makeCtx() {
  const calls = [];
  return {
    calls,
    notify: (msg, level) => calls.push({ msg, level }),
    i18n: { t: (key, vars) => `${key}:${JSON.stringify(vars ?? null)}` },
  };
}

suite('startup/migration-notice', () => {
  beforeEach(() => { sessionStorage.removeItem(KEY); });
  afterEach(() => { sessionStorage.removeItem(KEY); });

  test('shouldRun is false when flag absent', () => {
    assertEqual(migrationNotice.shouldRun(makeCtx()), false);
  });

  test('shouldRun is true when flag present', () => {
    sessionStorage.setItem(KEY, '{"from":"1.0","to":"2.0"}');
    assertEqual(!!migrationNotice.shouldRun(makeCtx()), true);
  });

  test('run notifies and clears the flag', () => {
    sessionStorage.setItem(KEY, '{"from":"1.0","to":"2.0"}');
    const ctx = makeCtx();
    migrationNotice.run(ctx);
    assertEqual(ctx.calls.length, 1);
    assertEqual(ctx.calls[0].level, 'info');
    assertEqual(sessionStorage.getItem(KEY), null);
  });

  test('run clears flag and does not throw on malformed JSON', () => {
    sessionStorage.setItem(KEY, 'not-json{');
    const ctx = makeCtx();
    migrationNotice.run(ctx);
    assertEqual(sessionStorage.getItem(KEY), null);
    assertEqual(ctx.calls.length, 0);
  });
});

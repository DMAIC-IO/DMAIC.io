/**
 * Tests for js/core/create-startup.js
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { createStartup } from '../../js/core/create-startup.js';

suite('createStartup', () => {
  test('init runs effect when shouldRun is true', async () => {
    let ran = false;
    const s = createStartup({ id: 's', shouldRun: () => true, run: () => { ran = true; } });
    await s.init({});
    assertEqual(ran, true);
  });

  test('init skips effect and returns false when shouldRun is false', async () => {
    let ran = false;
    const s = createStartup({ id: 's', shouldRun: () => false, run: () => { ran = true; } });
    const result = await s.init({});
    assertEqual(ran, false);
    assertEqual(result, false);
  });

  test('init always runs when shouldRun omitted', async () => {
    let ran = false;
    const s = createStartup({ id: 's', run: () => { ran = true; } });
    assertEqual(s.shouldRun, undefined);
    await s.init({});
    assertEqual(ran, true);
  });

  test('init awaits async shouldRun', async () => {
    let ran = false;
    const s = createStartup({ id: 's', shouldRun: async () => true, run: () => { ran = true; } });
    await s.init({});
    assertEqual(ran, true);
  });

  test('passes ctx through to run', async () => {
    let seen = null;
    const ctx = { marker: 42 };
    const s = createStartup({ id: 's', run: (c) => { seen = c; } });
    await s.init(ctx);
    assertEqual(seen.marker, 42);
  });

  test('exposes id, shouldRun, run as seams', () => {
    const shouldRun = () => true;
    const run = () => {};
    const s = createStartup({ id: 'my-task', shouldRun, run });
    assertEqual(s.id, 'my-task');
    assertTrue(s.shouldRun === shouldRun);
    assertTrue(s.run === run);
  });
});

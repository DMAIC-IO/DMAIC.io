/**
 * Smoke test for the response-optimization module shell.
 *
 * Verifies that:
 *   - the default export carries the required Module Interface fields
 *   - lazy-loading the module does not throw at import time
 *
 * Heavy logic (desirability, Nelder–Mead, optimizeResponses) is covered by the
 * engine tests in tests/engines/response-optimization.test.js. UI behaviour is
 * verified by the visual harness in tools/visual-test.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import mod from '../../js/modules/response-optimization/response-optimization.js';

suite('Response Optimization Module — shell', () => {
  test('exports a Module Interface object', () => {
    assertEqual(mod.id, 'response-optimization');
    assertEqual(mod.phase, 'improve');
    assertEqual(typeof mod.init, 'function');
    assertEqual(typeof mod.destroy, 'function');
    assertEqual(typeof mod.getState, 'function');
    assertEqual(typeof mod.setState, 'function');
  });

  test('lazy-loaded help section is bilingual', async () => {
    const helpModule = await mod.help();
    assertEqual(helpModule.default.moduleId, 'response-optimization');
    assertEqual(typeof helpModule.default.sections.overview.de, 'object');
    assertEqual(typeof helpModule.default.sections.overview.en, 'object');
  });

  test('getState round-trip preserves specs and optId', () => {
    const beforeSpecs = { 'm-1': { selected: true, kind: 'max', lower: 0, upper: 10, weight: 2 } };
    mod._specs = beforeSpecs;
    mod._optId = 'opt-abc';
    const snap = mod.getState();
    mod._specs = {};
    mod._optId = null;
    mod.setState(snap);
    assertEqual(mod._specs['m-1'].kind, 'max');
    assertEqual(mod._specs['m-1'].weight, 2);
    assertEqual(mod._optId, 'opt-abc');
  });
});

/**
 * Tests for js/core/state-manager.js that need real IndexedDB (module states
 * are persisted there by LocalAdapter). Browser runner only.
 */
import { suite, test, assertDeepEqual } from '../test-utils.js';
import { EventBus } from '../../js/core/event-bus.js';
import { StateManager } from '../../js/core/state-manager.js';
import { LocalAdapter } from '../../js/core/storage/local-adapter.js';
import { VERSION } from '../../js/core/version.js';
import { stripPatch } from '../../js/core/version-utils.js';

const LS_PREFIX = `dmike_v${stripPatch(VERSION)}_`;

suite('StateManager — IndexedDB persistence', () => {
  test('module state survives an unload flush before the async debounce (Bug 012)', async () => {
    localStorage.removeItem(`${LS_PREFIX}projects`);
    const adapter = new LocalAdapter();
    const sm = new StateManager(new EventBus(), adapter);
    await sm.load();                              // opens IDB, activates a project
    sm.setModuleState('inst-x', { hello: 'world' }); // queued; 500ms debounce NOT fired
    // Model the page unload: the synchronous flush the unload handlers now use.
    adapter.flushSync();
    // Model the reload/restart: a fresh manager reading the same storage.
    const sm2 = new StateManager(new EventBus(), new LocalAdapter());
    await sm2.load();
    assertDeepEqual(sm2.getModuleState('inst-x'), { hello: 'world' });
  });
});

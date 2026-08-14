/**
 * Tests for the scenario worksheet pool in provisionWorksheet().
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { provisionWorksheet } from '../../js/core/examples-registry.js';
import worksheetMod from '../../js/modules/worksheet/worksheet.js';

function makeContext(extra = {}) {
  const phases = { data: [] };
  const moduleStates = new Map();
  return {
    instanceId: 'ws-1',
    i18n: { t: (k) => k, getLanguage: () => 'de' },
    notify: () => {},
    confirmPopout: async () => true,
    stateManager: {
      get: (key) => (key === 'phases' ? phases : phases[key.split('.')[1]] ?? []),
      set: (key, value) => { phases[key.split('.')[1]] = value; },
      setModuleState: (id, state) => moduleStates.set(id, state),
      removeModuleState: (id) => moduleStates.delete(id),
    },
    eventBus: { emit: () => {} },
    _phases: phases,
    ...extra,
  };
}

const WS_STATE = { sheets: [{ id: 's-1', name: 'Daten', state: {} }], activeSheetId: 's-1' };

suite('provisionWorksheet without pool', () => {
  test('creates one instance per call', () => {
    const ctx = makeContext();
    const a = provisionWorksheet(ctx, WS_STATE);
    const b = provisionWorksheet(ctx, WS_STATE);
    assertTrue(a.instanceId !== b.instanceId, 'separate instances');
    assertEqual(ctx._phases.data.length, 2);
  });
});

suite('provisionWorksheet with pool', () => {
  test('reuses the instance for the same key', () => {
    const pool = new Map();
    const ctx = makeContext({ worksheetPool: pool, worksheetKey: 'worksheets/a.json' });
    const a = provisionWorksheet(ctx, WS_STATE);
    const b = provisionWorksheet(ctx, WS_STATE);
    assertEqual(a.instanceId, b.instanceId);
    assertEqual(ctx._phases.data.length, 1);
  });

  test('creates separate instances for different keys', () => {
    const pool = new Map();
    const ctxA = makeContext({ worksheetPool: pool, worksheetKey: 'worksheets/a.json' });
    const a = provisionWorksheet(ctxA, WS_STATE);
    const ctxB = { ...ctxA, worksheetKey: 'worksheets/b.json' };
    const b = provisionWorksheet(ctxB, WS_STATE);
    assertTrue(a.instanceId !== b.instanceId, 'different keys, different instances');
    assertEqual(pool.size, 2);
  });

  test('a pool without key behaves like no pool', () => {
    const pool = new Map();
    const ctx = makeContext({ worksheetPool: pool });
    const a = provisionWorksheet(ctx, WS_STATE);
    const b = provisionWorksheet(ctx, WS_STATE);
    assertTrue(a.instanceId !== b.instanceId, 'no key means no dedup');
    assertEqual(pool.size, 0);
  });
});

/**
 * Regression coverage for the "4 tabs instead of 2" scenario bug: a worksheet
 * item's OWN loadExample() must register itself into the pool under its key,
 * mirroring what provisionWorksheet() does for callers that reference it —
 * otherwise a later analysis item sharing that key misses the pool and
 * provisions a duplicate, out-of-sync copy of the same data.
 *
 * `worksheetMod.loadExample` is a plain `this`-based function assigned onto
 * the module descriptor (not a class), so it can be exercised directly by
 * spreading it onto a minimal fake instance — no DOM/Alpine mount needed.
 * `_persist` is stubbed the same way createModule's real wrapper injects it;
 * `_container`/`_tmpl` are intentionally absent, exercising the same
 * DOM-less fallback path `getState`/`setState` already have for detached
 * (headless) scenario loading.
 */
suite('worksheet loadExample — pool self-registration', () => {
  const PAYLOAD = {
    meta: { id: 'worksheet-pizza-lieferungen', title: { de: 'Lieferungen', en: 'Deliveries' } },
    data: { sheets: [{ id: 's-1', name: 'Daten', columns: [], rows: [] }], activeSheetId: 's-1' },
  };

  function makeWorksheetInstance(ctx) {
    return { ...worksheetMod, _context: ctx, _persist: () => {} };
  }

  test('registers itself under its own worksheetKey after loading', async () => {
    const pool = new Map();
    const ctx = makeContext({ worksheetPool: pool, worksheetKey: 'worksheets/pizza-delivery.json' });
    const instance = makeWorksheetInstance(ctx);

    await instance.loadExample(PAYLOAD);

    assertTrue(pool.has('worksheets/pizza-delivery.json'), 'pool has an entry for the key');
    assertEqual(pool.get('worksheets/pizza-delivery.json').instanceId, ctx.instanceId);
  });

  test('a later provisionWorksheet() for the same key reuses it instead of duplicating', async () => {
    const pool = new Map();
    const ctx = makeContext({ worksheetPool: pool, worksheetKey: 'worksheets/pizza-delivery.json' });
    const instance = makeWorksheetInstance(ctx);
    await instance.loadExample(PAYLOAD);

    // An analysis item (e.g. regression) referencing the same file next.
    const ref = provisionWorksheet(ctx, WS_STATE);

    assertEqual(ref.instanceId, ctx.instanceId, 'reuses the worksheet\'s own instance');
    assertEqual(ctx._phases.data.length, 0, 'no duplicate instance was provisioned');
  });

  test('without a pool/key (non-scenario load), does not register anything', async () => {
    const ctx = makeContext(); // no worksheetPool/worksheetKey — a normal example-load click
    const instance = makeWorksheetInstance(ctx);
    await instance.loadExample(PAYLOAD); // must not throw
    assertTrue(true, 'no worksheetPool/worksheetKey means loadExample is a no-op for dedup');
  });
});

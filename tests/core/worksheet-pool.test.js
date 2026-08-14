/**
 * Tests for the scenario worksheet pool in provisionWorksheet().
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { provisionWorksheet } from '../../js/core/examples-registry.js';

function makeContext(extra = {}) {
  const phases = { data: [] };
  const moduleStates = new Map();
  return {
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

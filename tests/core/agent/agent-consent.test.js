/**
 * Tests for core/agent/agent-consent.js — the consent gate.
 * The contract under test: no information reaches the agent before the user
 * has decided, and granting prompts the export that replaces undo. Ruling K2
 * adds `agent:consent-changed` so the settings section can stay current even
 * though `settings.*` writes don't emit `data:changed`.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import {
  CONSENT_PATH, readConsent, grantConsent, revokeConsent, createConsentGate,
} from '../../../js/core/agent/agent-consent.js';

/** Minimal stateManager: only get/set over a dot path. */
function makeStateManager(initial = {}) {
  const state = structuredClone(initial);
  return {
    state,
    get(path) { return path.split('.').reduce((o, k) => o?.[k], state); },
    set(path, value) {
      const keys = path.split('.');
      let o = state;
      for (let i = 0; i < keys.length - 1; i++) { o[keys[i]] ??= {}; o = o[keys[i]]; }
      o[keys.at(-1)] = value;
    },
  };
}

/** Minimal eventBus recording every emit. */
function makeEventBus() {
  const emitted = [];
  return { emitted, emit(event, payload) { emitted.push([event, payload]); } };
}

function makeGate({ answer = true, stored = {}, t = (k) => k, eventBus } = {}) {
  const calls = [];
  const stateManager = makeStateManager(stored);
  const gate = createConsentGate({
    stateManager,
    t,
    openDialog: () => { calls.push('dialog'); return answer instanceof Promise ? answer : Promise.resolve(answer); },
    promptExport: async () => { calls.push('export'); },
    eventBus,
  });
  return { gate, calls, stateManager };
}

suite('agent consent — storage', () => {
  test('an untouched profile has no consent', () => {
    assertDeepEqual(readConsent(makeStateManager()), { granted: false, at: null, contract: null });
  });

  test('grantConsent writes granted, a timestamp and the contract version', () => {
    const sm = makeStateManager();
    grantConsent(sm);
    const stored = readConsent(sm);
    assertEqual(stored.granted, true);
    assertEqual(stored.contract, 1);
    assertTrue(typeof stored.at === 'string' && stored.at.length > 0);
  });

  test('revokeConsent clears it', () => {
    const sm = makeStateManager();
    grantConsent(sm);
    revokeConsent(sm);
    assertEqual(readConsent(sm).granted, false);
  });

  test('the storage path lives under settings so it is profile-global', () => {
    assertTrue(CONSENT_PATH.startsWith('settings.'), CONSENT_PATH);
  });
});

suite('agent consent — K2 event', () => {
  test('grantConsent emits agent:consent-changed with granted true when given an eventBus', () => {
    const sm = makeStateManager();
    const bus = makeEventBus();
    grantConsent(sm, bus);
    assertDeepEqual(bus.emitted, [['agent:consent-changed', { granted: true }]]);
  });

  test('revokeConsent emits agent:consent-changed with granted false when given an eventBus', () => {
    const sm = makeStateManager();
    const bus = makeEventBus();
    grantConsent(sm, bus);
    revokeConsent(sm, bus);
    assertDeepEqual(bus.emitted, [
      ['agent:consent-changed', { granted: true }],
      ['agent:consent-changed', { granted: false }],
    ]);
  });

  test('without an eventBus, grant and revoke do not throw', () => {
    const sm = makeStateManager();
    grantConsent(sm);
    revokeConsent(sm);
    assertEqual(readConsent(sm).granted, false);
  });
});

suite('agent consent — gate', () => {
  test('a fresh profile opens the dialog and, on grant, prompts the export', async () => {
    const { gate, calls, stateManager } = makeGate({ answer: true });
    const r = await gate.ensure();
    assertDeepEqual(r, { ok: true });
    assertDeepEqual(calls, ['dialog', 'export']);
    assertEqual(readConsent(stateManager).granted, true);
  });

  test('denial returns consent_denied and stores nothing', async () => {
    const { gate, calls, stateManager } = makeGate({ answer: false });
    const r = await gate.ensure();
    assertEqual(r.ok, false);
    assertEqual(r.error, 'consent_denied');
    assertDeepEqual(calls, ['dialog']);
    assertEqual(readConsent(stateManager).granted, false);
  });

  test('a denial is not remembered — the next call asks again', async () => {
    const { gate, calls } = makeGate({ answer: false });
    await gate.ensure();
    await gate.ensure();
    assertDeepEqual(calls, ['dialog', 'dialog']);
  });

  test('stored consent short-circuits: no dialog, no export prompt', async () => {
    const { gate, calls } = makeGate({
      stored: { settings: { agent: { consent: { granted: true, at: '2026-10-08T00:00:00.000Z', contract: 1 } } } },
    });
    assertDeepEqual(await gate.ensure(), { ok: true });
    assertDeepEqual(calls, []);
  });

  test('two concurrent first calls share one dialog', async () => {
    let settle;
    const pending = new Promise(res => { settle = res; });
    const { gate, calls } = makeGate({ answer: pending });
    const a = gate.ensure();
    const b = gate.ensure();
    settle(true);
    assertDeepEqual([await a, await b], [{ ok: true }, { ok: true }]);
    assertDeepEqual(calls, ['dialog', 'export']);
  });

  test('after a revoke the gate asks again', async () => {
    const { gate, calls, stateManager } = makeGate({ answer: true });
    await gate.ensure();
    revokeConsent(stateManager);
    await gate.ensure();
    assertDeepEqual(calls, ['dialog', 'export', 'dialog', 'export']);
  });

  test('a failing export prompt does not revoke the granted consent', async () => {
    const sm = makeStateManager();
    const gate = createConsentGate({
      stateManager: sm,
      t: (k) => k,
      openDialog: async () => true,
      promptExport: async () => { throw new Error('download blocked'); },
    });
    assertDeepEqual(await gate.ensure(), { ok: true });
    assertEqual(readConsent(sm).granted, true);
  });
});

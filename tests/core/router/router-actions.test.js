/**
 * Tests for the Router's `action` route branch: exactly one navigation per
 * action, a distinct message for an unknown verb vs a verb that threw, and a
 * action modal that is always closed again.
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { Router } from '../../../js/core/router/router.js';

function harness(initialHash = '', phases = { define: [], measure: [] }) {
  const writes = [];
  const fakeWin = {
    location: { hash: initialHash },
    history: {
      pushState(s, t, url) { fakeWin.location.hash = url.replace(/^[^#]*/, ''); writes.push(`push:${url}`); },
      replaceState(s, t, url) { fakeWin.location.hash = url.replace(/^[^#]*/, ''); writes.push(`replace:${url}`); },
    },
    addEventListener() {},
  };
  const notes = [];
  const modalLog = [];
  const deps = {
    stateManager: {
      get(key) {
        if (key === 'phases') return phases;
        const m = key.match(/^phases\.(.+)$/);
        return m ? (phases[m[1]] ?? []) : [];
      },
      set() {},
      switchProject() {},
      getActiveProjectId() { return 'p-1'; },
      getProjectCycle() { return 'dmaic'; },
    },
    moduleRegistry: { setActiveCycle() {}, get() { return null; } },
    eventBus: { emit() {}, on() {}, off() {} },
    dmaicTiles: { selectPhase() {}, getActivePhase() { return null; } },
    workspace: { getActiveModuleInfo: () => null },
    pages: new Map(),
    Alpine: { store: () => ({}) },
    win: fakeWin,
  };
  const actionModal = {
    open: (o) => modalLog.push(`open:${o?.title}`),
    update: () => {},
    hold: async (o) => { modalLog.push(`hold:${o?.title}`); },
    close: () => modalLog.push('close'),
    isOpen: () => true,
  };
  const i18n = { t: (k, p) => (p ? `${k}:${JSON.stringify(p)}` : k), getLanguage: () => 'de' };
  const notify = (msg) => notes.push(msg);
  return { deps, fakeWin, writes, notes, modalLog, actionModal, i18n, notify };
}

suite('router/action routes', () => {
  test('a successful action performs exactly one navigation', async () => {
    const h = harness('#/action/scenario/scn-a');
    const r = new Router(h.deps);
    r.setActionVerbs(new Map([['scenario', {
      modal: { render: () => ({ title: 'T', subtitle: 'S' }), done: null },
      run: async () => ({ route: { kind: 'phase', projectId: 'p-1', phaseId: 'define' } }),
      list: () => [],
    }]]), h.actionModal, h.notify, h.i18n);

    await r.applyHash();

    assertEqual(h.writes.length, 1, `expected one hash write, got ${JSON.stringify(h.writes)}`);
    assertEqual(h.writes[0], 'replace:#/project/p-1/phase/define');
    assertEqual(h.fakeWin.location.hash, '#/project/p-1/phase/define');
  });

  test('a populated target phase adds only the router\'s own module forwarding', async () => {
    // The shape every real scenario action produces: the target phase holds the
    // instances the scenario just created, so the router's pre-existing
    // phase→first-module forwarding (router.js) fires once. Two writes, CHAINED
    // (action → phase → module) — not the reentrant double-navigation ruling 1
    // forbids, which would come from the verb navigating on its own.
    const h = harness('#/action/scenario/scn-a', {
      define: [{ instanceId: 'i1', moduleId: 'sipoc' }], measure: [],
    });
    const r = new Router(h.deps);
    r.setActionVerbs(new Map([['scenario', {
      modal: { render: () => ({ title: 'T', subtitle: 'S' }), done: null },
      run: async () => ({ route: { kind: 'phase', projectId: 'p-1', phaseId: 'define' } }),
      list: () => [],
    }]]), h.actionModal, h.notify, h.i18n);

    await r.applyHash();

    assertEqual(h.writes.length, 2, `expected two hash writes, got ${JSON.stringify(h.writes)}`);
    assertEqual(h.writes[0], 'replace:#/project/p-1/phase/define');
    assertEqual(h.writes[1], 'replace:#/project/p-1/module/i1');
    assertEqual(h.fakeWin.location.hash, '#/project/p-1/module/i1');
  });

  test('the action modal is opened and closed again', async () => {
    const h = harness('#/action/scenario/scn-a');
    const r = new Router(h.deps);
    r.setActionVerbs(new Map([['scenario', {
      modal: { render: () => ({ title: 'T', subtitle: 'S' }), done: null },
      run: async () => ({ route: { kind: 'phase', projectId: 'p-1', phaseId: 'define' } }),
      list: () => [],
    }]]), h.actionModal, h.notify, h.i18n);

    await r.applyHash();
    assertEqual(h.modalLog.join(','), 'open:T,close');
  });

  test('an unknown verb reports actions.unknown and lands on a real route', async () => {
    const h = harness('#/action/nope/x');
    const r = new Router(h.deps);
    r.setActionVerbs(new Map(), h.actionModal, h.notify, h.i18n);

    await r.applyHash();

    assertTrue(h.notes.some(n => n.startsWith('actions.unknown')), `got ${JSON.stringify(h.notes)}`);
    assertTrue(!h.fakeWin.location.hash.includes('/action/'), 'hash left the action route');
    assertEqual(h.modalLog.includes('open:undefined'), false);
  });

  test('a verb that throws reports actions.failed, not actions.unknown', async () => {
    const h = harness('#/action/scenario/boom');
    const r = new Router(h.deps);
    r.setActionVerbs(new Map([['scenario', {
      modal: { render: () => ({ title: 'T', subtitle: 'S' }), done: null },
      run: async () => { throw new Error('kaputt'); },
      list: () => [],
    }]]), h.actionModal, h.notify, h.i18n);

    await r.applyHash();

    assertTrue(h.notes.some(n => n.startsWith('actions.failed')), `got ${JSON.stringify(h.notes)}`);
    assertEqual(h.notes.some(n => n.startsWith('actions.unknown')), false);
    assertTrue(h.modalLog.includes('close'), 'action modal closed after failure');
    assertTrue(!h.fakeWin.location.hash.includes('/action/'), 'hash left the action route');
  });

  test('a verb without a modal never opens one', async () => {
    const h = harness('#/action/quick/x');
    const r = new Router(h.deps);
    r.setActionVerbs(new Map([['quick', {
      modal: null,
      run: async () => ({ route: { kind: 'phase', projectId: 'p-1', phaseId: 'define' } }),
      list: () => [],
    }]]), h.actionModal, h.notify, h.i18n);

    await r.applyHash();

    assertTrue(!h.modalLog.some(e => e.startsWith('open:')), 'no modal for a modal-less verb');
    assertEqual(h.notes.length, 0, `verb ran cleanly, got ${JSON.stringify(h.notes)}`);
    assertEqual(h.writes.length, 1, `expected one hash write, got ${JSON.stringify(h.writes)}`);
    assertEqual(h.writes[0], 'replace:#/project/p-1/phase/define');
  });

  test('done() holds the modal until it resolves, then navigates once', async () => {
    const h = harness('#/action/scenario/scn-a');
    let release = null;
    h.actionModal.hold = (o) => {
      h.modalLog.push(`hold:${o?.title}`);
      return new Promise((resolve) => { release = resolve; });
    };
    const r = new Router(h.deps);
    r.setActionVerbs(new Map([['scenario', {
      modal: {
        render: () => ({ title: 'T', subtitle: 'S' }),
        done: (detail) => ({ title: `D:${detail?.loaded?.length ?? 0}`, confirmLabel: 'go' }),
      },
      run: async () => ({
        route: { kind: 'phase', projectId: 'p-1', phaseId: 'define' },
        detail: { loaded: ['a'], failed: [] },
      }),
      list: () => [],
    }]]), h.actionModal, h.notify, h.i18n);

    const applied = r.applyHash();
    // Drain microtasks until the hold state is reached (bounded, no timers).
    for (let i = 0; i < 50 && !h.modalLog.some(e => e.startsWith('hold:')); i++) {
      await Promise.resolve();
    }
    assertEqual(h.writes.length, 0, `no navigation while held, got ${JSON.stringify(h.writes)}`);
    assertTrue(h.modalLog.includes('hold:D:1'), `hold state rendered, got ${JSON.stringify(h.modalLog)}`);

    release();
    await applied;

    assertEqual(h.writes.length, 1, `expected one hash write, got ${JSON.stringify(h.writes)}`);
    assertEqual(h.writes[0], 'replace:#/project/p-1/phase/define');
  });

  test('a throwing verb never enters the hold state and still closes', async () => {
    const h = harness('#/action/scenario/boom');
    const r = new Router(h.deps);
    r.setActionVerbs(new Map([['scenario', {
      modal: {
        render: () => ({ title: 'T', subtitle: 'S' }),
        done: () => ({ title: 'D', confirmLabel: 'go' }),
      },
      run: async () => { throw new Error('kaputt'); },
      list: () => [],
    }]]), h.actionModal, h.notify, h.i18n);

    await r.applyHash();

    assertTrue(!h.modalLog.some(e => e.startsWith('hold:')), `no hold on failure, got ${JSON.stringify(h.modalLog)}`);
    assertTrue(h.modalLog.includes('close'), 'action modal closed after failure');
    assertTrue(h.notes.some(n => n.startsWith('actions.failed')), `got ${JSON.stringify(h.notes)}`);
  });
});

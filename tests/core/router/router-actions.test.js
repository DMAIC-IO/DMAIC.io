/**
 * Tests for the Router's `action` route branch: exactly one navigation per
 * action, a distinct message for an unknown verb vs a verb that threw, and a
 * splash overlay that is always hidden again.
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
  const splashLog = [];
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
  const splash = {
    show: (o) => splashLog.push(`show:${o?.title}`),
    update: () => {},
    hide: () => splashLog.push('hide'),
  };
  const i18n = { t: (k, p) => (p ? `${k}:${JSON.stringify(p)}` : k), getLanguage: () => 'de' };
  const notify = (msg) => notes.push(msg);
  return { deps, fakeWin, writes, notes, splashLog, splash, i18n, notify };
}

suite('router/action routes', () => {
  test('a successful action performs exactly one navigation', async () => {
    const h = harness('#/action/scenario/scn-a');
    const r = new Router(h.deps);
    r.setActionVerbs(new Map([['scenario', {
      run: async () => ({ kind: 'phase', projectId: 'p-1', phaseId: 'define' }),
      describe: () => ({ title: 'T', subtitle: 'S' }),
      list: () => [],
    }]]), h.splash, h.notify, h.i18n);

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
      run: async () => ({ kind: 'phase', projectId: 'p-1', phaseId: 'define' }),
      describe: () => ({ title: 'T', subtitle: 'S' }),
      list: () => [],
    }]]), h.splash, h.notify, h.i18n);

    await r.applyHash();

    assertEqual(h.writes.length, 2, `expected two hash writes, got ${JSON.stringify(h.writes)}`);
    assertEqual(h.writes[0], 'replace:#/project/p-1/phase/define');
    assertEqual(h.writes[1], 'replace:#/project/p-1/module/i1');
    assertEqual(h.fakeWin.location.hash, '#/project/p-1/module/i1');
  });

  test('the splash is shown and hidden again', async () => {
    const h = harness('#/action/scenario/scn-a');
    const r = new Router(h.deps);
    r.setActionVerbs(new Map([['scenario', {
      run: async () => ({ kind: 'phase', projectId: 'p-1', phaseId: 'define' }),
      describe: () => ({ title: 'T', subtitle: 'S' }),
      list: () => [],
    }]]), h.splash, h.notify, h.i18n);

    await r.applyHash();
    assertEqual(h.splashLog.join(','), 'show:T,hide');
  });

  test('an unknown verb reports actions.unknown and lands on a real route', async () => {
    const h = harness('#/action/nope/x');
    const r = new Router(h.deps);
    r.setActionVerbs(new Map(), h.splash, h.notify, h.i18n);

    await r.applyHash();

    assertTrue(h.notes.some(n => n.startsWith('actions.unknown')), `got ${JSON.stringify(h.notes)}`);
    assertTrue(!h.fakeWin.location.hash.includes('/action/'), 'hash left the action route');
    assertEqual(h.splashLog.includes('show:undefined'), false);
  });

  test('a verb that throws reports actions.failed, not actions.unknown', async () => {
    const h = harness('#/action/scenario/boom');
    const r = new Router(h.deps);
    r.setActionVerbs(new Map([['scenario', {
      run: async () => { throw new Error('kaputt'); },
      describe: () => ({ title: 'T', subtitle: 'S' }),
      list: () => [],
    }]]), h.splash, h.notify, h.i18n);

    await r.applyHash();

    assertTrue(h.notes.some(n => n.startsWith('actions.failed')), `got ${JSON.stringify(h.notes)}`);
    assertEqual(h.notes.some(n => n.startsWith('actions.unknown')), false);
    assertTrue(h.splashLog.includes('hide'), 'splash hidden after failure');
    assertTrue(!h.fakeWin.location.hash.includes('/action/'), 'hash left the action route');
  });
});

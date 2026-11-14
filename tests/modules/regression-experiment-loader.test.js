/**
 * Regression — reading the planners' experiments (experiment-loader.js)
 *
 * Coalesced reads, read failures, the race of a newer read during an import,
 * cleanup on dispose, the rejection of an unknown key and the "no longer
 * available" state.
 */

import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { createExperimentLoader, importFromPlanners, importSourceMissing } from '../../js/modules/regression/experiment-loader.js';
import { State } from '../../js/modules/regression/regression-model.js';

/** An experiment with one response on ws-1/sheet-1. */
function experiment(name = 'E') {
  return {
    name, plannedTerms: { linear: true, terms: ['M0', 'M1'] }, factors: [{ kind: 'continuous' }, { kind: 'continuous' }],
    runMatrix: { worksheetRef: { instanceId: 'ws-1', sheetId: 'sheet-1' }, columnTags: { factors: ['f0', 'f1'] } },
    responseColumns: [{ name: 'Y', columnId: 'r' }],
  };
}

/**
 * A fake `ctx.instances`: `planners` is mutable; each read waits for `release()`
 * when `hold` is set.
 */
function fakeInstances(planners) {
  const calls = { list: 0, read: 0 };
  const waiting = [];
  const svc = {
    hold: false,
    planners,
    list() { calls.list++; return Object.keys(svc.planners).map(instanceId => ({ instanceId })); },
    async read(id) {
      calls.read++;
      const value = svc.planners[id];
      if (svc.hold) await new Promise(r => waiting.push(r));
      if (value instanceof Error) throw value;
      return { experiment: value };
    },
    release() { for (const r of waiting.splice(0)) r(); },
    calls,
  };
  return svc;
}

const tick = () => new Promise(r => setTimeout(r, 0));

suite('Regression — experiment loader', () => {
  test('a planner that cannot be read counts without experiment', async () => {
    const svc = fakeInstances({ p1: new Error('needs_mount'), p2: experiment() });
    const loader = createExperimentLoader(svc, () => {});
    const out = await loader.load();
    assertDeepEqual(out.map(e => [e.plannerId, Boolean(e.experiment)]), [['p1', false], ['p2', true]]);
  });

  test('requests during a read are coalesced into one follow-up read', async () => {
    const svc = fakeInstances({ p1: experiment() });
    svc.hold = true;
    const results = [];
    const loader = createExperimentLoader(svc, (r) => results.push(r));
    const a = loader.load();
    const b = loader.load();
    const c = loader.load();
    await tick(); svc.release(); await tick(); svc.release();
    await Promise.all([a, b, c]);
    assertEqual(svc.calls.list, 2);
    assertEqual(results.length, 2);
  });

  test('race: a newer read during the import — the import checks a read that started after it', async () => {
    const svc = fakeInstances({ p0: null });
    const loader = createExperimentLoader(svc, () => {});
    await loader.load();
    svc.hold = true;
    const early = loader.load(); // e.g. worksheet:dataChanged, still in flight
    svc.planners = { p0: null, p1: experiment() }; // the planner's experiment appears
    const s = new State();
    const imported = importFromPlanners(s, loader, 'p1|raw|0');
    await tick(); svc.release(); await tick(); svc.release();
    await early;
    assertEqual(await imported, true);
    assertEqual(s.activeImportSource.experimentId, 'p1');
    assertDeepEqual(loader.current().map(e => e.plannerId), ['p0', 'p1']);
    assertEqual(svc.calls.list, 3);
  });

  test('an older result never overwrites a newer one', async () => {
    const svc = fakeInstances({ p1: experiment('old') });
    svc.hold = true;
    const seen = [];
    const loader = createExperimentLoader(svc, (r) => seen.push(r[0]?.experiment?.name));
    const first = loader.load();
    svc.planners = { p1: experiment('new') };
    loader.load();
    await tick(); svc.release(); await tick(); svc.release();
    await first;
    assertDeepEqual(seen, ['old', 'new']);
    assertEqual(loader.current()[0].experiment.name, 'new');
  });

  test('dispose: events no longer read, a running read writes nothing', async () => {
    const svc = fakeInstances({ p1: experiment() });
    const handlers = new Map();
    const bus = {
      on(ev, h) { handlers.set(ev, h); },
      off(ev, h) { if (handlers.get(ev) === h) handlers.delete(ev); },
    };
    let results = 0;
    const loader = createExperimentLoader(svc, () => { results++; });
    loader.watch(bus, ['module:added', 'worksheet:dataChanged']);
    assertEqual(handlers.size, 2);
    svc.hold = true;
    handlers.get('module:added')();
    loader.dispose();
    assertEqual(handlers.size, 0);
    await tick(); svc.release(); await tick();
    assertEqual(results, 0);
  });

  test('importFromPlanners rejects an unknown key and leaves the state', async () => {
    const svc = fakeInstances({ p1: experiment() });
    const loader = createExperimentLoader(svc, () => {});
    const s = new State();
    let err = null;
    try { await importFromPlanners(s, loader, 'gone|raw|0'); } catch (e) { err = e; }
    assertEqual(err instanceof Error, true);
    assertEqual(String(err.message).includes('gone|raw|0'), true);
    assertEqual(s.activeImportSource, null);
  });

  test('without instance service: no read, empty list', async () => {
    const loader = createExperimentLoader(null, () => {});
    assertDeepEqual(await loader.load(), []);
  });
});

suite('Regression — import source no longer available', () => {
  test('missing when the planner is gone or has no experiment, unknown before the first read', () => {
    const s = new State();
    s.activeImportSource = { experimentId: 'p1', sourceColumn: 'r', transform: 'identity' };
    assertEqual(importSourceMissing(s, [], false), false);
    assertEqual(importSourceMissing(s, [], true), true);
    assertEqual(importSourceMissing(s, [{ plannerId: 'p1', experiment: null }], true), true);
    assertEqual(importSourceMissing(s, [{ plannerId: 'p1', experiment: experiment() }], true), false);
    s.activeImportSource = null;
    assertEqual(importSourceMissing(s, [], true), false);
  });
});

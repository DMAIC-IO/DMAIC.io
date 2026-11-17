/**
 * Tests for core/router/action-verbs.js
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import { createActionVerbs } from '../../js/core/router/action-verbs.js';
import { buildSheetState } from '../../js/core/zeg-sheet/zeg-sheet-model.js';
import { useStoredWorksheetReader } from '../helpers/worksheet-reader.js';
import { fakeKernelSurface } from '../helpers/kernel-surface.js';

// Mirrors a real catalog entry: scenarios are identified by `type: 'scenario'`
// (examples/index.json), the same predicate ExamplesRegistry.getScenarios() uses.
const SCENARIOS = [
  { id: 'scn-a', type: 'scenario', cycle: 'dmaic', startPhase: 'define', items: ['ex-a'],
    title: { de: 'A', en: 'A' }, description: { de: '', en: '' } },
  { id: 'scn-b', type: 'scenario', cycle: 'dmaic', startPhase: 'define', items: ['ex-a'],
    title: { de: 'Szenario B', en: 'Scenario B' }, description: { de: '', en: '' },
    projectName: { de: 'Kurz', en: 'Short' } },
];

function makeCtx() {
  const calls = [];
  return {
    calls,
    ctx: {
      i18n: { t: (k, p) => (p ? `${k}:${JSON.stringify(p)}` : k), getLanguage: () => 'de' },
      examplesRegistry: {
        getScenarios: () => SCENARIOS,
        getScenario: (id) => SCENARIOS.find(s => s.id === id),
        get: async (id) => (id === 'ex-a' ? { id, modules: ['sipoc'] } : undefined),
        peek: (id) => (id === 'ex-a' ? { id, modules: ['sipoc'] } : undefined),
      },
      stateManager: {
        createProject: (name, cycle) => { calls.push(`create:${name}:${cycle}`); return 'p-new'; },
        switchProject: async (id) => { calls.push(`switch:${id}`); },
        getActiveProjectId: () => 'p-new',
        getProjectCycle: () => 'dmaic',
      },
      loadScenario: async ({ scenario }) => {
        calls.push(`load:${scenario.id}`);
        return { loaded: scenario.items, failed: [], worksheets: 1 };
      },
      rehydrateProject: async (opts) => { calls.push(`rehydrate:${JSON.stringify(opts ?? null)}`); },
      notify: (msg) => calls.push(`notify:${msg}`),
      splash: { show: () => calls.push('splash:show'), update: () => {}, hide: () => calls.push('splash:hide') },
    },
  };
}

suite('action verbs', () => {
  test('registry exposes scenario, new-project and example', () => {
    const verbs = createActionVerbs(makeCtx().ctx);
    ['scenario', 'new-project', 'example'].forEach(v => assertTrue(verbs.has(v), `${v} missing`));
  });

  test('scenario verb creates a project, rehydrates and loads', async () => {
    const { ctx, calls } = makeCtx();
    const res = await createActionVerbs(ctx).get('scenario').run(['scn-a']);
    assertTrue(calls.includes('create:A:dmaic'), 'project created with scenario title');
    const rehydrateAt = calls.findIndex(c => c.startsWith('rehydrate:'));
    assertTrue(rehydrateAt > -1 && rehydrateAt < calls.indexOf('load:scn-a'), 'rehydrate before load');
    assertEqual(res.route.kind, 'phase');
    assertEqual(res.route.phaseId, 'define');
    assertDeepEqual(res.detail.loaded, ['ex-a'], 'run() hands the load result back for done()');
  });

  test('scenario verb rehydrates without navigating (router owns the navigation)', async () => {
    const { ctx, calls } = makeCtx();
    await createActionVerbs(ctx).get('scenario').run(['scn-a']);
    assertTrue(
      calls.some(c => c.startsWith('rehydrate:') && c.includes('"navigate":false')),
      'rehydrateProject called with { navigate: false }',
    );
  });

  test('scenario verb rejects an unknown id', async () => {
    const { ctx } = makeCtx();
    let error = null;
    try { await createActionVerbs(ctx).get('scenario').run(['nope']); }
    catch (err) { error = err; }
    assertTrue(!!error, 'throws for unknown scenario');
  });

  test('a partially failed scenario notifies with the failed example ids', async () => {
    const { ctx, calls } = makeCtx();
    ctx.loadScenario = async ({ scenario }) => {
      calls.push(`load:${scenario.id}`);
      return { loaded: [], failed: [{ exampleId: 'ex-a', moduleId: 'sipoc', error: 'module failed to mount' }], worksheets: 0 };
    };
    await createActionVerbs(ctx).get('scenario').run(['scn-a']);
    const failNote = calls.find(c => c.startsWith('notify:actions.scenarioItemsFailed'));
    assertTrue(!!failNote, 'failed items are surfaced');
    assertTrue(failNote.includes('ex-a'), 'failed example id is named');
    assertTrue(!failNote.includes('module failed to mount'), 'raw developer error is not shown');
  });

  test('scenario verb rejects an entry that only looks like one', async () => {
    const { ctx } = makeCtx();
    // Same shape as a scenario (has `items`) but not typed as one — must not
    // be loadable via #/action/scenario/…, or list() and run() would disagree.
    ctx.examplesRegistry.getScenario = (id) => (id === 'faux'
      ? { id: 'faux', type: 'project', items: ['ex-a'] } : undefined);
    let error = null;
    try { await createActionVerbs(ctx).get('scenario').run(['faux']); }
    catch (err) { error = err; }
    assertTrue(!!error, 'throws for a non-scenario entry carrying items');
  });

  test('scenario verb falls back when startPhase is unknown', async () => {
    const { ctx } = makeCtx();
    ctx.examplesRegistry.getScenario = (id) => (id === 'scn-typo'
      ? { ...SCENARIOS[0], id: 'scn-typo', startPhase: 'defien' } : undefined);
    const res = await createActionVerbs(ctx).get('scenario').run(['scn-typo']);
    assertEqual(res.route.phaseId, 'define', 'typo falls back to the first phase');
  });

  test('new-project verb creates an empty project in the given cycle', async () => {
    const { ctx, calls } = makeCtx();
    const res = await createActionVerbs(ctx).get('new-project').run(['dmaic']);
    assertTrue(calls.some(c => c.startsWith('create:')), 'project created');
    assertEqual(res.route.kind, 'phase');
  });

  test('scenario uses projectName when present, title otherwise', async () => {
    const { ctx: ctxA, calls: callsA } = makeCtx();
    await createActionVerbs(ctxA).get('scenario').run(['scn-a']);
    assertTrue(callsA.includes('create:A:dmaic'), 'scn-a has no projectName, falls back to title');

    const { ctx: ctxB, calls: callsB } = makeCtx();
    await createActionVerbs(ctxB).get('scenario').run(['scn-b']);
    assertTrue(callsB.includes('create:Kurz:dmaic'), 'scn-b uses its projectName override');
  });

  test('new-project uses the name argument, trimmed, with a default fallback', async () => {
    const { ctx: ctx1, calls: calls1 } = makeCtx();
    await createActionVerbs(ctx1).get('new-project').run(['dmaic', '  Mein Projekt  ']);
    assertTrue(calls1.includes('create:Mein Projekt:dmaic'), 'name argument is trimmed');

    const { ctx: ctx2, calls: calls2 } = makeCtx();
    await createActionVerbs(ctx2).get('new-project').run(['dmaic', '   ']);
    assertTrue(calls2.includes('create:app.defaultProjectName:dmaic'), 'blank name falls back to default');
  });

  test('list() enumerates every scenario', () => {
    const { ctx } = makeCtx();
    assertDeepEqual(createActionVerbs(ctx).get('scenario').list().map(e => e.arg), ['scn-a', 'scn-b']);
  });

  test('scenario declares a holding modal, new-project declares none', () => {
    const verbs = createActionVerbs(makeCtx().ctx);
    assertTrue(typeof verbs.get('scenario').modal.render === 'function');
    assertTrue(typeof verbs.get('scenario').modal.done === 'function');
    assertEqual(verbs.get('new-project').modal, null, 'new-project is too short for a modal');
    assertEqual(verbs.get('example').modal.done, null, 'example auto-closes');
  });

  test('scenario modal.render() titles the dialog with the scenario name', () => {
    const { ctx } = makeCtx();
    const d = createActionVerbs(ctx).get('scenario').modal.render(['scn-a']);
    assertEqual(typeof d.title, 'string');
    assertEqual(d.subtitle, 'A');
  });

  test('scenario done() reports loaded/total', () => {
    const { ctx } = makeCtx();
    const state = createActionVerbs(ctx).get('scenario').modal
      .done({ loaded: ['ex-a'], failed: [], worksheets: 1 }, ['scn-a']);
    assertTrue(typeof state.title === 'string' && typeof state.confirmLabel === 'string');
    assertTrue(state.subtitle.includes('"loaded":1') && state.subtitle.includes('"total":1'),
      `loaded/total reported, got ${state.subtitle}`);
  });

  test('scenario done() does not claim success when items failed', () => {
    // The warning toast that names the failed items is dimmed out behind the
    // action overlay and expires unseen while the dialog holds — so the DIALOG
    // has to tell the truth, or nothing does.
    const { ctx } = makeCtx();
    const verbs = createActionVerbs(ctx);
    const ok = verbs.get('scenario').modal.done({ loaded: ['ex-a'], failed: [] }, ['scn-a']);
    const bad = verbs.get('scenario').modal.done(
      { loaded: [], failed: [{ exampleId: 'ex-a', moduleId: 'sipoc', error: 'module failed to mount' }] },
      ['scn-a'],
    );
    assertEqual(ok.title, 'actions.scenarioReady', 'a clean run still reports success');
    assertTrue(bad.title !== ok.title, `partial failure must not reuse the success title (${bad.title})`);
  });

  test('scenario done() names the failed items without leaking the raw error', () => {
    const { ctx } = makeCtx();
    const state = createActionVerbs(ctx).get('scenario').modal.done({
      loaded: [],
      failed: [
        { exampleId: 'ex-a', moduleId: null, error: 'no module for example' },
        { exampleId: 'ex-b', moduleId: 'sipoc', error: 'module failed to mount' },
      ],
    }, ['scn-a']);
    const text = `${state.subtitle ?? ''} ${state.note ?? ''}`;
    assertTrue(text.includes('ex-a') && text.includes('ex-b'), `failed ids named, got: ${text}`);
    assertTrue(text.includes('actions.scenarioItemsFailed'), 'reuses the existing i18n key');
    assertTrue(!text.includes('no module for example') && !text.includes('module failed to mount'),
      `raw developer error leaked into the dialog: ${text}`);
  });

  test('scenario done() survives a missing result detail', () => {
    const { ctx } = makeCtx();
    const state = createActionVerbs(ctx).get('scenario').modal.done(null, ['scn-a']);
    assertTrue(state.subtitle.includes('"loaded":0'), `got ${state.subtitle}`);
  });

  test('no verb exposes describe() any more', () => {
    const verbs = createActionVerbs(makeCtx().ctx);
    for (const [id, verb] of verbs) {
      assertEqual(typeof verb.describe, 'undefined', `${id} still has describe()`);
    }
  });

  test('example verb loads a single example ad-hoc', async () => {
    const { ctx, calls } = makeCtx();
    const res = await createActionVerbs(ctx).get('example').run(['ex-a']);
    assertTrue(calls.some(c => c.startsWith('load:ad-hoc:ex-a')), 'ad-hoc scenario loaded');
    assertEqual(res.route.kind, 'phase');
  });

  test('example verb rejects a scenario id', async () => {
    const { ctx } = makeCtx();
    let error = null;
    try { await createActionVerbs(ctx).get('example').run(['scn-a']); }
    catch (err) { error = err; }
    assertTrue(!!error, 'throws for a scenario id');
  });
});

suite('core/router/action-verbs zeg-sheet', () => {
  /**
   * Kontext für das Verb: Projektstand aus Literalen, die Fassade liest den
   * gespeicherten Stand, geschrieben wird nur über `workspace.interactAsKernel`.
   */
  function zegCtx(phases, modules) {
    const { ctx } = makeCtx();
    const state = { phases, phaseAchievementHistory: {} };
    let writes = 0;
    Object.assign(ctx.stateManager, {
      get: (p) => structuredClone(p.split('.').reduce((o, k) => o?.[k], state)),
      set: (p, v) => { writes++; const ks = p.split('.'); const l = ks.pop(); let o = state; for (const k of ks) o = (o[k] ??= {}); o[l] = structuredClone(v); },
      getModuleState: (id) => structuredClone(modules.get(id) ?? null),
      setModuleState: () => { writes++; },
      listInstances: (m) => state.phases.data.filter(i => i.moduleId === m).map(i => ({ instanceId: i.instanceId, moduleId: m, title: '' })),
      getProjectCycle: () => 'dmaic',
      getActiveProjectId: () => 'p-new',
      isCompleted: () => false,
    });
    useStoredWorksheetReader(ctx.stateManager);
    ctx.eventBus = { emit: () => {}, on: () => {}, off: () => {} };
    ctx.workspace = fakeKernelSurface({ state, modules, isCompleted: () => false });
    ctx.instances = {
      list: () => state.phases.data.map(i => ({ instanceId: i.instanceId, moduleId: i.moduleId })),
      read: async () => ({}),
    };
    return { ctx, state, writes: () => writes };
  }

  test('zeg-sheet verb ensures the sheet over interact and routes to its module', async () => {
    const { ctx, state } = zegCtx({ data: [] }, new Map());
    const verb = createActionVerbs(ctx).get('zeg-sheet');
    assertEqual(verb.modal, null);
    assertDeepEqual(verb.list(), []);
    const { route } = await verb.run([]);
    assertEqual(route.kind, 'module');
    assertEqual(route.projectId, 'p-new');
    assertEqual(route.instanceId, state.phases.data[0].instanceId);
    assertEqual(ctx.workspace.stacks[0].stack[0].op, 'module.add');
    const again = await verb.run([]);
    assertEqual(again.route.instanceId, route.instanceId);
    assertEqual(state.phases.data.length, 1);
  });

  test('zeg-sheet verb reuses a consistent ZEG sheet without writing it', async () => {
    const sheet = buildSheetState(null, [], ['define', 'measure', 'analyze', 'improve', 'control'], { date: 'Datum', phases: {} });
    const modules = new Map([['ws-z', { sheets: [{ id: 'sheet_1', name: 'Zielerreichungsgrad', state: sheet }], activeSheetId: 'sheet_1', sheetCounter: 1 }]]);
    const { ctx, writes } = zegCtx({ data: [{ instanceId: 'ws-z', moduleId: 'worksheet', order: 0, state: {} }] }, modules);
    const { route } = await createActionVerbs(ctx).get('zeg-sheet').run([]);
    assertEqual(route.instanceId, 'ws-z');
    assertEqual(writes(), 0);
    assertEqual(ctx.workspace.stacks.length, 0);
  });
});

/**
 * Tests for core/router/action-verbs.js
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import { createActionVerbs } from '../../js/core/router/action-verbs.js';

// Mirrors a real catalog entry: scenarios are identified by `type: 'scenario'`
// (examples/index.json), the same predicate ExamplesRegistry.getScenarios() uses.
const SCENARIOS = [
  { id: 'scn-a', type: 'scenario', cycle: 'dmaic', startPhase: 'define', items: ['ex-a'],
    title: { de: 'A', en: 'A' }, description: { de: '', en: '' } },
];

function makeCtx() {
  const calls = [];
  return {
    calls,
    ctx: {
      i18n: { t: (k, p) => (p ? `${k}:${JSON.stringify(p)}` : k), getLanguage: () => 'de' },
      examplesRegistry: {
        getScenarios: () => SCENARIOS,
        get: (id) => SCENARIOS.find(s => s.id === id) || (id === 'ex-a' ? { id, modules: ['sipoc'] } : undefined),
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
    const target = await createActionVerbs(ctx).get('scenario').run(['scn-a']);
    assertTrue(calls.includes('create:A:dmaic'), 'project created with scenario title');
    const rehydrateAt = calls.findIndex(c => c.startsWith('rehydrate:'));
    assertTrue(rehydrateAt > -1 && rehydrateAt < calls.indexOf('load:scn-a'), 'rehydrate before load');
    assertEqual(target.kind, 'phase');
    assertEqual(target.phaseId, 'define');
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
    ctx.examplesRegistry.get = (id) => (id === 'faux'
      ? { id: 'faux', type: 'project', items: ['ex-a'] } : undefined);
    let error = null;
    try { await createActionVerbs(ctx).get('scenario').run(['faux']); }
    catch (err) { error = err; }
    assertTrue(!!error, 'throws for a non-scenario entry carrying items');
  });

  test('scenario verb falls back when startPhase is unknown', async () => {
    const { ctx } = makeCtx();
    ctx.examplesRegistry.get = (id) => (id === 'scn-typo'
      ? { ...SCENARIOS[0], id: 'scn-typo', startPhase: 'defien' } : undefined);
    const target = await createActionVerbs(ctx).get('scenario').run(['scn-typo']);
    assertEqual(target.phaseId, 'define', 'typo falls back to the first phase');
  });

  test('new-project verb creates an empty project in the given cycle', async () => {
    const { ctx, calls } = makeCtx();
    const target = await createActionVerbs(ctx).get('new-project').run(['dmaic']);
    assertTrue(calls.some(c => c.startsWith('create:')), 'project created');
    assertEqual(target.kind, 'phase');
  });

  test('list() enumerates every scenario', () => {
    const { ctx } = makeCtx();
    assertDeepEqual(createActionVerbs(ctx).get('scenario').list().map(e => e.arg), ['scn-a']);
  });

  test('describe() yields a title for the splash', () => {
    const { ctx } = makeCtx();
    const d = createActionVerbs(ctx).get('scenario').describe(['scn-a']);
    assertEqual(typeof d.title, 'string');
    assertEqual(d.subtitle, 'A');
  });

  test('example verb loads a single example ad-hoc', async () => {
    const { ctx, calls } = makeCtx();
    const target = await createActionVerbs(ctx).get('example').run(['ex-a']);
    assertTrue(calls.some(c => c.startsWith('load:ad-hoc:ex-a')), 'ad-hoc scenario loaded');
    assertEqual(target.kind, 'phase');
  });

  test('example verb rejects a scenario id', async () => {
    const { ctx } = makeCtx();
    let error = null;
    try { await createActionVerbs(ctx).get('example').run(['scn-a']); }
    catch (err) { error = err; }
    assertTrue(!!error, 'throws for a scenario id');
  });
});

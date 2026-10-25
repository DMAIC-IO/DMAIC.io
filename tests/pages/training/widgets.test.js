/**
 * Course widgets: the Node-safe name list and the Alpine implementations must not drift apart.
 */
import { suite, test, assertDeepEqual, assertEqual, assertTrue } from '../../test-utils.js';
import { WIDGETS } from '../../../js/pages/training/widgets/index.js';
import { WIDGET_COMPONENTS } from '../../../js/pages/training/widgets/registry.js';

suite('course widgets', () => {
  test('every widget name has exactly one Alpine component and vice versa', () => {
    assertDeepEqual(Object.keys(WIDGET_COMPONENTS).sort(), [...WIDGETS].sort());
    for (const name of WIDGETS) {
      const impl = WIDGET_COMPONENTS[name];
      assertTrue(typeof impl.factory === 'function', `${name}: factory`);
      assertTrue(/^training[A-Z]/.test(impl.component), `${name}: component name`);
    }
    const components = Object.values(WIDGET_COMPONENTS).map((w) => w.component);
    assertEqual(new Set(components).size, components.length, 'component names unique');
  });

  test('sampling-distribution widget draws, reports cumulative counts and forwards summaries', () => {
    const ctx = { i18n: { t: (k) => k } };
    const sim = WIDGET_COMPONENTS['sampling-distribution'].factory(ctx);
    const results = [];
    const events = [];
    const root = { dispatchEvent: (e) => events.push(e) };
    sim.setup(root, { population: 'skewed', n: 5, lockPopulation: true }, {
      addResult: (pop, n, summary) => results.push({ pop, n, summary }),
    });
    sim.draw(100);
    sim.draw(50);
    assertEqual(sim.count, 150);
    assertEqual(results.length, 2);
    assertEqual(results[0].pop, 'skewed');
    assertEqual(results[0].n, 5);
    assertEqual(results[0].summary.count, 100);
    assertTrue(Number.isFinite(results[0].summary.mean) && Number.isFinite(results[0].summary.sd));
    const last = events[events.length - 1];
    assertEqual(last.type, 'training-sim-progress');
    assertEqual(last.bubbles, true);
    assertDeepEqual(last.detail, { count: 150, perN: { skewed: { 5: 150 } } });
    assertEqual(sim.popHidden('normal'), true);
    assertEqual(sim.popHidden('skewed'), false);
  });

  test('sampling-distribution widget releases every chart it created', async () => {
    const live = new Set();
    const chartManager = {
      create: async () => { const c = {}; live.add(c); return c; },
      update: () => {},
      destroy: (c) => live.delete(c),
    };
    const containers = {};
    const root = {
      querySelector: (sel) => (containers[sel] || (containers[sel] = {})),
      dispatchEvent: () => {},
    };
    const sim = WIDGET_COMPONENTS['sampling-distribution'].factory({ i18n: { t: (k) => k }, chartManager });
    await sim.setup(root, { trackN: true, showTheory: true }, { addResult: () => {}, results: () => ({}) });
    assertEqual(live.size, 4);
    assertEqual(sim.theoryMeans, true);
    assertEqual(sim.theorySpread, true);
    sim.destroy();
    assertEqual(live.size, 0);
  });
});

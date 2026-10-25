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

  test('sampling-distribution widget seeds per mount unless a seed is injected', () => {
    const run = (params) => {
      const sim = WIDGET_COMPONENTS['sampling-distribution'].factory({ i18n: { t: (k) => k } });
      const got = [];
      sim.setup({ dispatchEvent: () => {} }, params, { addResult: (p, n, s) => got.push(s.mean) });
      sim.draw(1);
      return got[0];
    };
    assertEqual(run({ seed: 42 }), run({ seed: 42 }), 'same injected seed, same draws');
    assertTrue(run({ seed: 42 }) !== run({ seed: 43 }), 'different seeds differ');
    assertTrue(run({}) !== run({}), 'default seeds are random per mount');
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

suite('value-distribution widget', () => {
  const make = (ctx = {}) => WIDGET_COMPONENTS['value-distribution'].factory({ i18n: { t: (k) => k }, ...ctx });
  const mount = (params, ctx) => {
    const sim = make(ctx);
    const events = [];
    sim.setup({ dispatchEvent: (e) => events.push(e) }, params, {});
    return { sim, events };
  };

  test('value widget reports zero counts for every shown process on setup', () => {
    const { events } = mount({ processes: ['fill-a', 'fill-b'] });
    assertEqual(events[0].type, 'training-sim-progress');
    assertEqual(events[0].bubbles, true);
    assertDeepEqual(events[0].detail, { count: 0, perN: { 'fill-a': { 1: 0 }, 'fill-b': { 1: 0 } } });
  });

  test('value widget measures and reports per process', () => {
    const { sim, events } = mount({ processes: ['fill-a', 'fill-b'], seed: 1 });
    sim.measure('fill-a', 100);
    sim.measure('fill-b', 10);
    assertDeepEqual(events[events.length - 1].detail, { count: 10, perN: { 'fill-a': { 1: 100 }, 'fill-b': { 1: 10 } } });
  });

  test('selectable widget keeps values per process', () => {
    const { sim } = mount({ processes: ['fill-a', 'fill-b'], selectable: true, stats: ['count', 'sd'], seed: 3 });
    assertDeepEqual(sim.columns(), ['fill-a']);
    sim.measure('fill-a', 1000);
    sim.select('fill-b');
    assertDeepEqual(sim.columns(), ['fill-b']);
    sim.measure('fill-b', 1000);
    sim.select('fill-a');
    assertTrue(Math.abs(Number(sim.cell('fill-a', 'sd')) - 2) < 0.3, `sd A ${sim.cell('fill-a', 'sd')}`);
    sim.select('fill-b');
    assertTrue(Math.abs(Number(sim.cell('fill-b', 'sd')) - 5) < 0.5, `sd B ${sim.cell('fill-b', 'sd')}`);
    assertEqual(sim.countOf('fill-a'), 1000);
    assertEqual(sim.countOf('fill-b'), 1000);
  });

  test('value widget seeds per mount unless injected', () => {
    const run = (params) => {
      const { sim } = mount({ processes: ['fill-a'], stats: ['mean'], ...params });
      sim.measure('fill-a', 1);
      return sim.cell('fill-a', 'mean');
    };
    assertEqual(run({ seed: 42 }), run({ seed: 42 }), 'same injected seed, same values');
    assertTrue(run({ seed: 42 }) !== run({ seed: 43 }), 'different seeds differ');
    assertTrue(run({}) !== run({}), 'default seeds are random per mount');
  });

  test('value widget releases every chart it created', async () => {
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
    const sim = make({ chartManager });
    await sim.setup(root, { processes: ['fill-a', 'fill-b'], showMean: true, bands: [1] }, {});
    assertEqual(live.size, 2);
    sim.measure('fill-a', 10);
    sim.destroy();
    assertEqual(live.size, 0);
  });

  test('value widget stats follow params', () => {
    const { sim } = mount({ processes: ['waiting'], stats: ['count', 'min', 'max'], bands: [1] });
    assertDeepEqual(sim.rows().map((r) => r.key), ['count', 'min', 'max', 'within1']);
    const plain = mount({ processes: ['waiting'], stats: ['mean', 'belowMean'] }).sim;
    assertDeepEqual(plain.rows().map((r) => r.key), ['mean', 'belowMean']);
  });

  test('value widget labels the mean and band lines visibly', () => {
    const { sim } = mount({ processes: ['fill-a'], showMean: true, bands: [1], seed: 2 });
    sim.measure('fill-a', 100);
    const lines = sim.chartConfig('fill-a').refLines;
    assertDeepEqual(lines.map((l) => l.label), ['x̄', '−1 s', '+1 s']);
    assertTrue(lines.every((l) => l.showLabel === true), 'every reference line shows its label');
  });

  test('value widget shows shares as whole percent', () => {
    const { sim } = mount({ processes: ['fill-a'], stats: ['count'], bands: [1, 2], seed: 5 });
    assertEqual(sim.cell('fill-a', 'within1'), '–');
    sim.measure('fill-a', 1000);
    assertTrue(/^\d{1,3} %$/.test(sim.cell('fill-a', 'within1')), sim.cell('fill-a', 'within1'));
    assertEqual(sim.cell('fill-a', 'count'), '1000');
  });
});

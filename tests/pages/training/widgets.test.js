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

/** Fake chart manager that tracks live charts. */
const trackingChartManager = () => {
  const live = new Set();
  return {
    live,
    create: async () => { const c = {}; live.add(c); return c; },
    update: () => {},
    destroy: (c) => live.delete(c),
  };
};

/** Fake widget root with lazily created chart containers. */
const fakeRoot = () => {
  const containers = {};
  return { querySelector: (sel) => (containers[sel] || (containers[sel] = {})), dispatchEvent: () => {} };
};

suite('sample-estimate widget', () => {
  const make = (ctx = {}) => WIDGET_COMPONENTS['sample-estimate'].factory({ i18n: { t: (k) => k }, ...ctx });
  const mount = (params, ctx) => {
    const sim = make(ctx);
    const events = [];
    sim.setup({ dispatchEvent: (e) => events.push(e) }, params, {});
    return { sim, events };
  };

  test('estimate widget shows population values before the first sample', () => {
    const { sim, events } = mount({ n: 10, showTruth: true });
    assertEqual(sim.cell('mu'), '500.00');
    assertEqual(sim.cell('sigma'), '2.00');
    assertEqual(sim.cell('mean'), '–');
    assertEqual(sim.cell('sd'), '–');
    assertEqual(events[0].type, 'training-sim-progress');
    assertDeepEqual(events[0].detail, { count: 0, perN: {} });
  });

  test('estimate widget draws samples of n', () => {
    const { sim, events } = mount({ n: 10, seed: 1 });
    sim.draw(5);
    assertEqual(sim.samplesDrawn, 5);
    assertEqual(sim.currentSample().length, 10);
    assertTrue(sim.cell('mean') !== '–', 'x̄ shown');
    assertTrue(sim.cell('sd') !== '–', 's shown');
    assertDeepEqual(events[events.length - 1].detail, { count: 5, perN: {} });
  });

  test('history keeps the last five, newest first', () => {
    const { sim } = mount({ n: 10, history: 5, seed: 2 });
    for (let i = 0; i < 7; i++) sim.draw(1);
    const rows = sim.historyRows();
    assertEqual(rows.length, 5);
    assertEqual(rows[0].mean, sim.cell('mean'), 'newest first');
    assertEqual(mount({ n: 10, seed: 2 }).sim.historyRows().length, 0, 'no history by default');
  });

  test('estimate chart carries the true curve', () => {
    const { sim } = mount({ n: 10, showTruth: true, seed: 3 });
    sim.draw(1);
    const cfg = sim.chartConfig();
    assertEqual(cfg.normalCurves.length, 1);
    assertEqual(cfg.normalCurves[0].mean, 500);
    assertEqual(cfg.normalCurves[0].stdDev, 2);
    assertEqual(cfg.bins[0].x0, 480);
    assertEqual(cfg.bins[cfg.bins.length - 1].x1, 520);
    assertEqual(cfg.bins.reduce((sum, b) => sum + b.count, 0), 10, 'bins hold the current sample');
    assertTrue(cfg.refLines.some((l) => l.label === 'μ' && l.value === 500), 'μ line');
    const plain = mount({ n: 10, seed: 3 }).sim;
    plain.draw(1);
    assertEqual(plain.chartConfig().normalCurves.length, 0);
  });

  test('estimate widget seeds per mount unless injected', () => {
    const run = (params) => {
      const { sim } = mount({ n: 10, ...params });
      sim.draw(1);
      return sim.cell('mean');
    };
    assertEqual(run({ seed: 42 }), run({ seed: 42 }), 'same injected seed, same values');
    assertTrue(run({ seed: 42 }) !== run({ seed: 43 }), 'different seeds differ');
    assertTrue(run({}) !== run({}), 'default seeds are random per mount');
  });

  test('estimate widget releases every chart it created', async () => {
    const chartManager = trackingChartManager();
    const sim = make({ chartManager });
    await sim.setup(fakeRoot(), { n: 10, showTruth: true }, {});
    assertEqual(chartManager.live.size, 1);
    sim.draw(1);
    sim.destroy();
    assertEqual(chartManager.live.size, 0);
  });
});

suite('variance-check widget', () => {
  const make = (ctx = {}) => WIDGET_COMPONENTS['variance-check'].factory({ i18n: { t: (k) => k }, ...ctx });
  const mount = (params, ctx) => {
    const sim = make(ctx);
    const events = [];
    sim.setup({ dispatchEvent: (e) => events.push(e) }, params, {});
    return { sim, events };
  };

  test('a single draw has its own button label', () => {
    const { sim } = mount({ seed: 1 });
    assertEqual(sim.drawLabel(1), 'training.course.variance.drawOne');
    assertEqual(sim.drawLabel(10), 'training.course.variance.draw');
  });

  test('variance widget averages share their samples', () => {
    const { sim, events } = mount({ n: 3, seed: 1 });
    assertEqual(sim.cell('avgByN'), '–');
    assertEqual(sim.cell('avgByNMinus1'), '–');
    assertEqual(sim.cell('sigma2'), '4.00');
    assertEqual(sim.cell('count'), '0');
    assertDeepEqual(events[0].detail, { count: 0, perN: {} });
    sim.draw(100);
    const avg = sim.averages();
    assertTrue(Math.abs(avg.byN / avg.byNMinus1 - 2 / 3) < 1e-9, `ratio ${avg.byN / avg.byNMinus1}`);
    assertEqual(sim.cell('count'), '100');
    assertEqual(sim.latest().length, 3);
    assertDeepEqual(events[events.length - 1].detail, { count: 100, perN: {} });
  });

  test('variance widget seeds per mount unless injected', () => {
    const run = (params) => {
      const { sim } = mount({ n: 3, ...params });
      sim.draw(10);
      return sim.cell('avgByNMinus1');
    };
    assertEqual(run({ seed: 42 }), run({ seed: 42 }), 'same injected seed, same values');
    assertTrue(run({ seed: 42 }) !== run({ seed: 43 }), 'different seeds differ');
    assertTrue(run({}) !== run({}), 'default seeds are random per mount');
  });

  test('variance widget creates no chart', async () => {
    const chartManager = trackingChartManager();
    const sim = make({ chartManager });
    await sim.setup(fakeRoot(), { n: 3 }, {});
    sim.draw(10);
    sim.destroy();
    assertEqual(chartManager.live.size, 0);
  });
});

suite('interval-coverage widget', () => {
  const make = (ctx = {}) => WIDGET_COMPONENTS['interval-coverage'].factory({ i18n: { t: (k) => k }, ...ctx });
  const mount = (params, ctx) => {
    const sim = make(ctx);
    const events = [];
    sim.setup({ dispatchEvent: (e) => events.push(e) }, params, {});
    return { sim, events };
  };
  const rate = (sim, key = 'rate') => parseFloat(sim.cell(key));

  test('offers no chart export (segments are coloured by CSS only)', () => {
    const { sim } = mount({ seed: 1 });
    assertEqual(sim.chartConfig().showModebar, false);
  });

  test('shows dashes before the first sample', () => {
    const { sim, events } = mount({ seed: 1 });
    assertEqual(sim.cell('rate'), '–');
    assertEqual(sim.cell('half'), '–');
    assertEqual(sim.cell('hits'), '0');
    assertEqual(sim.cell('drawn'), '0');
    assertEqual(events[0].type, 'training-sim-progress');
    assertDeepEqual(events[0].detail, { count: 0, perN: { 0.95: { 10: 0 } } });
  });

  test('draws and counts hits', () => {
    const { sim } = mount({ seed: 1 });
    sim.draw(1000);
    assertEqual(sim.cell('drawn'), '1000');
    assertTrue(/^\d+\.\d %$/.test(sim.cell('rate')), `rate format ${sim.cell('rate')}`);
    assertTrue(Math.abs(rate(sim) - 95) <= 2, `rate ${sim.cell('rate')}`);
    assertEqual(sim.cell('half'), '1.24 g');
    const cfg = sim.chartConfig();
    assertEqual(cfg.rows.length, 50);
    assertDeepEqual(cfg.xDomain, [494, 506]);
    assertEqual(cfg.reference.value, 500);
  });

  test('settings keep their own counts', () => {
    const { sim, events } = mount({ seed: 2, nChoices: [5, 10, 40] });
    sim.draw(100);
    sim.setN(40);
    assertEqual(sim.cell('drawn'), '0', 'a new setting starts empty');
    sim.draw(10);
    sim.setN(10);
    assertEqual(sim.cell('drawn'), '100');
    assertDeepEqual(events[events.length - 1].detail, { count: 110, perN: { 0.95: { 10: 100, 40: 10 } } });
  });

  test('higher level, wider interval', () => {
    const { sim } = mount({ seed: 3, levelChoices: [0.9, 0.95, 0.99] });
    const half = (level) => { sim.setLevel(level); sim.draw(1); return sim.halfWidth(); };
    const [h90, h95, h99] = [half(0.9), half(0.95), half(0.99)];
    assertTrue(h90 < h95 && h95 < h99, `${h90} < ${h95} < ${h99}`);
  });

  test('compare mode feeds both rows from the same samples', () => {
    const { sim } = mount({ seed: 1, sigma: 'unknown', compare: true, nChoices: [5] });
    sim.draw(1000);
    assertEqual(sim.cell('drawn'), '1000');
    assertTrue(Math.abs(rate(sim, 'rate-z') - 87.8) <= 3, `rate-z ${sim.cell('rate-z')}`);
    assertTrue(Math.abs(rate(sim, 'rate-t') - 95) <= 2, `rate-t ${sim.cell('rate-t')}`);
    const rows = sim.chartConfig().rows;
    assertTrue(rows.every((r) => r.segments.length === 2), 'two segments per row');
    assertDeepEqual(rows[0].segments.map((s) => s.kind), ['z', 't']);
    assertTrue(Math.abs(sim.halfWidth('t') / sim.halfWidth('z') - 2.776 / 1.960) < 1e-3, 'same s, factor ratio');
    assertDeepEqual(sim.chartConfig().legend.map((l) => l.kind), ['z', 't', 'miss']);
  });

  test('a single choice is the only option', () => {
    const { sim } = mount({ seed: 1 });
    assertDeepEqual(sim.nOptions(), [10]);
    assertDeepEqual(sim.levelOptions(), [0.95]);
    assertEqual(sim.drawLabel(1), 'training.course.interval.drawOne');
    assertEqual(sim.drawLabel(10), 'training.course.interval.draw');
  });

  test('interval widget seeds per mount unless injected', () => {
    const run = (params) => {
      const { sim } = mount(params);
      sim.draw(1);
      return sim.chartConfig().rows[0].segments[0].lo;
    };
    assertEqual(run({ seed: 42 }), run({ seed: 42 }), 'same injected seed, same values');
    assertTrue(run({ seed: 42 }) !== run({ seed: 43 }), 'different seeds differ');
    assertTrue(run({}) !== run({}), 'default seeds are random per mount');
  });

  test('interval widget releases every chart it created', async () => {
    const chartManager = trackingChartManager();
    const sim = make({ chartManager });
    await sim.setup(fakeRoot(), { seed: 1 }, {});
    assertEqual(chartManager.live.size, 1);
    sim.draw(1);
    sim.destroy();
    assertEqual(chartManager.live.size, 0);
  });
});

suite('null-distribution widget', () => {
  const make = (ctx = {}) => WIDGET_COMPONENTS['null-distribution'].factory({ i18n: { t: (k) => k }, ...ctx });
  const mount = (params, ctx) => {
    const sim = make(ctx);
    const events = [];
    sim.setup({ dispatchEvent: (e) => events.push(e) }, params, {});
    return { sim, events };
  };
  const share = (sim) => parseFloat(sim.cell('share'));
  const lit = (sim) => sim.chartConfig().bins.filter((b) => b.highlight);
  const THREE = [500.8, 501.2, 501.6];

  test('shows dashes before the first sample', () => {
    const { sim, events } = mount({ seed: 1, showP: true });
    assertEqual(sim.cell('drawn'), '0');
    assertEqual(sim.cell('far'), '0');
    assertEqual(sim.cell('share'), '–');
    assertEqual(sim.cell('p'), '0.011');
    assertEqual(sim.cell('decision'), 'training.course.nullDist.reject');
    assertEqual(events[0].type, 'training-sim-progress');
    assertDeepEqual(events[0].detail, { count: 0, choices: 1 });
  });

  test('draws and counts the far-out means', () => {
    const { sim } = mount({ seed: 1 });
    sim.draw(1000);
    assertEqual(sim.cell('drawn'), '1000');
    assertTrue(/^\d+\.\d %$/.test(sim.cell('share')), `share format ${sim.cell('share')}`);
    assertTrue(Math.abs(share(sim) - 1.14) <= 1.0, `share ${sim.cell('share')}`);
    const cfg = sim.chartConfig();
    assertEqual(cfg.bins.length, 40);
    const inRange = sim._means().filter((m) => m >= 496 && m < 504).length;
    assertEqual(cfg.bins.reduce((s, b) => s + b.count, 0), inRange);
    assertEqual(cfg.xMin, 496);
    assertEqual(cfg.xMax, 504);
    assertDeepEqual(cfg.refLines.map((r) => r.value), [501.6, 498.4]);
  });

  test('hides the chart legend like the sibling widgets', () => {
    // The histogram's legend names are fixed English ("Histogram", "X=…").
    const { sim } = mount({ seed: 1 });
    assertEqual(sim.chartConfig().showLegend, false);
  });

  test('tail bins start exactly at the observed mean', () => {
    const { sim } = mount({ seed: 1, observedChoices: THREE });
    assertEqual(lit(sim).length, 24);
    assertTrue(lit(sim).every((b) => b.x0 >= 501.6 - 1e-9 || b.x1 <= 498.4 + 1e-9), 'tails of 501.6');
    sim.setObserved(500.8);
    assertEqual(lit(sim).length, 32);
    assertTrue(lit(sim).every((b) => b.x0 >= 500.8 - 1e-9 || b.x1 <= 499.2 + 1e-9), 'tails of 500.8');
  });

  test('switching the observed mean keeps the samples', () => {
    const { sim, events } = mount({ seed: 1, observedChoices: THREE, showP: true });
    sim.draw(1000);
    sim.setObserved(500.8);
    assertEqual(sim.cell('drawn'), '1000');
    assertTrue(Math.abs(share(sim) - 20.6) <= 4, `share ${sim.cell('share')}`);
    assertEqual(sim.cell('p'), '0.206');
    assertEqual(sim.cell('decision'), 'training.course.nullDist.keep');
    assertDeepEqual(events[events.length - 1].detail, { count: 1000, choices: 2 });
    sim.setObserved(501.6);
    assertDeepEqual(events[events.length - 1].detail, { count: 1000, choices: 2 });
  });

  test('an observed mean outside the choices is ignored', () => {
    const { sim } = mount({ seed: 1 });
    sim.setObserved(500.8);
    assertEqual(sim.observed, 501.6);
    assertDeepEqual(sim.observedOptions(), [501.6]);
  });

  test('means exactly on the observed edges land in highlighted bins', () => {
    const { sim } = mount({ seed: 1 });
    sim._pushMeans([501.6, 498.4]);
    assertEqual(sim.cell('far'), '2');
    assertEqual(lit(sim).reduce((s, b) => s + b.count, 0), 2, 'both edge means are highlighted');
    assertEqual(sim.chartConfig().bins.reduce((s, b) => s + b.count, 0), 2);
  });

  test('values beyond the axis still count', () => {
    const { sim } = mount({ seed: 1 });
    sim._pushMeans([505, 495]);
    assertEqual(sim.cell('drawn'), '2');
    assertEqual(sim.cell('far'), '2');
    assertEqual(sim.chartConfig().bins.reduce((s, b) => s + b.count, 0), 0);
  });

  test('the share is labelled as an estimate of p only with showP', () => {
    assertEqual(mount({ seed: 1 }).sim.showP, false);
    assertEqual(mount({ seed: 1 }).sim.shareLabel(), 'training.course.nullDist.share');
    assertEqual(mount({ seed: 1, showP: true }).sim.shareLabel(), 'training.course.nullDist.shareApprox');
  });

  test('null widget seeds per mount unless injected', () => {
    const run = (params) => {
      const { sim } = mount(params);
      sim.draw(1);
      return sim._means()[0];
    };
    assertEqual(run({ seed: 42 }), run({ seed: 42 }), 'same injected seed, same values');
    assertTrue(run({ seed: 42 }) !== run({ seed: 43 }), 'different seeds differ');
    assertTrue(run({}) !== run({}), 'default seeds are random per mount');
  });

  test('null widget releases every chart it created', async () => {
    const chartManager = trackingChartManager();
    const sim = make({ chartManager });
    await sim.setup(fakeRoot(), { seed: 1 }, {});
    assertEqual(chartManager.live.size, 1);
    sim.draw(1);
    sim.destroy();
    assertEqual(chartManager.live.size, 0);
  });
});

suite('test-errors widget', () => {
  const make = (ctx = {}) => WIDGET_COMPONENTS['test-errors'].factory({ i18n: { t: (k) => k }, ...ctx });
  const mount = (params, api = { insightOpen: () => false }, ctx) => {
    const sim = make(ctx);
    const events = [];
    sim.setup({ dispatchEvent: (e) => events.push(e), setAttribute: () => {} }, params, api);
    return { sim, events };
  };
  const share = (sim) => parseFloat(sim.cell('share'));
  const curves = (sim) => sim.chartConfig().normalCurves || [];
  const shadeKeys = (sim) => [...new Set(curves(sim).flatMap((c) => (c.shade || []).map((r) => r.key)))].sort();
  const PREFIX = 'training.course.testErrors.';

  test('shows limits and dashes before the first check', () => {
    const { sim, events } = mount({ seed: 1 });
    assertEqual(sim.cell('limits'), '498.76 – 501.24 g');
    assertEqual(sim.cell('checks'), '0');
    assertEqual(sim.cell('alarms'), '0');
    assertEqual(sim.cell('share'), '–');
    assertEqual(sim.showExact, false);
    assertEqual(events[0].type, 'training-sim-progress');
    assertDeepEqual(events[0].detail, { count: 0, values: { drift: { 0: 0 }, n: { 10: 0 }, alpha: { 0.05: 0 } } });
  });

  test('seeded shares match theory', () => {
    const run = (params, expected, tol) => {
      const { sim } = mount({ seed: 1, ...params });
      for (let i = 0; i < 10; i++) sim.draw(1000);
      assertEqual(sim.cell('checks'), '10000');
      assertTrue(/^\d+\.\d %$/.test(sim.cell('share')), `share format ${sim.cell('share')}`);
      assertTrue(Math.abs(share(sim) - expected) <= tol, `share ${sim.cell('share')} vs ${expected}`);
    };
    run({ driftChoices: [1] }, 35.3, 1.5);
    run({ driftChoices: [1], nChoices: [43] }, 90.6, 1);
  });

  test('alarm limits are bin edges for every offered setting', () => {
    const { sim } = mount({ seed: 1, nChoices: [10, 20, 40, 43], alphaChoices: [0.01, 0.05, 0.1] });
    sim._pushMeans([500]);
    for (const n of [10, 20, 40, 43]) {
      for (const alpha of [0.01, 0.05, 0.1]) {
        sim.setN(n);
        sim.setAlpha(alpha);
        const { lower: L, upper: U } = sim.limits();
        const bins = sim.chartConfig().bins;
        const edges = bins.flatMap((b) => [b.x0, b.x1]);
        const tag = `n ${n}, α ${alpha}`;
        assertTrue(edges.some((e) => Math.abs(e - L) < 1e-9), `${tag}: L is an edge`);
        assertTrue(edges.some((e) => Math.abs(e - U) < 1e-9), `${tag}: U is an edge`);
        for (const b of bins) {
          const outside = b.x0 >= U - 1e-9 || b.x1 <= L + 1e-9;
          assertEqual(b.highlight === true, outside, `${tag}: bin ${b.x0}–${b.x1}`);
        }
      }
    }
  });

  test('switching back continues the setting', () => {
    const { sim, events } = mount({ seed: 1, driftChoices: [0.5, 1] });
    sim.draw(100);
    sim.setDrift(1);
    assertEqual(sim.cell('checks'), '0');
    assertEqual(sim.cell('share'), '–');
    sim.setDrift(0.5);
    assertEqual(sim.cell('checks'), '100');
    assertDeepEqual(events[events.length - 1].detail.values.drift, { 0.5: 100, 1: 0 });
    assertEqual(events[events.length - 1].detail.count, 100);
  });

  test('exact value is labelled by meaning and shown before checks', () => {
    const zero = mount({ seed: 1, showExact: true, driftChoices: [0] }).sim;
    assertEqual(zero.exactLabel(), `${PREFIX}exactAlpha`);
    assertEqual(zero.cell('exact'), '5.0 %');
    const one = mount({ seed: 1, showExact: true, driftChoices: [1] }).sim;
    assertEqual(one.exactLabel(), `${PREFIX}exactPower`);
    assertEqual(one.cell('exact'), '35.3 %');
    const strict = mount({ seed: 1, showExact: true, driftChoices: [1], alphaChoices: [0.01] }).sim;
    assertEqual(strict.cell('exact'), '16.0 %');
  });

  test('afterInsight theory follows the lesson api', () => {
    let open = false;
    const api = { insightOpen: () => open };
    const { sim } = mount({ seed: 1, showTheory: 'afterInsight', driftChoices: [1] }, api);
    assertEqual(sim.theory, false);
    assertEqual(curves(sim).length, 0);
    assertDeepEqual(sim.legends(), []);
    open = true;
    sim.draw(1);
    assertEqual(sim.theory, true);
    assertEqual(curves(sim).length, 2);
    assertDeepEqual(shadeKeys(sim), ['alpha', 'beta']);
    assertDeepEqual(sim.legends(), ['alpha', 'beta']);
    const again = mount({ seed: 1, showTheory: 'afterInsight', driftChoices: [1] }, api).sim;
    assertEqual(again.theory, true);
  });

  test('theory true at zero drift shows only the alpha area', () => {
    const { sim } = mount({ seed: 1, showTheory: true, driftChoices: [0] });
    assertEqual(curves(sim).length, 1);
    assertDeepEqual(shadeKeys(sim), ['alpha']);
    assertDeepEqual(sim.legends(), ['alpha']);
  });

  test('the chart hides its series legend, the widget legend explains the areas', () => {
    const { sim } = mount({ seed: 1, showTheory: true, driftChoices: [1] });
    assertEqual(sim.chartConfig().showLegend, false);
  });

  test('a setting outside the choices is ignored and single choices lock', () => {
    const { sim } = mount({ seed: 1 });
    sim.setDrift(1);
    sim.setN(43);
    sim.setAlpha(0.01);
    assertEqual(sim.drift, 0);
    assertEqual(sim.n, 10);
    assertEqual(sim.alpha, 0.05);
    assertDeepEqual(sim.options('drift'), [0]);
    assertEqual(sim.optionText('drift', 0.5), '+0.5 g');
    assertEqual(sim.optionText('alpha', 0.05), '5 %');
    assertEqual(sim.optionText('n', 10), '10');
  });

  test('errors widget seeds per mount unless injected', () => {
    const run = (params) => {
      const { sim } = mount(params);
      sim.draw(1);
      return sim._means()[0];
    };
    assertEqual(run({ seed: 42 }), run({ seed: 42 }), 'same injected seed, same values');
    assertTrue(run({ seed: 42 }) !== run({ seed: 43 }), 'different seeds differ');
    assertTrue(run({}) !== run({}), 'default seeds are random per mount');
  });

  test('errors widget releases every chart it created', async () => {
    const chartManager = trackingChartManager();
    const sim = make({ chartManager });
    await sim.setup(fakeRoot(), { seed: 1 }, { insightOpen: () => false });
    assertEqual(chartManager.live.size, 1);
    sim.draw(1);
    sim.destroy();
    assertEqual(chartManager.live.size, 0);
  });
});

suite('course widgets: number format', () => {
  const ctxIn = (lang) => ({ i18n: { t: (k) => k, getLanguage: () => lang } });
  const mount = (name, lang, params) => {
    const sim = WIDGET_COMPONENTS[name].factory(ctxIn(lang));
    sim.setup({ dispatchEvent: () => {} }, params, { addResult: () => {} });
    return sim;
  };

  test('German shows a decimal comma in every widget', () => {
    assertEqual(mount('sample-estimate', 'de', { seed: 1 }).cell('mu'), '500,00');
    assertEqual(mount('variance-check', 'de', { seed: 1 }).cell('sigma2'), '4,00');
    assertEqual(mount('sampling-distribution', 'de', { seed: 1, population: 'skewed' }).sigmaText().includes(','), true);
    const values = mount('value-distribution', 'de', { seed: 1, processes: ['fill-a'], stats: ['sd'] });
    values.measure('fill-a', 100);
    assertTrue(/^\d+,\d\d$/.test(values.cell('fill-a', 'sd')), `sd ${values.cell('fill-a', 'sd')}`);
    const interval = mount('interval-coverage', 'de', { seed: 1 });
    interval.draw(10);
    assertTrue(/^\d+,\d %$/.test(interval.cell('rate')), `rate ${interval.cell('rate')}`);
    assertEqual(interval.cell('half'), '1,24 g');
    const nullDist = mount('null-distribution', 'de', { seed: 1, showP: true });
    nullDist.draw(10);
    assertEqual(nullDist.cell('p'), '0,011');
    assertTrue(/^\d+,\d %$/.test(nullDist.cell('share')), `share ${nullDist.cell('share')}`);
    assertEqual(nullDist.observedText(501.6), '501,6 g');
  });

  test('English keeps the decimal point', () => {
    assertEqual(mount('sample-estimate', 'en', { seed: 1 }).cell('mu'), '500.00');
    assertEqual(mount('null-distribution', 'en', { seed: 1 }).observedText(501.6), '501.6 g');
    assertEqual(mount('interval-coverage', 'en', { seed: 1, levelChoices: [0.9, 0.95, 0.99] }).levelText(0.95), '95 %');
  });
});

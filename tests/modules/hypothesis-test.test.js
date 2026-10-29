import { suite, test, assertEqual, assertTrue, assertThrows } from '../test-utils.js';
import { State } from '../../js/modules/hypothesis-test/hypothesis-test-model.js';
import { viewData } from '../../js/modules/hypothesis-test/hypothesis-test.js';
import { I18n } from '../../js/core/i18n.js';

suite('Hypothesis Test Model — State defaults', () => {
  test('constructor sets default values', () => {
    const s = new State();
    assertEqual(s.category, 'variance');
    assertEqual(s.testType, 'one');
    assertEqual(s.direction, 'two-sided');
    assertEqual(s.targetValue, '');
    assertEqual(s.targetType, 'variance');
    assertEqual(s.colRef1, null);
    assertEqual(s.colRef2, null);
    assertEqual(Array.isArray(s.colRefsK), true);
    assertEqual(s.colRefsK.length, 0);
    assertEqual(s.exampleWorksheetId, null);
    // alpha / powerGoal default to null until seeded from global settings
    assertEqual(s.alpha, null);
    assertEqual(s.powerGoal, null);
    // C1-006: Welch is the default; the pooled t-test is an explicit opt-in
    assertEqual(s.equalVariances, false);
  });
});

suite('Hypothesis Test Model — toJSON / fromJSON', () => {
  test('toJSON returns the legacy getState shape', () => {
    const s = new State();
    s.category = 'mean';
    s.testType = 'two';
    s.direction = 'greater';
    s.alpha = 0.05;
    s.powerGoal = 0.8;
    s.targetValue = '5';
    s.targetType = 'stddev';
    s.colRef1 = { instanceId: 'w1', sheetId: 's1', columnId: 'c1' };
    s.colRef2 = { instanceId: 'w1', sheetId: 's1', columnId: 'c2' };
    s.colRefsK = [];
    s.exampleWorksheetId = 'w1';
    const j = s.toJSON();
    assertEqual(j.category, 'mean');
    assertEqual(j.testType, 'two');
    assertEqual(j.direction, 'greater');
    assertEqual(j.alpha, 0.05);
    assertEqual(j.powerGoal, 0.8);
    assertEqual(j.targetValue, '5');
    assertEqual(j.targetType, 'stddev');
    assertEqual(j.colRef1.columnId, 'c1');
    assertEqual(j.colRef2.columnId, 'c2');
    assertEqual(Array.isArray(j.colRefsK), true);
    assertEqual(j.exampleWorksheetId, 'w1');
    // exact key set (legacy getState parity)
    assertEqual(
      Object.keys(j).sort().join(','),
      ['alpha', 'category', 'colRef1', 'colRef2', 'colRefsK', 'direction', 'equalVariances', 'exampleWorksheetId', 'powerGoal', 'targetType', 'targetValue', 'testType'].sort().join(',')
    );
  });

  test('fromJSON(null) yields a valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.category, 'variance');
    assertEqual(s.testType, 'one');
    assertEqual(s.colRefsK.length, 0);
    assertEqual(s.exampleWorksheetId, null);
  });

  test('fromJSON(undefined) yields a valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.category, 'variance');
    assertEqual(s.direction, 'two-sided');
  });

  test('fromJSON({}) yields a valid default', () => {
    const s = State.fromJSON({});
    assertEqual(s.category, 'variance');
    assertEqual(s.testType, 'one');
    assertEqual(s.targetType, 'variance');
  });

  test('fromJSON restores all fields', () => {
    const data = {
      category: 'mean', testType: 'k', direction: 'less',
      alpha: 0.01, powerGoal: 0.9, targetValue: '12', targetType: 'stddev',
      colRef1: { instanceId: 'a', sheetId: 'b', columnId: 'c' },
      colRef2: null,
      colRefsK: [{ instanceId: 'a', sheetId: 'b', columnId: 'd' }],
      exampleWorksheetId: 'a',
      equalVariances: true,
    };
    const s = State.fromJSON(data);
    assertEqual(s.category, 'mean');
    assertEqual(s.testType, 'k');
    assertEqual(s.direction, 'less');
    assertEqual(s.alpha, 0.01);
    assertEqual(s.powerGoal, 0.9);
    assertEqual(s.targetValue, '12');
    assertEqual(s.targetType, 'stddev');
    assertEqual(s.colRef1.columnId, 'c');
    assertEqual(s.colRef2, null);
    assertEqual(s.colRefsK.length, 1);
    assertEqual(s.colRefsK[0].columnId, 'd');
    assertEqual(s.exampleWorksheetId, 'a');
    assertEqual(s.equalVariances, true);
  });

  test('toJSON → fromJSON round-trip is lossless', () => {
    const a = new State();
    a.category = 'mean';
    a.testType = 'two';
    a.direction = 'greater';
    a.alpha = 0.02;
    a.powerGoal = 0.85;
    a.targetValue = '7';
    a.targetType = 'variance';
    a.colRef1 = { instanceId: 'w', sheetId: 's', columnId: 'c1' };
    a.colRef2 = { instanceId: 'w', sheetId: 's', columnId: 'c2' };
    a.colRefsK = [{ instanceId: 'w', sheetId: 's', columnId: 'c3' }];
    a.exampleWorksheetId = 'w';
    a.equalVariances = true;
    const b = State.fromJSON(a.toJSON());
    assertEqual(JSON.stringify(b.toJSON()), JSON.stringify(a.toJSON()));
  });

  test('fromJSON sanitizes a non-array colRefsK to []', () => {
    const s = State.fromJSON({ colRefsK: 'oops' });
    assertEqual(Array.isArray(s.colRefsK), true);
    assertEqual(s.colRefsK.length, 0);
  });

  test('fromJSON ignores a non-boolean equalVariances (stays false)', () => {
    const s = State.fromJSON({ equalVariances: 'yes' });
    assertEqual(s.equalVariances, false);
  });

  test('fromJSON keeps colRef1/colRef2 null when absent', () => {
    const s = State.fromJSON({ category: 'mean' });
    assertEqual(s.colRef1, null);
    assertEqual(s.colRef2, null);
  });
});

suite('Hypothesis Test Model — hasContent', () => {
  test('false by default', () => {
    assertEqual(new State().hasContent(), false);
  });
  test('true when colRef1 set', () => {
    const s = new State();
    s.colRef1 = { instanceId: 'a', columnId: 'c' };
    assertEqual(s.hasContent(), true);
  });
  test('true when colRef2 set', () => {
    const s = new State();
    s.colRef2 = { instanceId: 'a', columnId: 'c' };
    assertEqual(s.hasContent(), true);
  });
  test('true when colRefsK non-empty', () => {
    const s = new State();
    s.colRefsK = [{ instanceId: 'a', columnId: 'c' }];
    assertEqual(s.hasContent(), true);
  });
  test('false when colRefsK empty array', () => {
    const s = new State();
    s.colRefsK = [];
    assertEqual(s.hasContent(), false);
  });
});

suite('Hypothesis Test Model — resolveTarget', () => {
  test('variance target type returns value unchanged when valid', () => {
    const s = new State();
    s.category = 'variance';
    s.targetType = 'variance';
    s.targetValue = '0.05';
    assertEqual(s.resolveTarget(), 0.05);
  });

  test('stddev target type squares the value for variance', () => {
    const s = new State();
    s.category = 'variance';
    s.targetType = 'stddev';
    s.targetValue = '0.2';
    // 0.2^2 = 0.04
    assertEqual(Math.abs(s.resolveTarget() - 0.04) < 1e-12, true);
  });

  test('variance target <= 0 is invalid (null)', () => {
    const s = new State();
    s.category = 'variance';
    s.targetValue = '0';
    assertEqual(s.resolveTarget(), null);
  });

  test('variance target NaN is invalid (null)', () => {
    const s = new State();
    s.category = 'variance';
    s.targetValue = '';
    assertEqual(s.resolveTarget(), null);
  });

  test('mean target accepts any finite number incl. negative', () => {
    const s = new State();
    s.category = 'mean';
    s.targetValue = '-3.5';
    assertEqual(s.resolveTarget(), -3.5);
  });

  test('mean target zero is valid', () => {
    const s = new State();
    s.category = 'mean';
    s.targetValue = '0';
    assertEqual(s.resolveTarget(), 0);
  });

  test('mean target NaN is invalid (null)', () => {
    const s = new State();
    s.category = 'mean';
    s.targetValue = 'abc';
    assertEqual(s.resolveTarget(), null);
  });
});

suite('Hypothesis Test Model — fromJSON alpha/powerGoal', () => {
  test('leerer String bleibt null (wird später aus den Einstellungen geseedet)', () => {
    const s = State.fromJSON({ alpha: '', powerGoal: '' });
    assertEqual(s.alpha, null);
    assertEqual(s.powerGoal, null);
  });
  test('Zahl im Bereich wird übernommen', () => {
    const s = State.fromJSON({ alpha: 0.01, powerGoal: 0.9 });
    assertEqual(s.alpha, 0.01);
    assertEqual(s.powerGoal, 0.9);
  });
  test('alter Zahlentext im Bereich wird als Zahl übernommen', () => {
    const s = State.fromJSON({ alpha: '0.05', powerGoal: '0.8' });
    assertEqual(s.alpha, 0.05);
    assertEqual(s.powerGoal, 0.8);
  });
  test('Werte außerhalb des Bereichs bleiben null', () => {
    const s = State.fromJSON({ alpha: 1.5, powerGoal: 0.2 });
    assertEqual(s.alpha, null);
    assertEqual(s.powerGoal, null);
  });
  test('setPowerGoal-Klemmung gibt es nicht mehr', () => {
    assertEqual(typeof new State().setPowerGoal, 'undefined');
  });
});

suite('Hypothesis Test Model — paired test type', () => {
  test('fromJSON accepts testType paired and round-trips', () => {
    const s = State.fromJSON({ category: 'mean', testType: 'paired', targetValue: '0.5' });
    assertEqual(s.testType, 'paired');
    assertEqual(State.fromJSON(s.toJSON()).testType, 'paired');
  });

  test('resolveTarget defaults to 0 for paired with empty input', () => {
    const s = State.fromJSON({ category: 'mean', testType: 'paired', targetValue: '' });
    assertEqual(s.resolveTarget(), 0);
  });

  test('resolveTarget returns the hypothesized difference for paired', () => {
    const s = State.fromJSON({ category: 'mean', testType: 'paired', targetValue: '-1.5' });
    assertEqual(s.resolveTarget(), -1.5);
  });

  test('resolveTarget returns null for paired with invalid input', () => {
    const s = State.fromJSON({ category: 'mean', testType: 'paired', targetValue: 'abc' });
    assertEqual(s.resolveTarget(), null);
  });

  test('applyCategory variance falls back from paired to two', () => {
    const s = State.fromJSON({ category: 'mean', testType: 'paired' });
    s.applyCategory('variance');
    assertEqual(s.category, 'variance');
    assertEqual(s.testType, 'two');
  });

  test('applyCategory keeps other test types', () => {
    const s = State.fromJSON({ category: 'mean', testType: 'k' });
    s.applyCategory('variance');
    assertEqual(s.testType, 'k');
    s.applyCategory('mean');
    assertEqual(s.category, 'mean');
  });

  test('applyTestType into paired clears a one-sample target', () => {
    const s = State.fromJSON({ category: 'mean', testType: 'one', targetValue: '100' });
    s.applyTestType('paired');
    assertEqual(s.testType, 'paired');
    assertEqual(s.targetValue, '');
    assertEqual(s.resolveTarget(), 0);
  });

  test('applyTestType out of paired clears the hypothesized difference', () => {
    const s = State.fromJSON({ category: 'mean', testType: 'paired', targetValue: '2' });
    s.applyTestType('one');
    assertEqual(s.testType, 'one');
    assertEqual(s.targetValue, '');
  });

  test('applyTestType between non-paired types keeps the target', () => {
    const s = State.fromJSON({ category: 'mean', testType: 'one', targetValue: '100' });
    s.applyTestType('two');
    s.applyTestType('one');
    assertEqual(s.targetValue, '100');
  });

  test('applyTestType ignores unknown types', () => {
    const s = State.fromJSON({ category: 'mean', testType: 'one', targetValue: '100' });
    s.applyTestType('bogus');
    assertEqual(s.testType, 'one');
    assertEqual(s.targetValue, '100');
  });

  test('fromJSON drops paired for category variance', () => {
    const s = State.fromJSON({ category: 'variance', testType: 'paired' });
    assertEqual(s.testType, 'two');
  });
});

// ── k-group view (C1-019, C1-020) ────────────────────────────────────
// The view's data object is driven without a DOM: the column picker and the
// worksheet lookups are replaced by plain arrays.

let tPromise = null;
/** English module translator backed by the real en.json. */
function loadT() {
  if (!tPromise) {
    tPromise = fetch(new URL('../../i18n/en.json', import.meta.url))
      .then(r => r.json())
      .then(json => {
        const i18n = new I18n('en');
        i18n._cache.set('en', json);
        return i18n.tf('modules.hypothesis-test');
      });
  }
  return tPromise;
}

/**
 * Run the k-group analysis on plain arrays.
 * @param {number[][]} groups
 * @param {{equalVariances?: boolean, alpha?: number}} [opts]
 */
async function runK(groups, { equalVariances = false, alpha = 0.05, prepare = null } = {}) {
  const t = await loadT();
  const view = viewData({ _context: {} }, t);
  const model = new State();
  model.category = 'mean';
  model.testType = 'k';
  model.alpha = alpha;
  model.equalVariances = equalVariances;
  Object.assign(view, { model, t, $nextTick: fn => fn() });
  view._pickerK = { value: groups.map((_, i) => i) };
  view._valuesForRef = ref => groups[ref];
  view._refName = ref => `G${ref + 1}`;
  prepare?.(view);
  view.runAnalysis();
  return { view, t };
}

const SHAPE = [-1.5, -0.9, -0.4, -0.1, 0.1, 0.4, 0.9, 1.5];
/** Three normal groups (AD p ≈ 0.99) with clearly different variances. */
const NORMAL_GROUPS = [SHAPE.map(x => 10 + x), SHAPE.map(x => 12 + 2 * x), SHAPE.map(x => 15 + 0.5 * x)];
/** Three right-skewed groups of n = 8 (AD rejects) → rank route. */
const SKEWED_GROUPS = [
  [1, 1.1, 1.2, 1.3, 1.4, 1.5, 9, 10],
  [2, 2.1, 2.2, 2.3, 2.4, 2.5, 11, 12],
  [3, 3.1, 3.2, 3.3, 3.4, 3.5, 13, 14],
];

async function bookGroups() {
  const res = await fetch(new URL('../fixtures/hypothesis/one-way-anova.fixtures.json', import.meta.url));
  const json = await res.json();
  return json.test_cases.find(c => c.id === 'book_abb_4_7').inputs.groups;
}

const summaryValue = (main, label) => main.modelSummary.find(m => m.label === label)?.value;

suite('Hypothesis Test View — k-group mean routes (C1-019, C1-020)', () => {
  test('default (equal variances not assumed): Welch ANOVA with Games-Howell', async () => {
    const { view } = await runK(NORMAL_GROUPS);
    const r = view.result;
    assertEqual(r.route.name, 'Welch ANOVA');
    assertEqual(r.route.algoId, 'welch-anova');
    assertEqual(r.main.anovaRows, null, 'Welch has no SS table');
    assertEqual(r.pairwise.methodName, 'Games-Howell');
    assertEqual(r.pairwise.methodAlgoId, 'games-howell');
  });

  test('Welch card shows df as df1 / df2 with df2 to 2 decimals', async () => {
    const { view } = await runK(NORMAL_GROUPS);
    const df = view.result.main.metrics.find(m => m.label === 'df').value;
    assertEqual(df, '2 / 11.53');
  });

  test('equal variances assumed: Fisher ANOVA with SS table and Tukey HSD', async () => {
    const { view } = await runK(NORMAL_GROUPS, { equalVariances: true });
    const r = view.result;
    assertEqual(r.route.name, 'One-Way ANOVA');
    assertEqual(r.main.anovaRows.length, 3);
    assertEqual(r.pairwise.methodName, 'Tukey HSD');
    assertEqual(r.pairwise.methodAlgoId, 'tukey-hsd');
  });

  test('parametric pairwise hint names simultaneous CIs and the family confidence', async () => {
    const { view, t } = await runK(NORMAL_GROUPS);
    const hint = view.result.pairwise.hint;
    assertTrue(hint.includes(t('pairwiseSimultaneousHint', { level: 95 })), hint);
    assertTrue(!hint.includes('Bonferroni'), hint);
  });

  test('parametric pairwise cells come from Games-Howell pAdj and the simultaneous CI', async () => {
    const { view } = await runK(NORMAL_GROUPS);
    const row = view.result.pairwise.rows[0];
    // G1 vs G2: p_adj ≈ 0.0585; G1 vs G3: μ1 − μ3 = −5, p_adj ≈ 2.5e-7
    assertEqual(row.cells[1].text, '0.0585');
    assertEqual(row.cells[2].text, '0.0000');
    assertTrue(row.cells[2].ci.startsWith('[-'), row.cells[2].ci);
  });

  test('model summary for the book case (Abb. 4.7): S, R², R²adj, R²pred clamped at 0 %', async () => {
    // α = 0.01: at 0.05 Anderson-Darling rejects group 1 (p ≈ 0.0145) and the
    // rank route would apply. α does not enter S or the R² values.
    const { view, t } = await runK(await bookGroups(), { equalVariances: true, alpha: 0.01 });
    const main = view.result.main;
    assertEqual(view.result.route.name, 'One-Way ANOVA');
    assertEqual(summaryValue(main, 'S'), '2.0345');
    assertEqual(summaryValue(main, 'R²'), '1.21 %');
    assertEqual(summaryValue(main, t('labelR2adj')), '0.00 %');
    assertEqual(summaryValue(main, t('labelR2pred')), '0.00 %');
  });

  test('Welch route shows the same model summary (pooled S)', async () => {
    const { view } = await runK(await bookGroups(), { alpha: 0.01 });
    assertEqual(view.result.route.name, 'Welch ANOVA');
    assertEqual(summaryValue(view.result.main, 'S'), '2.0345');
  });

  test('group table carries the route CI and a header from α', async () => {
    const { view, t } = await runK(NORMAL_GROUPS, { alpha: 0.1 });
    const main = view.result.main;
    assertEqual(main.ciHeader, t('groupCi', { level: 90 }));
    assertTrue(/^\[\d+\.\d{4}, \d+\.\d{4}\]$/.test(main.groupRows[0].ci), main.groupRows[0].ci);
  });

  test('residual plot data on Welch and Fisher, null on the rank route', async () => {
    const w = (await runK(NORMAL_GROUPS)).view.result;
    assertEqual(w.residualPlot.residuals.length, 24);
    assertEqual(w.residualPlot.fitted.length, 24);
    const f = (await runK(NORMAL_GROUPS, { equalVariances: true })).view.result;
    assertTrue(f.residualPlot !== null);
    const k = (await runK(SKEWED_GROUPS)).view.result;
    assertEqual(k.residualPlot, null);
  });

  test('Welch with a zero-variance group is not computable', async () => {
    const groups = [NORMAL_GROUPS[0], NORMAL_GROUPS[1], [5, 5, 5, 5, 5]];
    const { view, t } = await runK(groups);
    assertEqual(view.result, null);
    assertEqual(view.errorText, t('testNotComputable'));
  });

  test('non-normal small groups: Kruskal-Wallis with Bonferroni Mann-Whitney', async () => {
    const { view, t } = await runK(SKEWED_GROUPS, { equalVariances: true });
    const r = view.result;
    assertEqual(r.route.name, 'Kruskal-Wallis Test');
    assertEqual(r.pairwise.methodName, 'Mann-Whitney U Test');
    assertTrue(r.pairwise.hint.includes(t('pairwiseHint', { m: 3 })), r.pairwise.hint);
    assertEqual(r.main.modelSummary, null);
  });

  test('trail reports the equal-variances assumption, Levene stays as information', async () => {
    for (const eq of [false, true]) {
      const { view } = await runK(NORMAL_GROUPS, { equalVariances: eq });
      const ve = view.result.varEquality;
      assertEqual(ve.trailLabelKey, 'varEqualLabel');
      assertEqual(ve.trailYes, eq);
      assertTrue(Array.isArray(ve.metrics) && ve.metrics.length > 0, 'Levene metrics kept');
    }
  });

  test('a failing post-hoc hides the pairwise section and keeps the omnibus result (R3)', async () => {
    const { view } = await runK(NORMAL_GROUPS, {
      prepare: (v) => { v._simultaneousPairwise = () => { throw new Error('post-hoc failed'); }; },
    });
    assertEqual(view.result.pairwise, null);
    assertEqual(view.result.route.name, 'Welch ANOVA');
    assertEqual(view.errorText, '');
  });

  test('k = 2: no pairwise section', async () => {
    const { view } = await runK(NORMAL_GROUPS.slice(0, 2));
    assertEqual(view.result.route.name, 'Welch ANOVA');
    assertEqual(view.result.pairwise, null);
  });
});

suite('Hypothesis Test View — residual plots (C1-020)', () => {
  const REFS = ['chart-resid-fits', 'chart-resid-normal', 'chart-resid-hist', 'chart-resid-order'];

  /** chartManager stub that records create calls and destroyed charts. */
  function stubCharts() {
    const calls = [];
    const destroyed = [];
    const chartManager = {
      create: async (el, type, config) => {
        const chart = { el, destroy: () => destroyed.push(chart) };
        calls.push({ el, type, config, chart });
        return chart;
      },
    };
    const container = {
      querySelector: (sel) => {
        const m = /data-ref="([^"]+)"/.exec(sel);
        return m && REFS.includes(m[1]) ? { ref: m[1], replaceChildren() {} } : null;
      },
    };
    return { calls, destroyed, chartManager, container };
  }

  /** Runs the k-group analysis with the stub wired into the module object. */
  async function runStubbed(groups, equalVariances, stub) {
    const t = await loadT();
    const module = { _context: { chartManager: stub.chartManager }, _container: stub.container };
    const view = viewData(module, t);
    const model = new State();
    model.category = 'mean'; model.testType = 'k'; model.equalVariances = equalVariances; model.alpha = 0.05;
    Object.assign(view, { model, t, $nextTick: fn => fn() });
    view._pickerK = { value: groups.map((_, i) => i) };
    view._valuesForRef = ref => groups[ref];
    view._refName = ref => `G${ref + 1}`;
    view.runAnalysis();
    await view._residualRender;
    return view;
  }

  for (const [label, eq] of [['Welch', false], ['Fisher', true]]) {
    test(`${label} route renders the four residual charts`, async () => {
      const stub = stubCharts();
      const view = await runStubbed(NORMAL_GROUPS, eq, stub);
      assertEqual(stub.calls.length, 4);
      assertEqual(stub.calls.map(c => c.type).join(','), 'scatter,probability-plot,histogram,scatter');
      assertEqual(stub.calls.map(c => c.el.ref).join(','), REFS.join(','));
      assertTrue(stub.calls[2].config.showNormalCurve, 'histogram has normal curve');
      assertEqual(stub.calls[0].config.series[0].x.length, 24);
      assertEqual(view.result.residualPlot.residuals.length, 24);
    });
  }

  test('re-running destroys the previous charts and renders anew (checkbox toggle)', async () => {
    const stub = stubCharts();
    const view = await runStubbed(NORMAL_GROUPS, false, stub);
    view.model.equalVariances = true;
    view.runAnalysis();
    await view._residualRender;
    assertEqual(stub.destroyed.length, 4);
    assertEqual(stub.calls.length, 8);
  });

  test('Kruskal-Wallis route: no residual plot, old charts destroyed, nothing new rendered', async () => {
    const stub = stubCharts();
    const view = await runStubbed(NORMAL_GROUPS, true, stub);
    view._valuesForRef = ref => SKEWED_GROUPS[ref];
    view.runAnalysis();
    await view._residualRender;
    assertEqual(view.result.residualPlot, null);
    assertEqual(stub.destroyed.length, 4);
    assertEqual(stub.calls.length, 4);
  });
});

suite('Hypothesis Test VM — setAlpha/setPowerGoal weisen ab', () => {
  async function vm() {
    const t = await loadT();
    const view = viewData({ _context: {} }, t);
    const model = new State();
    model.alpha = 0.05;
    model.powerGoal = 0.8;
    Object.assign(view, { model, t, $nextTick: fn => fn() });
    view.runAnalysis = () => {};
    return view;
  }
  test('setAlpha übernimmt gültige Zahl und Zahlentext', async () => {
    const v = await vm();
    v.setAlpha('0.01');
    assertEqual(v.model.alpha, 0.01);
  });
  test('setAlpha weist leer, 0, 1 und Text ab und lässt α stehen', async () => {
    const v = await vm();
    for (const bad of ['', 'abc']) {
      assertThrows(() => v.setAlpha(bad), /allowed: any finite number/);
    }
    for (const bad of [0, 1]) {
      assertThrows(() => v.setAlpha(bad), /allowed: a number greater than 0 and less than 1/);
    }
    assertEqual(v.model.alpha, 0.05);
  });
  test('setPowerGoal weist außerhalb [0.5, 0.99] ab statt zu klemmen', async () => {
    const v = await vm();
    assertThrows(() => v.setPowerGoal(1.5), /allowed: a number from 0.5 to 0.99/);
    assertEqual(v.model.powerGoal, 0.8);
    v.setPowerGoal(0.9);
    assertEqual(v.model.powerGoal, 0.9);
  });
  test('onParamInput setzt das Feld bei Abweisung auf den Modellwert zurück und markiert es', async () => {
    const v = await vm();
    const field = document.createElement('input');
    field.value = '';
    v.onParamInput('alpha', { target: field });
    assertEqual(field.value, '0.05');
    assertEqual(field.getAttribute('aria-invalid'), 'true');
    assertEqual(v.model.alpha, 0.05);
  });
  test('onParamInput schreibt eine gültige Eingabe über den Setter', async () => {
    const v = await vm();
    const field = document.createElement('input');
    field.value = '0.01';
    v.onParamInput('alpha', { target: field });
    assertEqual(v.model.alpha, 0.01);
    field.value = '0.9';
    v.onParamInput('powerGoal', { target: field });
    assertEqual(v.model.powerGoal, 0.9);
  });
  test('onParamInput verschluckt keinen Programmfehler aus dem Setter', async () => {
    const v = await vm();
    v.runAnalysis = () => { throw new TypeError('kaputt'); };
    const field = document.createElement('input');
    field.value = '0.01';
    assertThrows(() => v.onParamInput('alpha', { target: field }), /kaputt/);
  });
});

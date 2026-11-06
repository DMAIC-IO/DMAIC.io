import { suite, test, assertEqual, assertTrue, assertThrows } from '../test-utils.js';
import { State } from '../../js/modules/hypothesis-test/hypothesis-test-model.js';
import { viewData } from '../../js/modules/hypothesis-test/hypothesis-test.js';
import { NORMAL_GROUPS, SKEWED_GROUPS, loadT } from './hypothesis-test-groups.js';

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

// ── Residuendiagramme ─────────────────────────────────────────────────
// Das Viewmodel läuft ohne DOM: Picker und Spaltenzugriffe sind durch
// Arrays ersetzt. Die Rechenwege prüfen hypothesis-test-analyze.test.js
// und hypothesis-test-present.test.js.

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

import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { Model, createScenarioModel } from '../../js/dialogs/cycle-picker/cycle-picker-model.js';

suite('cycle-picker Model', () => {
  test('apply seeds cycles + preselects current (fallback to first)', () => {
    const cycles = [
      { id: 'dmaic', name: 'DMAIC', short: 'x', description: 'y' },
      { id: 'dmadv', name: 'DMADV', short: 'a', description: 'b' },
    ];
    const m = new Model();
    m.apply({ cycles, preselected: 'dmadv' });
    assertEqual(m.selected, 'dmadv');
    const m2 = new Model().apply({ cycles, preselected: null });
    assertEqual(m2.selected, 'dmaic', 'fallback to first');
  });
  test('validate requires a selection; result returns it', () => {
    const m = new Model();
    assertTrue(!m.validate());
    m.apply({ cycles: [{ id: 'dmaic', name: 'D', short: '', description: '' }], preselected: 'dmaic' });
    assertTrue(m.validate());
    assertEqual(m.result(), 'dmaic');
  });
});

suite('createScenarioModel', () => {
  const cycles = [
    { id: 'dmaic', name: 'DMAIC', short: 'x', description: 'y' },
    { id: 'dmadv', name: 'DMADV', short: 'a', description: 'b' },
  ];
  // Only real scenarios — no synthetic "empty project" entry. The empty
  // project is its own row in step 2, handled via pickScenario(null).
  const fakeOptionsFor = (cycleId) => (cycleId === 'dmaic'
    ? [{ id: 's1', title: 'Scenario 1', description: 'd1' }]
    : []);

  test('apply resets to step 1 and seeds the project name', () => {
    const M = createScenarioModel(fakeOptionsFor);
    const m = new M().apply({
      cycles, preselected: 'dmaic', allowScenarios: true,
      defaultProjectName: 'Neues Projekt',
    });
    assertEqual(m.step, 'cycle');
    assertEqual(m.projectName, 'Neues Projekt');
    assertEqual(m.scenarioOptions.length, 1, 'no synthetic empty entry');
  });

  test('apply() populates scenarioOptions for the preselected cycle when allowed, resets scenarioId', () => {
    const ScenarioModel = createScenarioModel(fakeOptionsFor);
    const m = new ScenarioModel().apply({ cycles, preselected: 'dmaic', allowScenarios: true });
    assertEqual(m.scenarioId, '');
    assertEqual(m.scenarioOptions.length, 1);
    assertEqual(m.scenarioOptions[0].id, 's1');
  });

  test('hasScenarios is true whenever at least one scenario exists', () => {
    const ScenarioModel = createScenarioModel(fakeOptionsFor);
    const withScenarios = new ScenarioModel().apply({ cycles, preselected: 'dmaic', allowScenarios: true });
    assertTrue(withScenarios.hasScenarios);
    const withoutScenarios = new ScenarioModel().apply({ cycles, preselected: 'dmadv', allowScenarios: true });
    assertTrue(!withoutScenarios.hasScenarios);
  });

  test('hasScenarios ignores a synthetic empty-project entry from the producer', () => {
    // cycle-picker.js's buildScenarioOptionsFor still prepends a
    // { id: '', title: emptyProject } entry today (Task 6 removes it).
    // hasScenarios must stay correct against BOTH shapes: today's producer
    // (synthetic entry present) and Task 6's future one (absent).
    const optionsWithSynthetic = (cycleId) => [
      { id: '', title: 'Empty project', description: '' },
      ...(cycleId === 'dmaic' ? [{ id: 's1', title: 'Scenario 1', description: 'd1' }] : []),
    ];
    const ScenarioModel = createScenarioModel(optionsWithSynthetic);

    const onlySynthetic = new ScenarioModel().apply({ cycles, preselected: 'dmadv', allowScenarios: true });
    assertEqual(onlySynthetic.scenarioOptions.length, 1, 'synthetic entry alone is still in the list');
    assertTrue(!onlySynthetic.hasScenarios, 'the synthetic entry is not a real scenario');

    const withReal = new ScenarioModel().apply({ cycles, preselected: 'dmaic', allowScenarios: true });
    assertEqual(withReal.scenarioOptions.length, 2);
    assertTrue(withReal.hasScenarios, 'a real scenario alongside the synthetic entry still counts');
  });

  test('selectCycle() switches cycle, resets scenarioId, refills scenarioOptions', () => {
    const ScenarioModel = createScenarioModel(fakeOptionsFor);
    const m = new ScenarioModel().apply({ cycles, preselected: 'dmaic', allowScenarios: true });
    m.scenarioId = 's1';
    m.selectCycle('dmadv');
    assertEqual(m.selected, 'dmadv');
    assertEqual(m.scenarioId, '');
    assertEqual(m.scenarioOptions.length, 0, 'dmadv has no scenarios');
  });

  test('allowScenarios: false (cycle-switch context) never shows a scenario section', () => {
    const ScenarioModel = createScenarioModel(fakeOptionsFor);
    // Omitted entirely — the default must be "off", not "on".
    const implicit = new ScenarioModel().apply({ cycles, preselected: 'dmaic' });
    assertEqual(implicit.scenarioOptions.length, 0);
    assertTrue(!implicit.hasScenarios);

    // Explicitly false, and switching the cycle must not turn it back on.
    const explicit = new ScenarioModel().apply({ cycles, preselected: 'dmaic', allowScenarios: false });
    assertTrue(!explicit.hasScenarios);
    explicit.selectCycle('dmadv');
    assertEqual(explicit.scenarioOptions.length, 0);
    assertTrue(!explicit.hasScenarios);
  });

  test('allowScenarios getter exposes the per-open restriction to the template', () => {
    // The step-1 "Weiter" button is gated on `model.allowScenarios`; the
    // private `_allowScenarios` field is not readable from an Alpine CSP
    // expression, so the getter is part of the model's public surface.
    const M = createScenarioModel(fakeOptionsFor);
    const create = new M().apply({ cycles, preselected: 'dmaic', allowScenarios: true });
    assertEqual(create.allowScenarios, true);
    const scenarioSwitch = new M().apply({ cycles, preselected: 'dmaic', allowScenarios: false });
    assertEqual(scenarioSwitch.allowScenarios, false);
    const implicit = new M().apply({ cycles, preselected: 'dmaic' });
    assertEqual(implicit.allowScenarios, false, 'default is off');
  });

  test('chooseCycle advances to step 2 in the create context', () => {
    const m = new (createScenarioModel(fakeOptionsFor))()
      .apply({ cycles, preselected: 'dmaic', allowScenarios: true });
    assertEqual(m.chooseCycle('dmadv'), false, 'caller must NOT submit yet');
    assertEqual(m.step, 'start');
    assertEqual(m.selected, 'dmadv');
    assertEqual(m.scenarioOptions.length, 0, 'dmadv has none');
  });

  test('chooseCycle submits immediately in the switch context', () => {
    const m = new (createScenarioModel(fakeOptionsFor))()
      .apply({ cycles, preselected: 'dmaic', allowScenarios: false });
    assertEqual(m.chooseCycle('dmadv'), true);
    assertEqual(m.step, 'cycle', 'switch context never leaves step 1');
  });

  test('switch context stays scenario-free across a cycle change', () => {
    const m = new (createScenarioModel(fakeOptionsFor))()
      .apply({ cycles, preselected: 'dmaic', allowScenarios: false });
    assertEqual(m.chooseCycle('dmaic'), true, 'always submits, even with scenarios available');
    assertEqual(m.step, 'cycle');
    assertEqual(m.scenarioOptions.length, 0);
    assertEqual(m.result().scenarioId, null);
    assertEqual(m.result().projectName, null, 'switch context never seeds a name');
  });

  test('back returns to step 1 and keeps the picked cycle', () => {
    const m = new (createScenarioModel(fakeOptionsFor))()
      .apply({ cycles, preselected: 'dmaic', allowScenarios: true });
    m.chooseCycle('dmadv');
    assertEqual(m.step, 'start');
    m.back();
    assertEqual(m.step, 'cycle');
    assertEqual(m.selected, 'dmadv', 'back keeps the cycle selection');
  });

  test('result carries a trimmed project name, null when blank', () => {
    const m = new (createScenarioModel(fakeOptionsFor))()
      .apply({ cycles, preselected: 'dmaic', allowScenarios: true, defaultProjectName: '  ' });
    assertEqual(m.result().projectName, null);
    m.projectName = '  Mein Projekt ';
    assertEqual(m.result().projectName, 'Mein Projekt');
  });

  test('pickScenario(null) means empty project', () => {
    const m = new (createScenarioModel(fakeOptionsFor))()
      .apply({ cycles, preselected: 'dmaic', allowScenarios: true });
    m.pickScenario('s1');
    assertEqual(m.result().scenarioId, 's1');
    m.pickScenario(null);
    assertEqual(m.result().scenarioId, null);
  });

  test('apply resets step, scenario and name after a cancelled mid-flow reopen', () => {
    // Simulates createDialog.open() calling model.apply(init) again on the
    // SAME instance after the user advanced to step 2, picked a scenario,
    // typed a name, and then cancelled — the next open must not leak any
    // of that into the fresh session.
    const m = new (createScenarioModel(fakeOptionsFor))()
      .apply({ cycles, preselected: 'dmaic', allowScenarios: true, defaultProjectName: 'Erstes Projekt' });
    m.chooseCycle('dmaic');
    m.pickScenario('s1');
    m.projectName = 'Getippter Name';
    assertEqual(m.step, 'start');

    m.apply({ cycles, preselected: 'dmaic', allowScenarios: true, defaultProjectName: 'Neues Projekt' });

    assertEqual(m.step, 'cycle', 'reopen lands on step 1');
    assertEqual(m.projectName, 'Neues Projekt', 'name field is not stale');
    assertEqual(m.result().scenarioId, null, 'no stale scenario selection');
    assertEqual(m.selected, 'dmaic');
  });
});

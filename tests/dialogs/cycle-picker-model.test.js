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
  const fakeOptionsFor = (cycleId) => [
    { id: '', title: 'Empty project', description: '' },
    ...(cycleId === 'dmaic' ? [{ id: 's1', title: 'Scenario 1', description: 'd1' }] : []),
  ];

  test('apply() populates scenarioOptions for the preselected cycle when allowed, resets scenarioId', () => {
    const ScenarioModel = createScenarioModel(fakeOptionsFor);
    const m = new ScenarioModel().apply({ cycles, preselected: 'dmaic', allowScenarios: true });
    assertEqual(m.scenarioId, '');
    assertEqual(m.scenarioOptions.length, 2);
    assertEqual(m.scenarioOptions[1].id, 's1');
  });

  test('hasScenarios is true only when a real scenario exists beyond "empty"', () => {
    const ScenarioModel = createScenarioModel(fakeOptionsFor);
    const withScenarios = new ScenarioModel().apply({ cycles, preselected: 'dmaic', allowScenarios: true });
    assertTrue(withScenarios.hasScenarios);
    const withoutScenarios = new ScenarioModel().apply({ cycles, preselected: 'dmadv', allowScenarios: true });
    assertTrue(!withoutScenarios.hasScenarios);
  });

  test('selectCycle() switches cycle, resets scenarioId, refills scenarioOptions', () => {
    const ScenarioModel = createScenarioModel(fakeOptionsFor);
    const m = new ScenarioModel().apply({ cycles, preselected: 'dmaic', allowScenarios: true });
    m.scenarioId = 's1';
    m.selectCycle('dmadv');
    assertEqual(m.selected, 'dmadv');
    assertEqual(m.scenarioId, '');
    assertEqual(m.scenarioOptions.length, 1, 'dmadv has no scenarios beyond "empty"');
  });

  test('result() returns cycleId + scenarioId (null when empty option picked)', () => {
    const ScenarioModel = createScenarioModel(fakeOptionsFor);
    const m = new ScenarioModel().apply({ cycles, preselected: 'dmaic', allowScenarios: true });
    assertEqual(JSON.stringify(m.result()), JSON.stringify({ cycleId: 'dmaic', scenarioId: null }));
    m.scenarioId = 's1';
    assertEqual(JSON.stringify(m.result()), JSON.stringify({ cycleId: 'dmaic', scenarioId: 's1' }));
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
});

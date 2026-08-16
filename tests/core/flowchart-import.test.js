/**
 * D.Mike — Flowchart generic import registry (flowchart-import.js) — unit tests.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import {
  registerSourceMapper, listSourceInstances, appendFromInstance,
  __resetRegistryForTests,
} from '../../js/core/flowchart/flowchart-import.js';
import { FlowchartState } from '../../js/core/flowchart/flowchart-model.js';

// Minimal fake stateManager for tests.
function fakeSM(instances) {
  return {
    listInstances(moduleId) {
      return instances.filter((i) => i.moduleId === moduleId);
    },
    getModuleState(instanceId) {
      const inst = instances.find((i) => i.instanceId === instanceId);
      return inst ? inst.state : null;
    },
  };
}

suite('flowchart-import — mapper registry', () => {
  test('registerSourceMapper + appendFromInstance appends mapped steps', () => {
    __resetRegistryForTests();
    registerSourceMapper('process-map', 'sipoc', (sipoc) =>
      (sipoc?.process || []).map((p) => ({ title: p })));
    const sm = fakeSM([
      { instanceId: 'i1', moduleId: 'sipoc', state: { process: ['P1', 'P2'] } },
    ]);
    const target = new FlowchartState();
    const appended = appendFromInstance({
      targetModuleId: 'process-map', sourceModuleId: 'sipoc',
      instanceId: 'i1', stateManager: sm, targetState: target,
    });
    assertEqual(appended.length, 2);
    assertEqual(target.steps.length, 2);
    assertEqual(target.steps[0].title, 'P1');
  });

  test('appendFromInstance returns null when no mapper registered', () => {
    __resetRegistryForTests();
    const sm = fakeSM([{ instanceId: 'i', moduleId: 'sipoc', state: {} }]);
    const target = new FlowchartState();
    const out = appendFromInstance({
      targetModuleId: 'x', sourceModuleId: 'sipoc',
      instanceId: 'i', stateManager: sm, targetState: target,
    });
    assertEqual(out, null);
    assertEqual(target.steps.length, 0);
  });

  test('listSourceInstances filters by source list', () => {
    __resetRegistryForTests();
    const sm = fakeSM([
      { instanceId: 'a', moduleId: 'sipoc', state: {}, title: 'S1' },
      { instanceId: 'b', moduleId: 'process-map', state: {}, title: 'P1' },
    ]);
    // Note: our fakeSM's listInstances returns everything with the given moduleId;
    // the utility passes each source id in turn.
    const found = listSourceInstances({ sources: ['sipoc'], stateManager: sm });
    assertEqual(found.length, 1);
    assertEqual(found[0].instanceId, 'a');
  });

  test('listSourceInstances leaves an unrenamed instance untitled', () => {
    // Never fall back to the instanceId — the picker would show a raw UUID.
    // The row still identifies itself via the module-name label next to it.
    __resetRegistryForTests();
    const sm = fakeSM([{ instanceId: 'uuid-1234', moduleId: 'process-map', state: {} }]);
    const found = listSourceInstances({ sources: ['process-map'], stateManager: sm });
    assertEqual(found.length, 1);
    assertEqual(found[0].title, '');
  });

  test('listSourceInstances numbers several unrenamed instances of one source', () => {
    __resetRegistryForTests();
    const sm = fakeSM([
      { instanceId: 'u1', moduleId: 'process-map', state: {} },
      { instanceId: 'u2', moduleId: 'process-map', state: {} },
    ]);
    const found = listSourceInstances({ sources: ['process-map'], stateManager: sm });
    assertEqual(found.map((f) => f.title).join(','), '#1,#2');
  });

  test('listSourceInstances numbers only the untitled ones', () => {
    __resetRegistryForTests();
    const sm = fakeSM([
      { instanceId: 'u1', moduleId: 'process-map', state: {}, title: 'Wareneingang' },
      { instanceId: 'u2', moduleId: 'process-map', state: {} },
    ]);
    const found = listSourceInstances({ sources: ['process-map'], stateManager: sm });
    assertEqual(found.map((f) => f.title).join(','), 'Wareneingang,#2');
  });
});

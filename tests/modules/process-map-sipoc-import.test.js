/**
 * D.Mike — Process Map / SIPOC Import helpers — unit tests.
 * Specifies the two pure helpers that back the "Aus SIPOC übernehmen" flow
 * before implementation.
 */

import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import {
  listSipocInstances,
  appendSipocProcess,
} from '../../js/modules/process-map/process-map-sipoc-import.js';
import { State } from '../../js/modules/process-map/process-map-model.js';

/** Minimal stub for the state-manager API the helper touches. */
function stubSM(phases, moduleStates) {
  return {
    get(path) {
      if (path === 'phases') return phases;
      const m = /^phases\.(.+)$/.exec(path);
      if (m) return phases[m[1]] ?? [];
      return undefined;
    },
    getModuleState(instanceId) {
      return moduleStates[instanceId] ?? null;
    },
  };
}

suite('process-map-sipoc-import — listSipocInstances', () => {
  test('returns [] when no phases exist', () => {
    const sm = stubSM({}, {});
    assertDeepEqual(listSipocInstances(sm), []);
  });

  test('returns [] when no SIPOC instances exist', () => {
    const sm = stubSM(
      { define: [{ instanceId: 'a', moduleId: 'project-charter', order: 0 }] },
      {},
    );
    assertDeepEqual(listSipocInstances(sm), []);
  });

  test('lists one SIPOC with a populated process column', () => {
    const sm = stubSM(
      { define: [{ instanceId: 's1', moduleId: 'sipoc', order: 0 }] },
      { s1: { columns: { suppliers: [], inputs: [], process: ['A', 'B', 'C'], outputs: [], customers: [] } } },
    );
    const out = listSipocInstances(sm);
    assertEqual(out.length, 1);
    assertEqual(out[0].instanceId, 's1');
    assertEqual(out[0].processCount, 3);
    assertDeepEqual(out[0].processPreview, ['A', 'B', 'C']);
    assertEqual(out[0].label, 'SIPOC #1');
  });

  test('lists SIPOCs across multiple phases in order (define → measure)', () => {
    const sm = stubSM(
      {
        define:  [{ instanceId: 's1', moduleId: 'sipoc', order: 0 }],
        measure: [{ instanceId: 's2', moduleId: 'sipoc', order: 0 }],
      },
      {
        s1: { columns: { suppliers: [], inputs: [], process: ['X'], outputs: [], customers: [] } },
        s2: { columns: { suppliers: [], inputs: [], process: ['Y', 'Z'], outputs: [], customers: [] } },
      },
    );
    const out = listSipocInstances(sm);
    assertEqual(out.length, 2);
    assertEqual(out[0].instanceId, 's1');
    assertEqual(out[0].label, 'SIPOC #1');
    assertEqual(out[1].instanceId, 's2');
    assertEqual(out[1].label, 'SIPOC #2');
  });

  test('caps processPreview at 4 entries', () => {
    const sm = stubSM(
      { define: [{ instanceId: 's1', moduleId: 'sipoc', order: 0 }] },
      { s1: { columns: { process: ['A', 'B', 'C', 'D', 'E', 'F'] } } },
    );
    const [out] = listSipocInstances(sm);
    assertEqual(out.processCount, 6);
    assertDeepEqual(out.processPreview, ['A', 'B', 'C', 'D']);
  });

  test('handles SIPOC with missing state / missing columns gracefully', () => {
    const sm = stubSM(
      {
        define: [
          { instanceId: 's1', moduleId: 'sipoc', order: 0 },
          { instanceId: 's2', moduleId: 'sipoc', order: 1 },
        ],
      },
      {
        s1: null,
        s2: {},
      },
    );
    const out = listSipocInstances(sm);
    assertEqual(out.length, 2);
    assertEqual(out[0].processCount, 0);
    assertDeepEqual(out[0].processPreview, []);
    assertEqual(out[1].processCount, 0);
  });

  test('trims empty strings out of processCount/preview', () => {
    const sm = stubSM(
      { define: [{ instanceId: 's1', moduleId: 'sipoc', order: 0 }] },
      { s1: { columns: { process: ['A', '', '   ', 'B'] } } },
    );
    const [out] = listSipocInstances(sm);
    assertEqual(out.processCount, 2);
    assertDeepEqual(out.processPreview, ['A', 'B']);
  });
});

suite('process-map-sipoc-import — appendSipocProcess', () => {
  test('appends one step per non-empty process entry', () => {
    const model = new State();
    const count = appendSipocProcess(model, { columns: { process: ['A', 'B'] } });
    assertEqual(count, 2);
    assertEqual(model.steps.length, 2);
    assertEqual(model.steps[0].title, 'A');
    assertEqual(model.steps[1].title, 'B');
  });

  test('appended steps have canonical Step shape', () => {
    const model = new State();
    appendSipocProcess(model, { columns: { process: ['One'] } });
    const step = model.steps[0];
    assertEqual(typeof step.id, 'string');
    assertEqual(step.title, 'One');
    assertEqual(step.description, '');
    assertEqual(step.valueType, null);
    assertDeepEqual(step.inputs, []);
    assertDeepEqual(step.outputs, []);
    assertDeepEqual(step.substeps, []);
    assertEqual(step.expanded, false);
    assertEqual(step.loop, null);
  });

  test('appends after existing steps (does not replace)', () => {
    const model = new State();
    model.addStep(0);
    model.steps[0].title = 'Existing';
    const count = appendSipocProcess(model, { columns: { process: ['New1', 'New2'] } });
    assertEqual(count, 2);
    assertEqual(model.steps.length, 3);
    assertEqual(model.steps[0].title, 'Existing');
    assertEqual(model.steps[1].title, 'New1');
    assertEqual(model.steps[2].title, 'New2');
  });

  test('assigns unique step ids', () => {
    const model = new State();
    appendSipocProcess(model, { columns: { process: ['A', 'B', 'C'] } });
    const ids = model.steps.map(s => s.id);
    assertEqual(new Set(ids).size, ids.length);
  });

  test('skips empty / whitespace-only entries', () => {
    const model = new State();
    const count = appendSipocProcess(model, { columns: { process: ['A', '', '   ', 'B'] } });
    assertEqual(count, 2);
    assertEqual(model.steps.length, 2);
    assertEqual(model.steps[0].title, 'A');
    assertEqual(model.steps[1].title, 'B');
  });

  test('returns 0 and no-ops on missing state / columns', () => {
    const m1 = new State();
    assertEqual(appendSipocProcess(m1, null), 0);
    assertEqual(m1.steps.length, 0);
    const m2 = new State();
    assertEqual(appendSipocProcess(m2, {}), 0);
    assertEqual(m2.steps.length, 0);
    const m3 = new State();
    assertEqual(appendSipocProcess(m3, { columns: {} }), 0);
    assertEqual(m3.steps.length, 0);
  });
});

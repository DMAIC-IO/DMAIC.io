/**
 * D.Mike — Process Map Model unit tests
 * Specifies the State class (steps + IO + substeps + loops) before implementation.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/process-map/process-map-model.js';

suite('Process Map Model — construction & serialization', () => {
  test('constructor sets empty steps', () => {
    const s = new State();
    assertEqual(Array.isArray(s.steps), true);
    assertEqual(s.steps.length, 0);
  });

  test('fromJSON(null) returns valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s instanceof State, true);
    assertEqual(s.steps.length, 0);
  });

  test('fromJSON(undefined) returns valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.steps.length, 0);
  });

  test('fromJSON(malformed) returns valid default', () => {
    assertEqual(State.fromJSON(42).steps.length, 0);
    assertEqual(State.fromJSON('x').steps.length, 0);
    assertEqual(State.fromJSON({ steps: 'nope' }).steps.length, 0);
  });

  test('fromJSON normalizes step fields', () => {
    const s = State.fromJSON({
      steps: [{ id: 'a', title: 'T', description: 'D' }],
    });
    const st = s.steps[0];
    assertEqual(st.valueType, null);
    assertEqual(Array.isArray(st.substeps), true);
    assertEqual(st.substeps.length, 0);
    assertEqual(st.expanded, false);
    assertEqual(st.loop, null);
    assertEqual(Array.isArray(st.inputs), true);
    assertEqual(Array.isArray(st.outputs), true);
  });

  test('fromJSON preserves explicit substeps/expanded/loop', () => {
    const s = State.fromJSON({
      steps: [{
        id: 'a', title: 'T', description: '', valueType: 'va',
        inputs: [{ id: 'i', name: 'In', inputType: 'param' }],
        outputs: [{ id: 'o', name: 'Out' }],
        substeps: [{ id: 'ss', title: 'Sub' }],
        expanded: true,
        loop: { targetStepId: null, condition: 'c', steps: [{ id: 'ls', title: 'L' }] },
      }],
    });
    const st = s.steps[0];
    assertEqual(st.valueType, 'va');
    assertEqual(st.inputs[0].inputType, 'param');
    assertEqual(st.substeps[0].title, 'Sub');
    assertEqual(st.expanded, true);
    assertEqual(st.loop.condition, 'c');
    assertEqual(st.loop.steps[0].title, 'L');
  });

  test('toJSON shape is { steps: [...] }', () => {
    const s = new State();
    s.addStep(0);
    const j = s.toJSON();
    assertEqual(Object.keys(j).join(','), 'steps');
    assertEqual(Array.isArray(j.steps), true);
    assertEqual(j.steps.length, 1);
  });

  test('toJSON ↔ fromJSON roundtrip lossless', () => {
    const s = new State();
    const id = s.addStep(0);
    s.findStep(id).title = 'Hello';
    s.addIO(id, 'inputs');
    s.cycleValueType(id);
    const json = s.toJSON();
    const back = State.fromJSON(json);
    assertEqual(JSON.stringify(back.toJSON()), JSON.stringify(json));
  });
});

suite('Process Map Model — step CRUD', () => {
  test('addStep inserts at index and returns id', () => {
    const s = new State();
    const a = s.addStep(0);
    const b = s.addStep(0); // insert before a
    assertEqual(s.steps[0].id, b);
    assertEqual(s.steps[1].id, a);
    assertEqual(typeof a, 'string');
  });

  test('addStep defaults are correct', () => {
    const s = new State();
    const id = s.addStep(0);
    const st = s.findStep(id);
    assertEqual(st.title, '');
    assertEqual(st.description, '');
    assertEqual(st.valueType, null);
    assertEqual(st.inputs.length, 0);
    assertEqual(st.outputs.length, 0);
    assertEqual(st.substeps.length, 0);
    assertEqual(st.expanded, false);
    assertEqual(st.loop, null);
  });

  test('removeStep removes and clears loop targets to it', () => {
    const s = new State();
    const a = s.addStep(0);
    const b = s.addStep(1);
    s.toggleLoop(b);
    s.findStep(b).loop.targetStepId = a;
    s.removeStep(a);
    assertEqual(s.steps.length, 1);
    // Legacy: a loop targeting the removed step is dropped entirely (loop → null).
    assertEqual(s.findStep(b).loop, null);
  });

  test('moveStep reorders and validates loop targets', () => {
    const s = new State();
    const a = s.addStep(0);
    const b = s.addStep(1);
    const c = s.addStep(2);
    s.toggleLoop(c);
    s.findStep(c).loop.targetStepId = a; // valid: a before c
    s.moveStep(c, a); // move c to a's slot → c now before a
    assertEqual(s.steps[0].id, c);
    // target a is now AFTER c → invalidated to null
    assertEqual(s.findStep(c).loop.targetStepId, null);
    assertEqual(b, b);
  });
});

suite('Process Map Model — IO CRUD', () => {
  test('addIO / removeIO inputs & outputs', () => {
    const s = new State();
    const id = s.addStep(0);
    const i1 = s.addIO(id, 'inputs');
    s.addIO(id, 'inputs');
    s.addIO(id, 'outputs');
    assertEqual(s.findStep(id).inputs.length, 2);
    assertEqual(s.findStep(id).outputs.length, 1);
    s.removeIO(id, 'inputs', i1);
    assertEqual(s.findStep(id).inputs.length, 1);
  });

  test('cycleInputType cycles null→param→noise→null per io', () => {
    const s = new State();
    const id = s.addStep(0);
    const io = s.addIO(id, 'inputs');
    assertEqual(s.findIO(id, 'inputs', io).inputType, undefined);
    s.cycleInputType(id, io);
    assertEqual(s.findIO(id, 'inputs', io).inputType, 'param');
    s.cycleInputType(id, io);
    assertEqual(s.findIO(id, 'inputs', io).inputType, 'noise');
    s.cycleInputType(id, io);
    assertEqual(s.findIO(id, 'inputs', io).inputType, null);
  });

  test('moveIO reorders within input list', () => {
    const s = new State();
    const id = s.addStep(0);
    const i1 = s.addIO(id, 'inputs');
    const i2 = s.addIO(id, 'inputs');
    s.moveIO(id, 'inputs', i2, i1);
    assertEqual(s.findStep(id).inputs[0].id, i2);
  });
});

suite('Process Map Model — value type', () => {
  test('cycleValueType cycles null→va→bnva→nva→null', () => {
    const s = new State();
    const id = s.addStep(0);
    assertEqual(s.findStep(id).valueType, null);
    s.cycleValueType(id); assertEqual(s.findStep(id).valueType, 'va');
    s.cycleValueType(id); assertEqual(s.findStep(id).valueType, 'bnva');
    s.cycleValueType(id); assertEqual(s.findStep(id).valueType, 'nva');
    s.cycleValueType(id); assertEqual(s.findStep(id).valueType, null);
  });
});

suite('Process Map Model — substeps', () => {
  test('toggleSubsteps flips expanded', () => {
    const s = new State();
    const id = s.addStep(0);
    s.toggleSubsteps(id);
    assertEqual(s.findStep(id).expanded, true);
    s.toggleSubsteps(id);
    assertEqual(s.findStep(id).expanded, false);
  });

  test('addSubstep / removeSubstep collapses on empty', () => {
    const s = new State();
    const id = s.addStep(0);
    s.toggleSubsteps(id);
    const ss = s.addSubstep(id);
    assertEqual(s.findStep(id).substeps.length, 1);
    assertEqual(s.findStep(id).expanded, true);
    s.removeSubstep(id, ss);
    assertEqual(s.findStep(id).substeps.length, 0);
    assertEqual(s.findStep(id).expanded, false);
  });

  test('moveSubstep reorders', () => {
    const s = new State();
    const id = s.addStep(0);
    s.toggleSubsteps(id);
    const a = s.addSubstep(id);
    const b = s.addSubstep(id);
    s.moveSubstep(id, b, a);
    assertEqual(s.findStep(id).substeps[0].id, b);
  });
});

suite('Process Map Model — loops', () => {
  test('toggleLoop creates and clears loop', () => {
    const s = new State();
    const id = s.addStep(0);
    s.toggleLoop(id);
    const l = s.findStep(id).loop;
    assertEqual(l.targetStepId, null);
    assertEqual(l.condition, '');
    assertEqual(Array.isArray(l.steps), true);
    s.toggleLoop(id);
    assertEqual(s.findStep(id).loop, null);
  });

  test('removeLoop clears loop', () => {
    const s = new State();
    const id = s.addStep(0);
    s.toggleLoop(id);
    s.removeLoop(id);
    assertEqual(s.findStep(id).loop, null);
  });

  test('addLoopStep / removeLoopStep', () => {
    const s = new State();
    const id = s.addStep(0);
    s.toggleLoop(id);
    const ls = s.addLoopStep(id);
    assertEqual(s.findStep(id).loop.steps.length, 1);
    s.removeLoopStep(id, ls);
    assertEqual(s.findStep(id).loop.steps.length, 0);
  });

  test('validateLoopTargets clears forward/missing targets', () => {
    const s = new State();
    const a = s.addStep(0);
    const b = s.addStep(1);
    s.toggleLoop(a);
    s.findStep(a).loop.targetStepId = b; // forward reference → invalid
    s.validateLoopTargets();
    assertEqual(s.findStep(a).loop.targetStepId, null);
  });
});

suite('Process Map Model — helpers & export', () => {
  test('hasContent reflects step presence', () => {
    const s = new State();
    assertEqual(s.hasContent(), false);
    s.addStep(0);
    assertEqual(s.hasContent(), true);
  });

  test('stepIndexById is 0-based, -1 when missing', () => {
    const s = new State();
    const a = s.addStep(0);
    assertEqual(s.stepIndexById(a), 0);
    assertEqual(s.stepIndexById('nope'), -1);
  });

  test('toExportJSON builds numbered structure', () => {
    const s = new State();
    const a = s.addStep(0);
    s.findStep(a).title = 'Step 1';
    const i = s.addIO(a, 'inputs');
    s.findIO(a, 'inputs', i).name = 'In';
    s.cycleInputType(a, i); // param
    const o = s.addIO(a, 'outputs');
    s.findIO(a, 'outputs', o).name = 'Out';
    const b = s.addStep(1);
    s.toggleLoop(b);
    s.findStep(b).loop.targetStepId = a;
    s.findStep(b).loop.condition = 'Rework';

    const out = s.toExportJSON();
    assertEqual(out.tool, 'ProcessMap');
    assertEqual(out.steps[0].step, 1);
    assertEqual(out.steps[0].title, 'Step 1');
    assertEqual(out.steps[0].inputs[0].name, 'In');
    assertEqual(out.steps[0].inputs[0].type, 'param');
    assertEqual(out.steps[0].outputs[0], 'Out');
    assertEqual(out.steps[1].loop.targetStep, 1);
    assertEqual(out.steps[1].loop.condition, 'Rework');
  });
});
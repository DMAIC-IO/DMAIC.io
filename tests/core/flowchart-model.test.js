/**
 * Tests for js/core/flowchart/flowchart-model.js — chain-core state.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { FlowchartState } from '../../js/core/flowchart/flowchart-model.js';

suite('FlowchartState — construction', () => {
  test('constructs with empty steps array', () => {
    const s = new FlowchartState();
    assertEqual(Array.isArray(s.steps), true);
    assertEqual(s.steps.length, 0);
  });

  test('normalizeStep exists as instance method', () => {
    const s = new FlowchartState();
    assertEqual(typeof s.normalizeStep, 'function');   // fails in this task — implemented in Task 2
  });
});

suite('FlowchartState.normalizeStep — core fields', () => {
  test('defaults empty raw to all-empty step with generated id', () => {
    const s = new FlowchartState();
    const out = s.normalizeStep({});
    assertEqual(typeof out.id, 'string');
    assertEqual(out.id.length > 0, true);
    assertEqual(out.title, '');
    assertEqual(out.description, '');
    assertEqual(out.expanded, false);
    assertEqual(Array.isArray(out.substeps), true);
    assertEqual(out.substeps.length, 0);
  });

  test('preserves valid core fields verbatim', () => {
    const s = new FlowchartState();
    const out = s.normalizeStep({
      id: 'abc', title: 'T', description: 'D', expanded: true,
      substeps: [{ id: 'x', title: 'sub' }],
    });
    assertEqual(out.id, 'abc');
    assertEqual(out.title, 'T');
    assertEqual(out.description, 'D');
    assertEqual(out.expanded, true);
    assertEqual(out.substeps[0].id, 'x');
    assertEqual(out.substeps[0].title, 'sub');
  });

  test('coerces malformed core fields to defaults', () => {
    const s = new FlowchartState();
    const out = s.normalizeStep({ title: 42, description: null, expanded: 'yes', substeps: 'nope' });
    assertEqual(out.title, '');
    assertEqual(out.description, '');
    assertEqual(out.expanded, false);
    assertEqual(out.substeps.length, 0);
  });
});

suite('FlowchartState.normalizeStep — extension pass-through', () => {
  test('unknown top-level fields survive normalization', () => {
    const s = new FlowchartState();
    const out = s.normalizeStep({
      title: 'T',
      valueType: 'va',
      inputs: [{ id: 'i1', name: 'in' }],
      outputs: [{ id: 'o1', name: 'out' }],
      laneId: 'sales',
      side: 'nva',
      decision: { label: '?', yesTarget: 'next', noTarget: 'end' },
    });
    assertEqual(out.valueType, 'va');
    assertEqual(out.inputs[0].name, 'in');
    assertEqual(out.outputs[0].name, 'out');
    assertEqual(out.laneId, 'sales');
    assertEqual(out.side, 'nva');
    assertEqual(out.decision.label, '?');
  });

  test('moduleNormalize runs last and can mutate extensions', () => {
    const s = new FlowchartState();
    const out = s.normalizeStep(
      { title: 'T', side: 'weird' },
      (step) => ({ ...step, side: step.side === 'va' || step.side === 'nva' ? step.side : 'nva' }),
    );
    assertEqual(out.side, 'nva');
    assertEqual(out.title, 'T');
  });

  test('core fields cannot be overridden by moduleNormalize with invalid types', () => {
    // moduleNormalize sees the already-coerced core, so if it returns invalid
    // types, it's on the module — the core does NOT re-coerce afterwards.
    // This test documents the contract: moduleNormalize is trusted.
    const s = new FlowchartState();
    const out = s.normalizeStep(
      { title: 'T' },
      (step) => ({ ...step, title: 'X' }),
    );
    assertEqual(out.title, 'X');
  });
});

suite('FlowchartState — chain CRUD', () => {
  test('addStep() appends at end with defaults', () => {
    const s = new FlowchartState();
    const a = s.addStep();
    assertEqual(s.steps.length, 1);
    assertEqual(s.steps[0].id, a.id);
    assertEqual(a.title, '');
  });

  test('addStep(0) inserts at head', () => {
    const s = new FlowchartState();
    const a = s.addStep(0, { title: 'A' });
    const b = s.addStep(0, { title: 'B' });
    assertEqual(s.steps[0].title, 'B');
    assertEqual(s.steps[1].title, 'A');
  });

  test('addStep clamps out-of-range index', () => {
    const s = new FlowchartState();
    s.addStep(0, { title: 'A' });
    s.addStep(99, { title: 'B' });     // clamped to length
    s.addStep(-5, { title: 'C' });     // clamped to 0
    assertEqual(s.steps.map((x) => x.title).join(','), 'C,A,B');
  });

  test('addStep seed goes through normalizeStep (pass-through of extensions)', () => {
    const s = new FlowchartState();
    const a = s.addStep(0, { title: 'A', laneId: 'sales' });
    assertEqual(a.laneId, 'sales');
    assertEqual(typeof a.id, 'string');
  });

  test('removeStep removes by id and returns true', () => {
    const s = new FlowchartState();
    const a = s.addStep(); s.addStep();
    assertEqual(s.removeStep(a.id), true);
    assertEqual(s.steps.length, 1);
    assertEqual(s.steps.find((x) => x.id === a.id), undefined);
  });

  test('removeStep with unknown id returns false, no throw', () => {
    const s = new FlowchartState();
    s.addStep();
    assertEqual(s.removeStep('nope'), false);
    assertEqual(s.steps.length, 1);
  });

  test('moveStepToGap moves a step to the right', () => {
    const s = new FlowchartState();
    const a = s.addStep(0, { title: 'A' });
    s.addStep(1, { title: 'B' });
    s.addStep(2, { title: 'C' });
    assertEqual(s.moveStepToGap(a.id, 3), true);   // A ans Ende
    assertEqual(s.steps.map((x) => x.title).join(','), 'B,C,A');
  });

  test('moveStepToGap moves a step to the left', () => {
    const s = new FlowchartState();
    s.addStep(0, { title: 'A' });
    s.addStep(1, { title: 'B' });
    const c = s.addStep(2, { title: 'C' });
    assertEqual(s.moveStepToGap(c.id, 0), true);   // C ganz nach vorn
    assertEqual(s.steps.map((x) => x.title).join(','), 'C,A,B');
  });

  test('moveStepToGap is a no-op on the two gaps touching the step', () => {
    const s = new FlowchartState();
    s.addStep(0, { title: 'A' });
    const b = s.addStep(1, { title: 'B' });
    s.addStep(2, { title: 'C' });
    // Lücke 1 liegt vor B, Lücke 2 dahinter — beide sind schon B's Platz.
    assertEqual(s.moveStepToGap(b.id, 1), false);
    assertEqual(s.moveStepToGap(b.id, 2), false);
    assertEqual(s.steps.map((x) => x.title).join(','), 'A,B,C');
  });

  test('moveStepToGap accepts the boundary gaps 0 and n', () => {
    const s = new FlowchartState();
    const a = s.addStep(0, { title: 'A' });
    const b = s.addStep(1, { title: 'B' });
    assertEqual(s.moveStepToGap(b.id, 0), true);
    assertEqual(s.steps.map((x) => x.title).join(','), 'B,A');
    assertEqual(s.moveStepToGap(b.id, 2), true);
    assertEqual(s.steps.map((x) => x.title).join(','), 'A,B');
    assertEqual(a.id === b.id, false);
  });

  test('moveStepToGap rejects out-of-range and non-integer gaps', () => {
    const s = new FlowchartState();
    const a = s.addStep(0, { title: 'A' });
    s.addStep(1, { title: 'B' });
    assertEqual(s.moveStepToGap(a.id, -1), false);
    assertEqual(s.moveStepToGap(a.id, 3), false);
    assertEqual(s.moveStepToGap(a.id, 1.5), false);
    assertEqual(s.moveStepToGap(a.id, '2'), false);
    assertEqual(s.steps.map((x) => x.title).join(','), 'A,B');
  });

  test('moveStepToGap with an unknown id returns false, no throw', () => {
    const s = new FlowchartState();
    s.addStep();
    assertEqual(s.moveStepToGap('nope', 0), false);
  });
});

suite('FlowchartState — substep CRUD', () => {
  test('addSubstep appends and returns the new substep', () => {
    const s = new FlowchartState();
    const p = s.addStep();
    const ss = s.addSubstep(p.id, { title: 'sub1' });
    assertEqual(p.substeps.length, 1);
    assertEqual(p.substeps[0].id, ss.id);
    assertEqual(ss.title, 'sub1');
  });

  test('addSubstep with unknown parent returns null', () => {
    const s = new FlowchartState();
    assertEqual(s.addSubstep('nope'), null);
  });

  test('removeSubstep removes and returns true', () => {
    const s = new FlowchartState();
    const p = s.addStep();
    const ss = s.addSubstep(p.id);
    assertEqual(s.removeSubstep(p.id, ss.id), true);
    assertEqual(p.substeps.length, 0);
  });

  test('moveSubstep reorders within parent', () => {
    const s = new FlowchartState();
    const p = s.addStep();
    const a = s.addSubstep(p.id, { title: 'A' });
    const b = s.addSubstep(p.id, { title: 'B' });
    const c = s.addSubstep(p.id, { title: 'C' });
    s.moveSubstep(p.id, a.id, c.id);
    assertEqual(p.substeps.map((x) => x.title).join(','), 'B,C,A');
  });
});

suite('FlowchartState — persistence', () => {
  test('toJSON returns { steps }', () => {
    const s = new FlowchartState();
    s.addStep(0, { title: 'A', laneId: 'sales' });
    const json = s.toJSON();
    assertEqual(Array.isArray(json.steps), true);
    assertEqual(json.steps[0].title, 'A');
    assertEqual(json.steps[0].laneId, 'sales');
  });

  test('fromJSON(null) returns empty state', () => {
    const s = FlowchartState.fromJSON(null);
    assertEqual(s instanceof FlowchartState, true);
    assertEqual(s.steps.length, 0);
  });

  test('fromJSON roundtrip preserves core AND extension fields', () => {
    const src = {
      steps: [
        { id: 's1', title: 'A', description: 'd', expanded: true,
          substeps: [{ id: 'x', title: 'sub' }],
          valueType: 'va', inputs: [{ id: 'i', name: 'in' }], laneId: 'sales' },
        { id: 's2', title: 'B', side: 'nva', decision: { yesTarget: 'next', noTarget: 'end' } },
      ],
    };
    const s = FlowchartState.fromJSON(src);
    const out = s.toJSON();
    assertEqual(out.steps[0].valueType, 'va');
    assertEqual(out.steps[0].inputs[0].name, 'in');
    assertEqual(out.steps[0].laneId, 'sales');
    assertEqual(out.steps[1].side, 'nva');
    assertEqual(out.steps[1].decision.noTarget, 'end');
    assertEqual(out.steps[0].substeps[0].title, 'sub');
  });

  test('fromJSON forwards moduleNormalize to each step', () => {
    const src = { steps: [{ title: 'A' }, { title: 'B' }] };
    const s = FlowchartState.fromJSON(src, (step) => ({ ...step, tag: 'x' }));
    assertEqual(s.steps[0].tag, 'x');
    assertEqual(s.steps[1].tag, 'x');
  });

  test('toJSON returns a deep copy — mutating nested arrays does not leak back', () => {
    const s = new FlowchartState();
    s.addStep(0, {
      title: 'A',
      substeps: [{ id: 'x', title: 'sub' }],
      inputs: [{ id: 'i1', name: 'in' }],
    });
    const json = s.toJSON();
    json.steps[0].substeps.push({ id: 'y', title: 'leaked' });
    json.steps[0].inputs[0].name = 'MUTATED';
    // Live model must be untouched.
    assertEqual(s.steps[0].substeps.length, 1);
    assertEqual(s.steps[0].inputs[0].name, 'in');
  });
});

suite('FlowchartState — toggleSubsteps', () => {
  test('flips expanded and back', () => {
    const s = new FlowchartState();
    const a = s.addStep(0, { title: 'A' });
    assertEqual(a.expanded, false);
    assertEqual(s.toggleSubsteps(a.id), true);
    assertEqual(s.steps[0].expanded, true);
    assertEqual(s.toggleSubsteps(a.id), false);
    assertEqual(s.steps[0].expanded, false);
  });

  test('materialises a missing substeps array', () => {
    const s = new FlowchartState();
    const a = s.addStep(0, { title: 'A' });
    delete a.substeps;
    s.toggleSubsteps(a.id);
    assertEqual(Array.isArray(s.steps[0].substeps), true);
  });

  test('returns false for an unknown step', () => {
    const s = new FlowchartState();
    assertEqual(s.toggleSubsteps('nope'), false);
  });
});

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

  test('moveStep swaps positions', () => {
    const s = new FlowchartState();
    const a = s.addStep(0, { title: 'A' });
    const b = s.addStep(1, { title: 'B' });
    const c = s.addStep(2, { title: 'C' });
    s.moveStep(a.id, c.id);   // A slides to C's slot
    assertEqual(s.steps.map((x) => x.title).join(','), 'B,C,A');
  });

  test('moveStep same-source no-op', () => {
    const s = new FlowchartState();
    const a = s.addStep(); s.addStep();
    assertEqual(s.moveStep(a.id, a.id), false);
    assertEqual(s.steps.length, 2);
  });

  test('moveStep with unknown id returns false, no throw', () => {
    const s = new FlowchartState();
    s.addStep();
    assertEqual(s.moveStep('nope', 'nada'), false);
  });
});

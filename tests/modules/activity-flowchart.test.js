import { suite, test, assertEqual } from '../test-utils.js';
import { ActivityModel } from '../../js/modules/activity-flowchart/activity-flowchart-model.js';

suite('ActivityModel — normalizer', () => {
  test('defaults kind to "activity" for plain step', () => {
    const m = ActivityModel.fromJSON({ steps: [{ title: 'A' }] });
    assertEqual(m.steps[0].kind, 'activity');
    assertEqual(m.steps[0].decision, null);
  });

  test('preserves kind: "decision" with normalized targets', () => {
    const m = ActivityModel.fromJSON({ steps: [
      { title: 'D', kind: 'decision',
        decision: { label: '?', yesTarget: 'next', noTarget: 'end' } },
    ] });
    assertEqual(m.steps[0].kind, 'decision');
    assertEqual(m.steps[0].decision.yesTarget, 'next');
    assertEqual(m.steps[0].decision.noTarget, 'end');
    assertEqual(m.steps[0].decision.label, '?');
  });

  test('coerces invalid kind to "activity"', () => {
    const m = ActivityModel.fromJSON({ steps: [{ title: 'X', kind: 'nonsense' }] });
    assertEqual(m.steps[0].kind, 'activity');
  });

  test('forces decision=null when kind !== "decision"', () => {
    const m = ActivityModel.fromJSON({ steps: [
      { title: 'A', kind: 'activity', decision: { label: 'x', yesTarget: 'next', noTarget: 'end' } },
    ] });
    assertEqual(m.steps[0].decision, null);
  });

  test('coerces missing decision targets to "next"', () => {
    const m = ActivityModel.fromJSON({ steps: [
      { title: 'D', kind: 'decision', decision: { label: 'ok?' } },
    ] });
    assertEqual(m.steps[0].decision.yesTarget, 'next');
    assertEqual(m.steps[0].decision.noTarget, 'next');
  });

  test('roundtrip preserves decision fields', () => {
    const src = { steps: [
      { id: 's1', title: 'A' },
      { id: 's2', title: 'D', kind: 'decision',
        decision: { label: 'ok?', yesTarget: 'end', noTarget: 's1' } },
    ] };
    const m = ActivityModel.fromJSON(src);
    const out = m.toJSON();
    assertEqual(out.steps[1].decision.yesTarget, 'end');
    assertEqual(out.steps[1].decision.noTarget, 's1');
  });
});

suite('ActivityModel — decisions', () => {
  test('addDecision creates a decision step with default targets', () => {
    const m = new ActivityModel();
    const d = m.addDecision(0, { title: 'D?' });
    assertEqual(d.kind, 'decision');
    assertEqual(d.decision.yesTarget, 'next');
    assertEqual(d.decision.noTarget, 'next');
    assertEqual(m.steps[0].id, d.id);
  });

  test('setDecisionTarget updates yes/no targets', () => {
    const m = new ActivityModel();
    m.addStep(0, { title: 'A' });
    const d = m.addDecision(1, { title: 'D?' });
    assertEqual(m.setDecisionTarget(d.id, 'yes', 'end'), true);
    assertEqual(m.setDecisionTarget(d.id, 'no', m.steps[0].id), true);
    assertEqual(d.decision.yesTarget, 'end');
    assertEqual(d.decision.noTarget, m.steps[0].id);
  });

  test('setDecisionTarget rejects on non-decision step', () => {
    const m = new ActivityModel();
    const a = m.addStep(0, { title: 'A' });
    assertEqual(m.setDecisionTarget(a.id, 'yes', 'end'), false);
  });

  test('setDecisionTarget rejects unknown branch', () => {
    const m = new ActivityModel();
    const d = m.addDecision(0);
    assertEqual(m.setDecisionTarget(d.id, 'maybe', 'end'), false);
  });
});

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

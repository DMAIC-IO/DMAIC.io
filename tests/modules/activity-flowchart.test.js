import { suite, test, assertEqual } from '../test-utils.js';
import { ActivityModel } from '../../js/modules/activity-flowchart/activity-flowchart-model.js';
import { activityFlowchartData } from '../../js/modules/activity-flowchart/activity-flowchart.js';
import { __resetRegistryForTests, appendFromInstance }
  from '../../js/core/flowchart/flowchart-import.js';

// Re-import the model to trigger the mapper registration side-effect.
// (dynamic import ensures the registry is populated after the reset.)
async function loadModelWithMappers() {
  __resetRegistryForTests();
  const url = '../../js/modules/activity-flowchart/activity-flowchart-model.js?bust=' + Math.random();
  return import(url);
}

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

suite('ActivityModel — import mappers', () => {
  test('SIPOC → Activity: process names become activity steps', async () => {
    const { ActivityModel } = await loadModelWithMappers();
    const target = new ActivityModel();
    const sm = {
      listInstances: (id) => id === 'sipoc' ? [{ instanceId: 'i', title: 'S' }] : [],
      getModuleState: () => ({ columns: { process: ['Anfrage', 'Prüfung', 'Freigabe'] } }),
    };
    const appended = appendFromInstance({
      targetModuleId: 'activity-flowchart', sourceModuleId: 'sipoc',
      instanceId: 'i', stateManager: sm, targetState: target,
    });
    assertEqual(appended.length, 3);
    assertEqual(target.steps.map((s) => s.title).join(','), 'Anfrage,Prüfung,Freigabe');
    assertEqual(target.steps.every((s) => s.kind === 'activity'), true);
  });

  test('PM → Activity: steps come across as kind:"activity"', async () => {
    const { ActivityModel } = await loadModelWithMappers();
    const target = new ActivityModel();
    const sm = {
      listInstances: (id) => id === 'process-map' ? [{ instanceId: 'i', title: 'P' }] : [],
      getModuleState: () => ({ steps: [
        { id: 's1', title: 'X', valueType: 'va' },
        { id: 's2', title: 'Y', valueType: 'nva' },
      ] }),
    };
    const appended = appendFromInstance({
      targetModuleId: 'activity-flowchart', sourceModuleId: 'process-map',
      instanceId: 'i', stateManager: sm, targetState: target,
    });
    assertEqual(appended.length, 2);
    assertEqual(target.steps.every((s) => s.kind === 'activity'), true);
    // PM-only fields must NOT survive into Activity (mapper strips them).
    assertEqual(target.steps[0].valueType, undefined);
  });
});

suite('activityFlowchartData — connectorClass', () => {
  // connectorClass merges two class fragments because Alpine CSP allows
  // only one plain method call per :class binding (.claude/alpine.md): the
  // diamond offset (from isDecision) and the gap classes from
  // chainViewMixin's gapClass(). Calling the real, exported data-fn (rather
  // than reimplementing the merge here) means a broken merge — e.g.
  // dropping the gapClass(idx) half — fails this test.
  function ctx(steps) {
    const c = activityFlowchartData(null, (k) => k);
    c.model = { steps };
    return c;
  }
  const dragEvt = () => ({ dataTransfer: { setData() {}, effectAllowed: '' }, target: null });
  const activity = { kind: 'activity' };
  const decision = { kind: 'decision' };

  test('idle, non-diamond neighbour → no classes', () => {
    const c = ctx([activity, activity, activity]);
    assertEqual(c.connectorClass(1), '');
  });

  test('idle, touching a diamond → diamond class only', () => {
    const c = ctx([activity, decision, activity]);
    assertEqual(c.connectorClass(1), 'af__connector--diamond');
  });

  test('dragging, non-diamond neighbour → gap class only', () => {
    const c = ctx([activity, activity, activity]);
    c.stepDragStart('s1', dragEvt());
    assertEqual(c.connectorClass(1), 'fc-connector--drop');
  });

  test('dragging, touching a diamond → both classes present', () => {
    const c = ctx([activity, decision, activity]);
    c.stepDragStart('s1', dragEvt());
    assertEqual(c.connectorClass(1), 'af__connector--diamond fc-connector--drop');
  });
});

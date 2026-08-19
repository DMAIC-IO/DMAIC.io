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

  test('preserves kind: "decision" with a normalized no-target', () => {
    const m = ActivityModel.fromJSON({ steps: [
      { title: 'D', kind: 'decision', decision: { label: '?', noTarget: 'end' } },
    ] });
    assertEqual(m.steps[0].kind, 'decision');
    assertEqual(m.steps[0].decision.noTarget, 'end');
    assertEqual(m.steps[0].decision.label, '?');
  });

  test('drops a legacy yesTarget — yes is the flow on to the next step', () => {
    // Projects saved while the yes branch still had its own target must keep
    // loading; the branch is gone, so the field is dropped rather than kept
    // as dead state.
    const m = ActivityModel.fromJSON({ steps: [
      { title: 'D', kind: 'decision',
        decision: { label: '?', yesTarget: 'end', noTarget: 'next' } },
    ] });
    assertEqual('yesTarget' in m.steps[0].decision, false);
    assertEqual(m.steps[0].decision.noTarget, 'next');
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

  test('coerces a missing no-target to "next"', () => {
    const m = ActivityModel.fromJSON({ steps: [
      { title: 'D', kind: 'decision', decision: { label: 'ok?' } },
    ] });
    assertEqual(m.steps[0].decision.noTarget, 'next');
  });

  test('roundtrip preserves the decision fields that remain', () => {
    const src = { steps: [
      { id: 's1', title: 'A' },
      { id: 's2', title: 'D', kind: 'decision',
        decision: { label: 'ok?', yesTarget: 'end', noTarget: 's1' } },
    ] };
    const m = ActivityModel.fromJSON(src);
    const out = m.toJSON();
    assertEqual(out.steps[1].decision.label, 'ok?');
    assertEqual(out.steps[1].decision.noTarget, 's1');
    assertEqual('yesTarget' in out.steps[1].decision, false);
  });

  test('defaults branchId to "main"', () => {
    const m = ActivityModel.fromJSON({ steps: [{ title: 'A' }] });
    assertEqual(m.steps[0].branchId, 'main');
  });

  test('keeps a branchId whose decision stands earlier in the chain', () => {
    const m = ActivityModel.fromJSON({ steps: [
      { id: 'd1', title: 'D', kind: 'decision', decision: { label: '?' } },
      { id: 's2', title: 'Umweg', branchId: 'no:d1' },
    ] });
    assertEqual(m.steps[1].branchId, 'no:d1');
  });

  test('drops a branchId whose decision does not exist', () => {
    const m = ActivityModel.fromJSON({ steps: [
      { id: 's1', title: 'A', branchId: 'no:ghost' },
    ] });
    assertEqual(m.steps[0].branchId, 'main');
  });

  test('drops a branchId whose decision stands LATER in the chain', () => {
    // Sonst wäre der Umweg vor seiner Abzweigung — die Spaltenordnung ist
    // zugleich die Kettenordnung, also ist das strukturell unmöglich.
    const m = ActivityModel.fromJSON({ steps: [
      { id: 's1', title: 'Umweg', branchId: 'no:d1' },
      { id: 'd1', title: 'D', kind: 'decision', decision: { label: '?' } },
    ] });
    assertEqual(m.steps[0].branchId, 'main');
  });

  test('drops a branchId that points at a non-decision step', () => {
    const m = ActivityModel.fromJSON({ steps: [
      { id: 's1', title: 'A' },
      { id: 's2', title: 'B', branchId: 'no:s1' },
    ] });
    assertEqual(m.steps[1].branchId, 'main');
  });

  test('a decision may itself live in another decision\'s branch', () => {
    const m = ActivityModel.fromJSON({ steps: [
      { id: 'd1', title: 'D1', kind: 'decision', decision: { label: '?' } },
      { id: 'd2', title: 'D2', kind: 'decision', decision: { label: '?' }, branchId: 'no:d1' },
      { id: 's3', title: 'tief', branchId: 'no:d2' },
    ] });
    assertEqual(m.steps[1].branchId, 'no:d1');
    assertEqual(m.steps[2].branchId, 'no:d2');
  });
});

suite('ActivityModel — decisions', () => {
  test('addDecision creates a decision step whose no-branch flows on', () => {
    const m = new ActivityModel();
    const d = m.addDecision(0, { title: 'D?' });
    assertEqual(d.kind, 'decision');
    assertEqual(d.decision.noTarget, 'next');
    assertEqual('yesTarget' in d.decision, false);
    assertEqual(m.steps[0].id, d.id);
  });

  test('setDecisionTarget updates the no-target', () => {
    const m = new ActivityModel();
    m.addStep(0, { title: 'A' });
    const d = m.addDecision(1, { title: 'D?' });
    assertEqual(m.setDecisionTarget(d.id, 'end'), true);
    assertEqual(d.decision.noTarget, 'end');
    assertEqual(m.setDecisionTarget(d.id, m.steps[0].id), true);
    assertEqual(d.decision.noTarget, m.steps[0].id);
  });

  test('setDecisionTarget rejects on non-decision step', () => {
    const m = new ActivityModel();
    const a = m.addStep(0, { title: 'A' });
    assertEqual(m.setDecisionTarget(a.id, 'end'), false);
  });

  test('setDecisionTarget coerces an empty target to "next"', () => {
    const m = new ActivityModel();
    const d = m.addDecision(0);
    assertEqual(m.setDecisionTarget(d.id, ''), true);
    assertEqual(d.decision.noTarget, 'next');
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

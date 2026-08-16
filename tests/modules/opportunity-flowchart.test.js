import { suite, test, assertEqual } from '../test-utils.js';
import { OpportunityModel } from '../../js/modules/opportunity-flowchart/opportunity-flowchart-model.js';
import { __resetRegistryForTests, appendFromInstance }
  from '../../js/core/flowchart/flowchart-import.js';

// Re-import the model to trigger the mapper registration side-effect.
// (dynamic import ensures the registry is populated after the reset.)
async function loadModelWithMappers() {
  __resetRegistryForTests();
  const url = '../../js/modules/opportunity-flowchart/opportunity-flowchart-model.js?bust=' + Math.random();
  return import(url);
}

suite('OpportunityModel — normalizer', () => {
  test('defaults side to "va" when unset', () => {
    const m = OpportunityModel.fromJSON({ steps: [{ title: 'A' }] });
    assertEqual(m.steps[0].side, 'va');
  });

  test('preserves valid side values verbatim', () => {
    const m = OpportunityModel.fromJSON({ steps: [
      { title: 'A', side: 'va' }, { title: 'B', side: 'nva' },
    ] });
    assertEqual(m.steps[0].side, 'va');
    assertEqual(m.steps[1].side, 'nva');
  });

  test('coerces invalid side to "va"', () => {
    const m = OpportunityModel.fromJSON({ steps: [{ title: 'X', side: 'bnva' }] });
    assertEqual(m.steps[0].side, 'va');
  });

  test('roundtrip preserves side', () => {
    const m = OpportunityModel.fromJSON({ steps: [
      { id: 's1', title: 'A', side: 'nva' },
    ] });
    assertEqual(m.toJSON().steps[0].side, 'nva');
  });
});

suite('OpportunityModel — setSide', () => {
  test('flips a step to nva and back', () => {
    const m = new OpportunityModel();
    const a = m.addStep(0, { title: 'A' });   // default va
    assertEqual(a.side, 'va');
    assertEqual(m.setSide(a.id, 'nva'), true);
    assertEqual(m.steps[0].side, 'nva');
    assertEqual(m.setSide(a.id, 'va'), true);
    assertEqual(m.steps[0].side, 'va');
  });

  test('setSide rejects invalid side', () => {
    const m = new OpportunityModel();
    const a = m.addStep(0);
    assertEqual(m.setSide(a.id, 'bnva'), false);
    assertEqual(m.steps[0].side, 'va');
  });

  test('setSide with unknown id returns false', () => {
    const m = new OpportunityModel();
    assertEqual(m.setSide('nope', 'nva'), false);
  });

  test('insertStep keeps the requested side and sequence position', () => {
    const m = new OpportunityModel();
    m.addStep(0, { title: 'A' });
    m.addStep(1, { title: 'C' });
    const b = m.insertStep(1, { title: 'B', side: 'nva' });
    assertEqual(m.steps.map((s) => s.title).join(','), 'A,B,C');
    assertEqual(b.side, 'nva');
  });
});

suite('OpportunityModel — import mappers', () => {
  test('PM → Opportunity: va→va, nva→nva, bnva→nva, unset→va', async () => {
    const { OpportunityModel } = await loadModelWithMappers();
    const target = new OpportunityModel();
    const sm = {
      listInstances: (id) => id === 'process-map' ? [{ instanceId: 'i', title: 'PM' }] : [],
      getModuleState: () => ({ steps: [
        { id: 's1', title: 'A', valueType: 'va' },
        { id: 's2', title: 'B', valueType: 'nva' },
        { id: 's3', title: 'C', valueType: 'bnva' },
        { id: 's4', title: 'D', valueType: null },
      ] }),
    };
    const appended = appendFromInstance({
      targetModuleId: 'opportunity-flowchart', sourceModuleId: 'process-map',
      instanceId: 'i', stateManager: sm, targetState: target,
    });
    assertEqual(appended.length, 4);
    assertEqual(target.steps.map((s) => s.side).join(','), 'va,nva,nva,va');
    // PM-only fields must NOT survive into Opportunity (mapper strips them).
    assertEqual(target.steps[0].valueType, undefined);
  });

  test('SIPOC → Opportunity: all steps land in the VA column', async () => {
    const { OpportunityModel } = await loadModelWithMappers();
    const target = new OpportunityModel();
    const sm = {
      listInstances: (id) => id === 'sipoc' ? [{ instanceId: 'i', title: 'S' }] : [],
      getModuleState: () => ({ columns: { process: ['Anfrage', 'Prüfung'] } }),
    };
    appendFromInstance({
      targetModuleId: 'opportunity-flowchart', sourceModuleId: 'sipoc',
      instanceId: 'i', stateManager: sm, targetState: target,
    });
    assertEqual(target.steps.every((s) => s.side === 'va'), true);
    assertEqual(target.steps.map((s) => s.title).join(','), 'Anfrage,Prüfung');
  });
});

suite('OpportunityModel — loadExample guard', () => {
  test('hasContent() is inherited from the chain core', () => {
    const m = new OpportunityModel();
    assertEqual(typeof m.hasContent, 'function');
    assertEqual(m.hasContent(), false);
    m.addStep(0, { title: 'A' });
    assertEqual(m.hasContent(), true);
  });
});

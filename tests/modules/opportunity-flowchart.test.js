import { suite, test, assertEqual } from '../test-utils.js';
import { OpportunityModel } from '../../js/modules/opportunity-flowchart/opportunity-flowchart-model.js';

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

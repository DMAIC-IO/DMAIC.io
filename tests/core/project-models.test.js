/**
 * Tests for js/core/project-models.js — `adoptProjectModels` moves the legacy
 * project keys `models` / `optimizations` / `experiments` into the owner
 * instances.
 */

import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { adoptProjectModels } from '../../js/core/project-models.js';

const phaseFor = (moduleId) => (moduleId === 'regression' || moduleId === 'glm-regression' ? 'analyze' : 'improve');

function model(id, extra = {}) {
  return {
    id, name: `Modell ${id}`, createdFromInstanceId: `inst-${id}`,
    termSet: ['1', 'X1'], coef: [1, 2], sigma2: 0.1, df: 5,
    dataSnapshot: { X: [[1, 0], [1, 1]], y: [1, 3] }, dataHash: 'abcd0123',
    ...extra,
  };
}

/** A project with regression A (owns m-a), glm B (owns m-b), one optimizer. */
function project(over = {}) {
  return {
    phases: {
      analyze: [
        { instanceId: 'inst-m-a', moduleId: 'regression', order: 0, state: {} },
        { instanceId: 'inst-m-b', moduleId: 'glm-regression', order: 1, state: {} },
      ],
      improve: [
        { instanceId: 'ro-1', moduleId: 'response-optimization', order: 0, state: {} },
      ],
    },
    moduleStates: {
      'inst-m-a': { savedModelId: 'm-a', savedModelName: 'Modell m-a', regType: 'polynomial' },
      'inst-m-b': { savedModelId: 'm-b', savedModelName: 'Modell m-b', method: 'binomial' },
      'ro-1': { specs: { 'm-a': { selected: true, kind: 'max' } }, optId: 'o1' },
    },
    models: {
      'm-a': model('m-a'),
      'm-b': model('m-b', { family: 'binomial', terms: [] }),
    },
    optimizations: {
      o1: { name: 'Opt', modelRefs: ['m-a'], result: { D: 0.8 }, desirability: [], constraints: [], factorOverrides: {} },
      o2: { name: 'unverwiesen', modelRefs: ['m-b'], result: { D: 0.1 } },
    },
    experiments: { e1: { id: 'e1' } },
    ...over,
  };
}

suite('adoptProjectModels — owners', () => {
  test('regression owner gets savedModel, the record unchanged', () => {
    const { doc, changed } = adoptProjectModels(project(), { phaseFor });
    assertDeepEqual(doc.moduleStates['inst-m-a'].savedModel, model('m-a'));
    assertEqual(doc.moduleStates['inst-m-a'].regType, 'polynomial');
    assertEqual(changed.includes('inst-m-a'), true);
  });

  test('glm owner gets its record (family survives)', () => {
    const { doc } = adoptProjectModels(project(), { phaseFor });
    assertEqual(doc.moduleStates['inst-m-b'].savedModel.family, 'binomial');
    assertEqual(doc.moduleStates['inst-m-b'].method, 'binomial');
  });

  test('owner already carrying savedModel or modelRecord is not touched', () => {
    const p = project();
    p.moduleStates['inst-m-a'] = { ...p.moduleStates['inst-m-a'], savedModel: model('m-a') };
    p.moduleStates['inst-m-b'] = { ...p.moduleStates['inst-m-b'], modelRecord: { coef: [1] } };
    const { doc, changed } = adoptProjectModels(p, { phaseFor });
    assertEqual(changed.includes('inst-m-a'), false);
    assertEqual(changed.includes('inst-m-b'), false);
    assertDeepEqual(doc.moduleStates['inst-m-b'].modelRecord, { coef: [1] });
    assertEqual('savedModel' in doc.moduleStates['inst-m-b'], false);
  });

  test('no new instance for a model with owner', () => {
    const { doc, phasesChanged } = adoptProjectModels(project(), { phaseFor });
    assertEqual(phasesChanged, false);
    assertEqual(doc.phases.analyze.length, 2);
  });
});

suite('adoptProjectModels — orphans', () => {
  test('owner deleted → new regression instance with the record id as instance id', () => {
    const p = project();
    p.models['m-c'] = model('m-c');
    const { doc, changed, phasesChanged } = adoptProjectModels(p, { phaseFor });
    assertEqual(phasesChanged, true);
    const entry = doc.phases.improve.find(e => e.instanceId === 'inst-m-c')
      || doc.phases.analyze.find(e => e.instanceId === 'inst-m-c');
    assertDeepEqual(entry, { instanceId: 'inst-m-c', moduleId: 'regression', order: 2, state: {}, customName: 'Modell m-c' });
    assertDeepEqual(doc.moduleStates['inst-m-c'], { savedModelId: 'm-c', savedModelName: 'Modell m-c', savedModel: model('m-c') });
    assertEqual(changed.includes('inst-m-c'), true);
  });

  test('owner saved another model since → orphan with id reg-<model id>', () => {
    const p = project();
    p.models['m-old'] = model('m-old', { createdFromInstanceId: 'inst-m-a' });
    const { doc } = adoptProjectModels(p, { phaseFor });
    const entry = doc.phases.analyze.find(e => e.instanceId === 'reg-m-old');
    assertEqual(entry.moduleId, 'regression');
    assertEqual(doc.moduleStates['reg-m-old'].savedModelId, 'm-old');
    // the real owner keeps its own model
    assertEqual(doc.moduleStates['inst-m-a'].savedModel.id, 'm-a');
  });

  test('instance id taken by another module → reg-<model id>', () => {
    const p = project();
    p.phases.analyze.push({ instanceId: 'inst-m-c', moduleId: 'histogram', order: 2, state: {} });
    p.models['m-c'] = model('m-c');
    const { doc } = adoptProjectModels(p, { phaseFor });
    assertEqual(doc.phases.analyze.some(e => e.instanceId === 'reg-m-c'), true);
    assertEqual(doc.moduleStates['inst-m-c'], undefined);
  });

  test('glm orphan via family', () => {
    const p = project();
    p.models['m-g'] = model('m-g', { family: 'poisson' });
    const { doc } = adoptProjectModels(p, { phaseFor });
    const entry = doc.phases.analyze.find(e => e.instanceId === 'inst-m-g');
    assertEqual(entry.moduleId, 'glm-regression');
  });

  test('phase from the optimizer whose specs name the model', () => {
    const p = project();
    p.models['m-c'] = model('m-c');
    p.moduleStates['ro-1'].specs['m-c'] = { selected: true };
    const { doc } = adoptProjectModels(p, { phaseFor });
    assertEqual(doc.phases.improve.some(e => e.instanceId === 'inst-m-c'), true);
    assertEqual(doc.phases.analyze.some(e => e.instanceId === 'inst-m-c'), false);
  });

  test('phase from phaseFor when no optimizer names the model', () => {
    const p = project();
    p.models['m-c'] = model('m-c');
    const { doc } = adoptProjectModels(p, { phaseFor: () => 'improve' });
    assertEqual(doc.phases.improve.some(e => e.instanceId === 'inst-m-c'), true);
  });

  test('phaseFor naming a missing phase creates the list', () => {
    const p = project();
    p.models['m-c'] = model('m-c');
    const { doc } = adoptProjectModels(p, { phaseFor: () => 'control' });
    assertDeepEqual(doc.phases.control.map(e => e.instanceId), ['inst-m-c']);
  });

  test('model without name → no customName, savedModelName null', () => {
    const p = project();
    p.models['m-c'] = model('m-c', { name: undefined });
    const { doc } = adoptProjectModels(p, { phaseFor });
    const entry = doc.phases.analyze.find(e => e.instanceId === 'inst-m-c');
    assertEqual('customName' in entry, false);
    assertEqual(doc.moduleStates['inst-m-c'].savedModelName, null);
  });

  test('two runs on the same legacy document give the same ids', () => {
    const p = project();
    p.models['m-c'] = model('m-c');
    p.models['m-old'] = model('m-old', { createdFromInstanceId: 'inst-m-a' });
    const a = adoptProjectModels(p, { phaseFor });
    const b = adoptProjectModels(p, { phaseFor });
    assertDeepEqual(a.doc, b.doc);
    assertDeepEqual(a.changed, b.changed);
  });

  test('models as an array (example data) and records without id', () => {
    const p = project({ models: [model('m-a'), { name: 'ohne id' }] });
    const { doc, phasesChanged } = adoptProjectModels(p, { phaseFor });
    assertEqual(phasesChanged, false);
    assertEqual(doc.moduleStates['inst-m-a'].savedModel.id, 'm-a');
  });
});

suite('adoptProjectModels — optimizations', () => {
  test('referenced optimization → optimization { modelRefs, result }, dead fields dropped', () => {
    const { doc, changed } = adoptProjectModels(project(), { phaseFor });
    assertDeepEqual(doc.moduleStates['ro-1'].optimization, { modelRefs: ['m-a'], result: { D: 0.8 } });
    assertEqual(doc.moduleStates['ro-1'].optId, 'o1'); // the module migration drops optId
    assertEqual(changed.includes('ro-1'), true);
  });

  test('unreferenced optimization vanishes with the key', () => {
    const { doc } = adoptProjectModels(project(), { phaseFor });
    assertEqual(JSON.stringify(doc).includes('unverwiesen'), false);
  });

  test('optId pointing nowhere and optimizer with optimization already set stay untouched', () => {
    const p = project();
    p.moduleStates['ro-1'] = { ...p.moduleStates['ro-1'], optId: 'nope' };
    let r = adoptProjectModels(p, { phaseFor });
    assertEqual(r.changed.includes('ro-1'), false);
    assertEqual('optimization' in r.doc.moduleStates['ro-1'], false);
    p.moduleStates['ro-1'] = { optId: 'o1', optimization: { modelRefs: [], result: null } };
    r = adoptProjectModels(p, { phaseFor });
    assertEqual(r.changed.includes('ro-1'), false);
  });
});

suite('adoptProjectModels — keys, purity, idempotence', () => {
  test('models, optimizations, experiments are removed', () => {
    const { doc } = adoptProjectModels(project(), { phaseFor });
    assertEqual('models' in doc, false);
    assertEqual('optimizations' in doc, false);
    assertEqual('experiments' in doc, false);
  });

  test('only experiments present → key dropped, nothing else changes', () => {
    const p = { phases: { analyze: [] }, moduleStates: { a: { x: 1 } }, experiments: { e: {} } };
    const { doc, changed, phasesChanged } = adoptProjectModels(p, { phaseFor });
    assertEqual('experiments' in doc, false);
    assertDeepEqual(doc.moduleStates, { a: { x: 1 } });
    assertDeepEqual(changed, []);
    assertEqual(phasesChanged, false);
  });

  test('document without the keys comes back unchanged (same object)', () => {
    const p = { phases: { analyze: [] }, moduleStates: {}, chartEdits: {} };
    const r = adoptProjectModels(p, { phaseFor });
    assertEqual(r.doc, p);
    assertDeepEqual(r.changed, []);
    assertEqual(r.phasesChanged, false);
  });

  test('second run on the result: changed [] and identical document', () => {
    const p = project();
    p.models['m-c'] = model('m-c');
    const first = adoptProjectModels(p, { phaseFor });
    const second = adoptProjectModels(first.doc, { phaseFor });
    assertDeepEqual(second.changed, []);
    assertEqual(second.doc, first.doc);
  });

  test('second run with the legacy keys still present (aborted save) changes nothing', () => {
    const p = project();
    p.models['m-c'] = model('m-c');
    p.models['m-old'] = model('m-old', { createdFromInstanceId: 'inst-m-a' });
    const first = adoptProjectModels(p, { phaseFor });
    const again = adoptProjectModels({ ...first.doc, models: p.models, optimizations: p.optimizations }, { phaseFor });
    assertDeepEqual(again.changed, []);
    assertEqual(again.phasesChanged, false);
    assertDeepEqual(again.doc.phases, first.doc.phases);
  });

  test('input document is not mutated', () => {
    const p = project();
    p.models['m-c'] = model('m-c');
    const before = JSON.stringify(p);
    adoptProjectModels(p, { phaseFor });
    assertEqual(JSON.stringify(p), before);
  });
});

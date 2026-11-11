import { suite, test, assert, assertEqual, assertDeepEqual, assertThrows } from '../test-utils.js';
import { readModel, setFields } from '../../js/core/model.js';
import { evaluateDerived } from '../../js/core/derived.js';
import { State, VIEWS } from '../../js/modules/morphological-box/domain/model.js';
import { countConsistent, pairKey, COUNT_BUDGET } from '../../js/modules/morphological-box/domain/counting.js';
import { listMorphologicalConcepts } from '../../js/modules/morphological-box/domain/concepts.js';

/**
 * A box with three parameters (2 × 3 × 2 options) and fixed ids, so tests can
 * name options directly: p1 → a1 a2, p2 → b1 b2 b3, p3 → c1 c2.
 * @returns {State}
 */
function sampleBox() {
  return State.fromJSON({
    parameters: [
      { id: 'p1', name: 'Antrieb', options: [{ id: 'a1', label: 'Elektro' }, { id: 'a2', label: 'Benzin' }] },
      { id: 'p2', name: 'Fahrzeug', options: [{ id: 'b1', label: 'E-Bike' }, { id: 'b2', label: 'Roller' }, { id: 'b3', label: 'Auto' }] },
      { id: 'p3', name: 'Box', options: [{ id: 'c1', label: 'Thermo' }, { id: 'c2', label: 'Beheizt' }] },
    ],
  });
}

/**
 * The error `fn` throws, or a failure when it does not throw.
 * @param {() => any} fn
 * @returns {any}
 */
function errorOf(fn) {
  try { fn(); } catch (err) { return err; }
  throw new Error('Expected function to throw');
}

/** @param {State} m @returns {object} the stored state without `_schema` */
function stored(m) {
  const { _schema, ...rest } = m.toJSON();
  return rest;
}

suite('Morphological Box Model — parameters and options', () => {
  test('a fresh state is empty and has no content', () => {
    const s = new State();
    assertDeepEqual(s.parameters, []);
    assertDeepEqual(s.conflicts, []);
    assertDeepEqual(s.concepts, []);
    assertEqual(s.activeConceptId, '');
    assertEqual(s.view, 'box');
    assertEqual(s.hasContent(), false);
  });

  test('addParameter appends a parameter with one empty option and returns its id', () => {
    const s = new State();
    const id = s.addParameter({});
    assertEqual(s.parameters.length, 1);
    assertEqual(s.parameters[0].id, id);
    assertEqual(s.parameters[0].name, '');
    assertEqual(s.parameters[0].options.length, 1);
    assertEqual(s.parameters[0].options[0].label, '');
    assert(s.parameters[0].options[0].id !== '', 'the option gets an id');
    assertEqual(s.hasContent(), true);
  });

  test('setParameterName renames a parameter and rejects an unknown id', () => {
    const s = sampleBox();
    s.setParameterName({ parameterId: 'p2', name: 'Fahrzeug neu' });
    assertEqual(s.parameters[1].name, 'Fahrzeug neu');
    assertEqual(errorOf(() => s.setParameterName({ parameterId: 'zz', name: 'x' })).param, 'parameterId');
  });

  test('addOption appends an option to its parameter and returns its id', () => {
    const s = sampleBox();
    const id = s.addOption({ parameterId: 'p1' });
    assertDeepEqual(s.parameters[0].options.map(o => o.label), ['Elektro', 'Benzin', '']);
    assertEqual(s.parameters[0].options[2].id, id);
    assertEqual(errorOf(() => s.addOption({ parameterId: 'zz' })).param, 'parameterId');
  });

  test('setOptionLabel relabels an option and rejects an unknown id', () => {
    const s = sampleBox();
    s.setOptionLabel({ optionId: 'b2', label: 'Motorroller' });
    assertEqual(s.findOption('b2').label, 'Motorroller');
    assertEqual(errorOf(() => s.setOptionLabel({ optionId: 'zz', label: 'x' })).param, 'optionId');
  });

  test('parameterOf finds the parameter that holds an option', () => {
    const s = sampleBox();
    assertEqual(s.parameterOf('b2').id, 'p2');
    assertEqual(s.parameterOf('zz'), undefined);
  });

  test('optionIds lists every option id in box order', () => {
    assertDeepEqual(sampleBox().optionIds(), ['a1', 'a2', 'b1', 'b2', 'b3', 'c1', 'c2']);
  });

  test('removeOption drops its conflicts and the picks that point at it', () => {
    const s = sampleBox();
    s.setConflict({ optionA: 'a1', optionB: 'b1', incompatible: true });
    s.setConflict({ optionA: 'a2', optionB: 'c1', incompatible: true });
    const k = s.addConcept({});
    s.setConceptPick({ conceptId: k, parameterId: 'p1', optionId: 'a1' });
    s.setConceptPick({ conceptId: k, parameterId: 'p2', optionId: 'b1' });
    s.removeOption({ optionId: 'a1' });
    assertDeepEqual(s.parameters[0].options.map(o => o.id), ['a2']);
    assertDeepEqual(s.conflicts, [['a2', 'c1']]);
    assertDeepEqual(s.concepts[0].picks, { p2: 'b1' });
    assertEqual(errorOf(() => s.removeOption({ optionId: 'a1' })).param, 'optionId');
  });

  test('removeParameter drops its options, their conflicts and the picks', () => {
    const s = sampleBox();
    s.setConflict({ optionA: 'a1', optionB: 'b1', incompatible: true });
    s.setConflict({ optionA: 'a2', optionB: 'c1', incompatible: true });
    const k = s.addConcept({});
    s.setConceptPick({ conceptId: k, parameterId: 'p2', optionId: 'b1' });
    s.setConceptPick({ conceptId: k, parameterId: 'p3', optionId: 'c2' });
    s.removeParameter({ parameterId: 'p2' });
    assertDeepEqual(s.parameters.map(p => p.id), ['p1', 'p3']);
    assertDeepEqual(s.conflicts, [['a2', 'c1']]);
    assertDeepEqual(s.concepts[0].picks, { p3: 'c2' });
    assertEqual(errorOf(() => s.removeParameter({ parameterId: 'p2' })).param, 'parameterId');
  });
});

suite('Morphological Box Model — conflicts', () => {
  test('setConflict stores the pair once, sorted, and isConflict reads it both ways', () => {
    const s = sampleBox();
    s.setConflict({ optionA: 'b1', optionB: 'a1', incompatible: true });
    s.setConflict({ optionA: 'a1', optionB: 'b1', incompatible: true });
    assertDeepEqual(s.conflicts, [['a1', 'b1']]);
    assertEqual(s.isConflict('a1', 'b1'), true);
    assertEqual(s.isConflict('b1', 'a1'), true);
    assertEqual(s.isConflict('a1', 'b2'), false);
  });

  test('setConflict(false) removes the pair', () => {
    const s = sampleBox();
    s.setConflict({ optionA: 'a1', optionB: 'b1', incompatible: true });
    s.setConflict({ optionA: 'b1', optionB: 'a1', incompatible: false });
    assertDeepEqual(s.conflicts, []);
  });

  test('setConflict refuses two options of the same parameter', () => {
    const s = sampleBox();
    const err = errorOf(() => s.setConflict({ optionA: 'a1', optionB: 'a2', incompatible: true }));
    assertEqual(err.param, 'optionB');
    assertDeepEqual(s.conflicts, []);
  });

  test('setConflict refuses an unknown option', () => {
    const s = sampleBox();
    assertEqual(errorOf(() => s.setConflict({ optionA: 'zz', optionB: 'a2', incompatible: true })).param, 'optionA');
    assertEqual(errorOf(() => s.setConflict({ optionA: 'a1', optionB: 'zz', incompatible: true })).param, 'optionB');
  });
});

suite('Morphological Box Model — counting', () => {
  test('combinationCount is the product of the option counts', () => {
    assertEqual(sampleBox().combinationCount(), 12);
  });

  test('combinationCount skips parameters without options and is 0 for an empty box', () => {
    const s = sampleBox();
    setFields(s, { parameters: [...s.parameters, { id: 'p4', name: 'leer', options: [] }] });
    assertEqual(s.combinationCount(), 12);
    assertEqual(new State().combinationCount(), 0);
  });

  test('without conflicts every combination is consistent', () => {
    assertDeepEqual(sampleBox().consistentCount(), { count: 12, exact: true });
  });

  test('one conflict removes the combinations that contain the pair', () => {
    const s = sampleBox();
    s.setConflict({ optionA: 'a2', optionB: 'b1', incompatible: true }); // Benzin + E-Bike: 1 × 1 × 2 = 2 combinations
    assertDeepEqual(s.consistentCount(), { count: 10, exact: true });
  });

  test('overlapping conflicts are not subtracted twice', () => {
    const s = sampleBox();
    s.setConflict({ optionA: 'a2', optionB: 'b1', incompatible: true }); // a2·b1·* = 2
    s.setConflict({ optionA: 'b1', optionB: 'c2', incompatible: true }); // *·b1·c2 = 2, overlap a2·b1·c2 = 1
    assertDeepEqual(s.consistentCount(), { count: 9, exact: true });
  });

  test('countConsistent stops at the work budget and reports a lower bound', () => {
    const options = n => Array.from({ length: n }, (_, i) => ({ id: `o${i}` }));
    const parameters = Array.from({ length: 6 }, (_, p) => ({
      id: `p${p}`, options: options(10).map(o => ({ id: `${p}-${o.id}` })),
    }));
    // One conflict, so the count cannot take the product shortcut.
    const result = countConsistent(parameters, new Set(['0-o0|1-o0']), 1000);
    assertEqual(result.exact, false);
    assertEqual(result.count > 0 && result.count < 1e6, true);
  });

  test('pairKey is the same both ways and the budget is unchanged', () => {
    assertEqual(pairKey('b', 'a'), 'a|b');
    assertEqual(pairKey('a', 'b'), 'a|b');
    assertEqual(COUNT_BUDGET, 200000);
  });
});

suite('Morphological Box Model — concepts', () => {
  test('addConcept appends a concept, makes it active and returns its id', () => {
    const s = sampleBox();
    const id = s.addConcept({});
    assertEqual(s.concepts.length, 1);
    assertEqual(s.concepts[0].id, id);
    assertEqual(s.concepts[0].name, '');
    assertEqual(s.activeConceptId, id);
  });

  test('setConceptName renames a concept and rejects an unknown id', () => {
    const s = sampleBox();
    const k = s.addConcept({});
    s.setConceptName({ conceptId: k, name: 'Schnell' });
    assertEqual(s.concepts[0].name, 'Schnell');
    assertEqual(errorOf(() => s.setConceptName({ conceptId: 'zz', name: 'x' })).param, 'conceptId');
  });

  test('setConceptPick sets one option per parameter and "" clears it', () => {
    const s = sampleBox();
    const k = s.addConcept({});
    s.setConceptPick({ conceptId: k, parameterId: 'p1', optionId: 'a1' });
    s.setConceptPick({ conceptId: k, parameterId: 'p1', optionId: 'a2' });
    assertDeepEqual(s.concepts[0].picks, { p1: 'a2' });
    s.setConceptPick({ conceptId: k, parameterId: 'p1', optionId: '' });
    assertDeepEqual(s.concepts[0].picks, {});
  });

  test('setConceptPick refuses an option of another parameter', () => {
    const s = sampleBox();
    const k = s.addConcept({});
    const err = errorOf(() => s.setConceptPick({ conceptId: k, parameterId: 'p1', optionId: 'b1' }));
    assertEqual(err.param, 'optionId');
    assertDeepEqual(s.concepts[0].picks, {});
  });

  test('conceptConflicts lists the incompatible pairs inside a concept', () => {
    const s = sampleBox();
    s.setConflict({ optionA: 'a2', optionB: 'b1', incompatible: true });
    s.setConflict({ optionA: 'b1', optionB: 'c2', incompatible: true });
    const k = s.addConcept({});
    s.setConceptPick({ conceptId: k, parameterId: 'p1', optionId: 'a2' });
    s.setConceptPick({ conceptId: k, parameterId: 'p2', optionId: 'b1' });
    s.setConceptPick({ conceptId: k, parameterId: 'p3', optionId: 'c1' });
    assertDeepEqual(s.conceptConflicts(k), [['a2', 'b1']]);
  });

  test('isConceptComplete needs a pick in every parameter that has options', () => {
    const s = sampleBox();
    const k = s.addConcept({});
    s.setConceptPick({ conceptId: k, parameterId: 'p1', optionId: 'a1' });
    s.setConceptPick({ conceptId: k, parameterId: 'p2', optionId: 'b1' });
    assertEqual(s.isConceptComplete(k), false);
    s.setConceptPick({ conceptId: k, parameterId: 'p3', optionId: 'c1' });
    assertEqual(s.isConceptComplete(k), true);
  });

  test('removeConcept moves the active concept to the first remaining one', () => {
    const s = sampleBox();
    const k1 = s.addConcept({});
    const k2 = s.addConcept({});
    s.removeConcept({ conceptId: k2 });
    assertEqual(s.activeConceptId, k1);
    s.removeConcept({ conceptId: k1 });
    assertEqual(s.activeConceptId, '');
    assertEqual(errorOf(() => s.removeConcept({ conceptId: k1 })).param, 'conceptId');
  });
});

suite('Morphological Box Model — persistence', () => {
  test('toJSON / fromJSON round-trips the full state', () => {
    const s = sampleBox();
    s.setConflict({ optionA: 'a2', optionB: 'b1', incompatible: true });
    const k = s.addConcept({});
    s.setConceptPick({ conceptId: k, parameterId: 'p1', optionId: 'a1' });
    s.view = 'consistency';
    const copy = State.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
    assertDeepEqual(copy.toJSON(), s.toJSON());
  });

  test('the pizza example loads and saves unchanged apart from _schema', async () => {
    const url = new URL('../../js/modules/morphological-box/resources/examples/projects/morphological-box-pizza-lieferung.json', import.meta.url);
    const example = await (await fetch(url)).json();
    const m = State.fromJSON(example);
    assertDeepEqual(stored(m), example);
  });

  test('fromJSON drops conflicts and picks that point at unknown options', () => {
    const json = { _schema: { name: 'morphological-box', version: '1.0' },
      parameters: [{ id: 'p1', name: '', options: [{ id: 'a', label: '' }] },
        { id: 'p2', name: '', options: [{ id: 'b', label: '' }] }],
      conflicts: [['a', 'b'], ['a', 'gone']],
      concepts: [{ id: 'c1', name: '', picks: { p1: 'a', p2: 'gone' } }],
      activeConceptId: 'c1', view: 'box' };
    const m = readModel(State, json);
    assertDeepEqual(m.conflicts, [['a', 'b']]);
    assertDeepEqual(m.concepts[0].picks, { p1: 'a' });
  });

  test('VIEWS lists the two views', () => {
    assertDeepEqual(VIEWS, ['box', 'consistency']);
    assertDeepEqual([...State.schema.view.view.values], VIEWS);
  });
});

suite('Morphological Box Model — repair on load', () => {
  const base = () => ({
    parameters: [
      { id: 'p1', name: 'A', options: [{ id: 'a1', label: 'x' }, { id: 'a2', label: 'y' }] },
      { id: 'p2', name: 'B', options: [{ id: 'b1', label: 'z' }] },
    ],
    conflicts: [],
    concepts: [{ id: 'c1', name: 'K', picks: {} }],
    activeConceptId: 'c1',
    view: 'box',
  });

  test('uniqueIds: an empty option id gets a new id, the rest stays', () => {
    const json = base();
    json.parameters[1].options[0].id = '';
    const reports = [];
    const m = State.fromJSON(json, { repair: true, onRepair: (name) => reports.push(name) });
    const fresh = m.parameters[1].options[0];
    assert(fresh.id !== '', 'the empty id is replaced');
    assert(!['a1', 'a2'].includes(fresh.id), 'the new id is unique');
    assertEqual(fresh.label, 'z');
    assertDeepEqual(m.parameters[0], base().parameters[0]);
    assertDeepEqual(m.concepts, base().concepts);
    assert(reports.includes('parameters'), 'onRepair names the field');
  });

  test('uniqueIds: a later duplicate option drops with its conflicts and picks', () => {
    const json = base();
    json.parameters[1].options.push({ id: 'a1', label: 'dup' });
    json.conflicts = [['a1', 'b1'], ['a2', 'b1']];
    json.concepts[0].picks = { p1: 'a2', p2: 'a1' };
    const m = readModel(State, json);
    assertDeepEqual(m.parameters[1].options, [{ id: 'b1', label: 'z' }]);
    assertDeepEqual(m.parameters[0].options.map(o => o.id), ['a1', 'a2']);
    assertDeepEqual(m.conflicts, [['a2', 'b1']]);
    assertDeepEqual(m.concepts[0].picks, { p1: 'a2' });
  });

  test('uniqueIds: a later duplicate concept or parameter drops, an empty concept id is replaced', () => {
    const json = base();
    json.parameters.push({ id: 'p1', name: 'dup', options: [{ id: 'd1', label: '' }] });
    json.concepts.push({ id: 'c1', name: 'dup', picks: {} }, { id: '', name: 'leer', picks: {} });
    const m = readModel(State, json);
    assertDeepEqual(m.parameters.map(p => p.name), ['A', 'B']);
    assertDeepEqual(m.concepts.map(c => c.name), ['K', 'leer']);
    assert(m.concepts[1].id !== '' && m.concepts[1].id !== 'c1', 'the empty concept id is replaced');
  });

  test('validConflicts: unsorted pairs are sorted, duplicates and same-parameter pairs drop', () => {
    const json = base();
    json.conflicts = [['b1', 'a1'], ['a1', 'b1'], ['a1', 'a2'], ['a2', 'b1', 'a1'], ['a2', 'b1']];
    const m = readModel(State, json);
    assertDeepEqual(m.conflicts, [['a1', 'b1'], ['a2', 'b1']]);
  });

  test('validPicks: a pick of an option of another parameter drops', () => {
    const json = base();
    json.concepts[0].picks = { p1: 'b1', p2: 'b1' };
    const m = readModel(State, json);
    assertDeepEqual(m.concepts[0].picks, { p2: 'b1' });
  });

  test('activeConcept: an unknown id moves to the first concept, without concepts it is empty', () => {
    const json = base();
    json.activeConceptId = 'nope';
    assertEqual(State.fromJSON(json).activeConceptId, 'c1');
    const empty = base();
    empty.concepts = [];
    assertEqual(State.fromJSON(empty).activeConceptId, '');
    const blank = base();
    blank.activeConceptId = '';
    assertEqual(State.fromJSON(blank).activeConceptId, 'c1');
  });

  test('a broken reference fails the strict load', () => {
    const json = base();
    json.conflicts = [['a1', 'gone']];
    assertEqual(errorOf(() => State.fromJSON(json)).invariant, 'validConflicts');
  });
});

suite('Morphological Box Model — writes are checked, never repaired', () => {
  test('a pick on an option of another parameter written via a setter throws validPicks', () => {
    const s = sampleBox();
    const k = s.addConcept({});
    const err = errorOf(() => setFields(s, { concepts: [{ id: k, name: '', picks: { p1: 'b1' } }] }));
    assertEqual(err.invariant, 'validPicks');
    assertDeepEqual(s.concepts[0].picks, {});
  });

  test('a duplicate option id written via a setter throws uniqueIds', () => {
    const s = sampleBox();
    const params = JSON.parse(JSON.stringify(s.parameters));
    params[1].options[0].id = 'a1';
    assertEqual(errorOf(() => { s.parameters = params; }).invariant, 'uniqueIds');
    assertEqual(s.parameters[1].options[0].id, 'b1');
  });

  test('a conflict on an unknown option written via a setter throws validConflicts', () => {
    const s = sampleBox();
    assertEqual(errorOf(() => { s.conflicts = [['a1', 'zz']]; }).invariant, 'validConflicts');
    assertDeepEqual(s.conflicts, []);
  });

  test('an unknown active concept id throws activeConcept', () => {
    const s = sampleBox();
    s.addConcept({});
    assertEqual(errorOf(() => { s.activeConceptId = 'nope'; }).invariant, 'activeConcept');
  });
});

suite('Morphological Box — concept source for solution selection', () => {
  test('listMorphologicalConcepts lists the concepts of every box in phase order', () => {
    const box = sampleBox();
    box.setConflict({ optionA: 'a2', optionB: 'b1', incompatible: true });
    const k = box.addConcept({});
    box.setConceptName({ conceptId: k, name: 'Schnell' });
    box.setConceptPick({ conceptId: k, parameterId: 'p1', optionId: 'a2' });
    box.setConceptPick({ conceptId: k, parameterId: 'p2', optionId: 'b1' });
    const states = { i1: box.toJSON(), i2: { foo: 1 } };
    const sm = {
      get: (path) => ({
        phases: { define: [], improve: [{ instanceId: 'i2', moduleId: 'todo' }, { instanceId: 'i1', moduleId: 'morphological-box' }] },
        'phases.define': [],
        'phases.improve': [{ instanceId: 'i2', moduleId: 'todo' }, { instanceId: 'i1', moduleId: 'morphological-box' }],
      })[path],
      getModuleState: (id) => states[id],
    };
    assertDeepEqual(listMorphologicalConcepts(sm), [{
      instanceId: 'i1',
      conceptId: k,
      name: 'Schnell',
      picks: [
        { parameter: 'Antrieb', option: 'Benzin' },
        { parameter: 'Fahrzeug', option: 'E-Bike' },
      ],
      complete: false,
      conflictCount: 1,
    }]);
  });
});

suite('Morphological Box Model — derived', () => {
  test('leerer Kasten: alle Kennzahlen null beziehungsweise leer', () => {
    assertDeepEqual(evaluateDerived(new State(), {}), {
      optionIds: [], combinationCount: 0, consistentCount: 0, consistentExact: true, conceptChecks: [],
    });
  });

  test('Kasten mit Konflikt und Konzepten gleicht den lesenden Hilfen des Models', () => {
    const s = State.fromJSON({
      parameters: sampleBox().parameters,
      conflicts: [['a1', 'b3']],
      concepts: [
        { id: 'k1', name: 'Voll', picks: { p1: 'a1', p2: 'b3', p3: 'c1' } },
        { id: 'k2', name: 'Teil', picks: { p1: 'a2' } },
      ],
    });
    const d = evaluateDerived(s, {});
    assertDeepEqual(d.optionIds, ['a1', 'a2', 'b1', 'b2', 'b3', 'c1', 'c2']);
    assertEqual(d.combinationCount, 12);
    assertEqual(d.consistentCount, 10);
    assertEqual(d.consistentExact, true);
    assertDeepEqual(d.conceptChecks, [
      { id: 'k1', complete: true, conflicts: [['a1', 'b3']] },
      { id: 'k2', complete: false, conflicts: [] },
    ]);
  });
});

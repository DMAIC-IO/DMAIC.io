import { suite, test, assertEqual, assertDeepEqual, assertThrows } from '../test-utils.js';
import {
  State, VIEWS, countConsistent,
} from '../../js/modules/morphological-box/morphological-box-model.js';
import { listMorphologicalConcepts } from '../../js/modules/morphological-box/morphological-box-concepts.js';

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

  test('addParameter appends a named parameter with one empty option and returns its id', () => {
    const s = new State();
    const id = s.addParameter('Antrieb');
    assertEqual(s.parameters.length, 1);
    assertEqual(s.parameters[0].id, id);
    assertEqual(s.parameters[0].name, 'Antrieb');
    assertEqual(s.parameters[0].options.length, 1);
    assertEqual(s.parameters[0].options[0].label, '');
    assertEqual(s.hasContent(), true);
  });

  test('addOption appends an option to its parameter and returns its id', () => {
    const s = sampleBox();
    const id = s.addOption('p1', 'Hybrid');
    assertDeepEqual(s.parameters[0].options.map(o => o.label), ['Elektro', 'Benzin', 'Hybrid']);
    assertEqual(s.parameters[0].options[2].id, id);
  });

  test('parameterOf finds the parameter that holds an option', () => {
    const s = sampleBox();
    assertEqual(s.parameterOf('b2').id, 'p2');
    assertEqual(s.parameterOf('zz'), undefined);
  });

  test('removeOption drops its conflicts and the picks that point at it', () => {
    const s = sampleBox();
    s.setConflict('a1', 'b1', true);
    s.setConflict('a2', 'c1', true);
    const k = s.addConcept('K');
    s.setConceptPick(k, 'p1', 'a1');
    s.setConceptPick(k, 'p2', 'b1');
    s.removeOption('a1');
    assertDeepEqual(s.parameters[0].options.map(o => o.id), ['a2']);
    assertDeepEqual(s.conflicts, [['a2', 'c1']]);
    assertDeepEqual(s.concepts[0].picks, { p2: 'b1' });
  });

  test('removeParameter drops its options, their conflicts and the picks', () => {
    const s = sampleBox();
    s.setConflict('a1', 'b1', true);
    s.setConflict('a2', 'c1', true);
    const k = s.addConcept('K');
    s.setConceptPick(k, 'p2', 'b1');
    s.setConceptPick(k, 'p3', 'c2');
    s.removeParameter('p2');
    assertDeepEqual(s.parameters.map(p => p.id), ['p1', 'p3']);
    assertDeepEqual(s.conflicts, [['a2', 'c1']]);
    assertDeepEqual(s.concepts[0].picks, { p3: 'c2' });
  });
});

suite('Morphological Box Model — conflicts', () => {
  test('setConflict stores the pair once, sorted, and isConflict reads it both ways', () => {
    const s = sampleBox();
    s.setConflict('b1', 'a1', true);
    s.setConflict('a1', 'b1', true);
    assertDeepEqual(s.conflicts, [['a1', 'b1']]);
    assertEqual(s.isConflict('a1', 'b1'), true);
    assertEqual(s.isConflict('b1', 'a1'), true);
    assertEqual(s.isConflict('a1', 'b2'), false);
  });

  test('setConflict(false) removes the pair', () => {
    const s = sampleBox();
    s.setConflict('a1', 'b1', true);
    s.setConflict('b1', 'a1', false);
    assertDeepEqual(s.conflicts, []);
  });

  test('setConflict refuses two options of the same parameter', () => {
    const s = sampleBox();
    assertThrows(() => s.setConflict('a1', 'a2', true), /same parameter/);
  });
});

suite('Morphological Box Model — counting', () => {
  test('combinationCount is the product of the option counts', () => {
    assertEqual(sampleBox().combinationCount(), 12);
  });

  test('combinationCount skips parameters without options and is 0 for an empty box', () => {
    const s = sampleBox();
    s.parameters.push({ id: 'p4', name: 'leer', options: [] });
    assertEqual(s.combinationCount(), 12);
    assertEqual(new State().combinationCount(), 0);
  });

  test('without conflicts every combination is consistent', () => {
    assertDeepEqual(sampleBox().consistentCount(), { count: 12, exact: true });
  });

  test('one conflict removes the combinations that contain the pair', () => {
    const s = sampleBox();
    s.setConflict('a2', 'b1', true); // Benzin + E-Bike: 1 × 1 × 2 = 2 combinations
    assertDeepEqual(s.consistentCount(), { count: 10, exact: true });
  });

  test('overlapping conflicts are not subtracted twice', () => {
    const s = sampleBox();
    s.setConflict('a2', 'b1', true); // a2·b1·* = 2
    s.setConflict('b1', 'c2', true); // *·b1·c2 = 2, overlap a2·b1·c2 = 1
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
});

suite('Morphological Box Model — concepts', () => {
  test('addConcept appends a concept, makes it active and returns its id', () => {
    const s = sampleBox();
    const id = s.addConcept('Schnell');
    assertEqual(s.concepts.length, 1);
    assertEqual(s.concepts[0].name, 'Schnell');
    assertEqual(s.activeConceptId, id);
  });

  test('setConceptPick sets one option per parameter and "" clears it', () => {
    const s = sampleBox();
    const k = s.addConcept('K');
    s.setConceptPick(k, 'p1', 'a1');
    s.setConceptPick(k, 'p1', 'a2');
    assertDeepEqual(s.concepts[0].picks, { p1: 'a2' });
    s.setConceptPick(k, 'p1', '');
    assertDeepEqual(s.concepts[0].picks, {});
  });

  test('setConceptPick refuses an option of another parameter', () => {
    const s = sampleBox();
    const k = s.addConcept('K');
    assertThrows(() => s.setConceptPick(k, 'p1', 'b1'), /does not belong/);
  });

  test('conceptConflicts lists the incompatible pairs inside a concept', () => {
    const s = sampleBox();
    s.setConflict('a2', 'b1', true);
    s.setConflict('b1', 'c2', true);
    const k = s.addConcept('K');
    s.setConceptPick(k, 'p1', 'a2');
    s.setConceptPick(k, 'p2', 'b1');
    s.setConceptPick(k, 'p3', 'c1');
    assertDeepEqual(s.conceptConflicts(k), [['a2', 'b1']]);
  });

  test('isConceptComplete needs a pick in every parameter that has options', () => {
    const s = sampleBox();
    const k = s.addConcept('K');
    s.setConceptPick(k, 'p1', 'a1');
    s.setConceptPick(k, 'p2', 'b1');
    assertEqual(s.isConceptComplete(k), false);
    s.setConceptPick(k, 'p3', 'c1');
    assertEqual(s.isConceptComplete(k), true);
  });

  test('removeConcept moves the active concept to the first remaining one', () => {
    const s = sampleBox();
    const k1 = s.addConcept('K1');
    const k2 = s.addConcept('K2');
    s.removeConcept(k2);
    assertEqual(s.activeConceptId, k1);
    s.removeConcept(k1);
    assertEqual(s.activeConceptId, '');
  });
});

suite('Morphological Box Model — persistence', () => {
  test('toJSON / fromJSON round-trips the full state', () => {
    const s = sampleBox();
    s.setConflict('a2', 'b1', true);
    const k = s.addConcept('K');
    s.setConceptPick(k, 'p1', 'a1');
    s.view = 'consistency';
    const copy = State.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
    assertDeepEqual(copy.toJSON(), s.toJSON());
    assertEqual(copy.toJSON()._schema.name, 'morphological-box');
  });

  test('fromJSON drops conflicts and picks that point at unknown options', () => {
    const s = State.fromJSON({
      parameters: [{ id: 'p1', name: 'A', options: [{ id: 'a1', label: 'x' }] },
        { id: 'p2', name: 'B', options: [{ id: 'b1', label: 'y' }] }],
      conflicts: [['a1', 'b1'], ['a1', 'zz'], ['a1', 'a1']],
      concepts: [{ id: 'k', name: 'K', picks: { p1: 'a1', p2: 'zz', p9: 'b1' } }],
      activeConceptId: 'gone',
      view: 'weird',
    });
    assertDeepEqual(s.conflicts, [['a1', 'b1']]);
    assertDeepEqual(s.concepts[0].picks, { p1: 'a1' });
    assertEqual(s.activeConceptId, 'k');
    assertEqual(s.view, 'box');
  });

  test('VIEWS lists the two views', () => {
    assertDeepEqual(VIEWS, ['box', 'consistency']);
  });
});

suite('Morphological Box — concept source for solution selection', () => {
  test('listMorphologicalConcepts lists the concepts of every box in phase order', () => {
    const box = sampleBox();
    box.setConflict('a2', 'b1', true);
    const k = box.addConcept('Schnell');
    box.setConceptPick(k, 'p1', 'a2');
    box.setConceptPick(k, 'p2', 'b1');
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

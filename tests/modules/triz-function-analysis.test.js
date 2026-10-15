/**
 * D.Mike — TRIZ function analysis: model
 *
 * Persistence and repair, the single-target rule, delete cascade,
 * interactions, functions and the derived values (rank, open pairs,
 * disadvantages).
 */

import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import {
  State, KINDS, pairKey, orderedComponents,
} from '../../js/modules/triz-function-analysis/triz-function-analysis-model.js';

/** Toothbrush: target teeth, system bristles + handle, supersystem gums + paste. */
function fixture() {
  return State.fromJSON({
    components: [
      { id: 't', name: 'Zähne', kind: 'target', note: '' },
      { id: 'b', name: 'Borsten', kind: 'system', note: '' },
      { id: 'h', name: 'Griff', kind: 'system', note: '' },
      { id: 'g', name: 'Zahnfleisch', kind: 'supersystem', note: '' },
      { id: 'p', name: 'Zahnpasta', kind: 'supersystem', note: '' },
    ],
    interactions: [{ a: 'b', b: 't' }, { a: 'b', b: 'g' }, { a: 'b', b: 'h' }],
    functions: [
      { id: 'f1', carrier: 'b', verb: 'entfernt', object: 't', parameter: 'Belag', type: 'useful', level: 'insufficient', note: '' },
      { id: 'f2', carrier: 'b', verb: 'verletzt', object: 'g', parameter: '', type: 'harmful', level: null, note: '' },
      { id: 'f3', carrier: 'h', verb: 'hält', object: 'b', parameter: '', type: 'useful', level: 'adequate', note: '' },
    ],
    positions: { b: { x: 10, y: 20 } },
    activeTab: 'model',
  });
}

suite('triz-function-analysis — state', () => {
  test('a new state is empty', () => {
    const s = new State();
    assertDeepEqual([s.components, s.interactions, s.functions], [[], [], []]);
    assertDeepEqual(s.positions, {});
    assertEqual(s.activeTab, 'components');
    assertEqual(s.hasContent(), false);
    assertDeepEqual(KINDS, ['target', 'system', 'supersystem']);
  });

  test('toJSON / fromJSON round trip', () => {
    const json = JSON.parse(JSON.stringify(fixture().toJSON()));
    assertDeepEqual(State.fromJSON(json).toJSON(), json);
    assertEqual(json._schema.name, 'triz-function-analysis');
    assertEqual(fixture().hasContent(), true);
  });

  test('fromJSON repairs inconsistent data', () => {
    const s = State.fromJSON({
      components: [
        { id: 'x', name: 'X', kind: 'target' },
        { id: 'y', name: 'Y', kind: 'target' },
        { id: 'z', name: 7, kind: 'bogus' },
        { name: 'no id', kind: 'system' },
      ],
      interactions: [{ a: 'y', b: 'x' }, { a: 'x', b: 'y' }, { a: 'x', b: 'x' }, { a: 'x', b: 'gone' }],
      functions: [
        { id: 'f1', carrier: 'x', object: 'gone', type: 'harmful', level: 'excessive' },
        { id: 'f2', carrier: 'y', object: 'x', type: 'useful', level: 'huge' },
        { id: 'f3', carrier: 'y', object: 'x', type: 'weird' },
        { carrier: 'x', object: 'y' },
      ],
      positions: { x: { x: 5, y: 6 }, gone: { x: 1, y: 1 }, y: { x: 'a', y: 2 } },
      activeTab: 'nope',
    });
    assertDeepEqual(s.components.map((c) => [c.id, c.name, c.kind]),
      [['x', 'X', 'target'], ['y', 'Y', 'system'], ['z', '', 'system']]);
    assertDeepEqual(s.interactions, [{ a: 'x', b: 'y' }]);
    assertDeepEqual(s.functions.map((f) => [f.id, f.carrier, f.object, f.type, f.level]), [
      ['f1', 'x', '', 'harmful', null],
      ['f2', 'y', 'x', 'useful', 'adequate'],
      ['f3', 'y', 'x', 'useful', 'adequate'],
    ]);
    assertDeepEqual(s.positions, { x: { x: 5, y: 6 } });
    assertEqual(s.activeTab, 'components');
  });

  test('fromJSON of garbage yields an empty state', () => {
    assertEqual(State.fromJSON(null).components.length, 0);
    assertEqual(State.fromJSON('x').components.length, 0);
    assertEqual(State.fromJSON({ components: 'x' }).components.length, 0);
  });

  test('pairKey is order independent', () => {
    assertEqual(pairKey('b', 'a'), 'a|b');
    assertEqual(pairKey('a', 'b'), 'a|b');
  });
});

suite('triz-function-analysis — components', () => {
  test('addComponent creates a component with an id', () => {
    const s = new State();
    const { component, demoted } = s.addComponent('supersystem', 'Luft');
    assertTrue(typeof component.id === 'string' && component.id.length > 0);
    assertDeepEqual([component.name, component.kind, component.note], ['Luft', 'supersystem', '']);
    assertEqual(demoted, null);
  });

  test('a second target demotes the first one', () => {
    const s = new State();
    const first = s.addComponent('target', 'A').component;
    const { component, demoted } = s.addComponent('target', 'B');
    assertEqual(demoted, first);
    assertDeepEqual([first.kind, component.kind], ['system', 'target']);
  });

  test('setKind enforces exactly one target and ignores unknown kinds', () => {
    const s = fixture();
    assertEqual(s.setKind('h', 'target').id, 't');
    assertDeepEqual(s.components.filter((c) => c.kind === 'target').map((c) => c.id), ['h']);
    assertEqual(s.setKind('h', 'bogus'), null);
    assertEqual(s.component('h').kind, 'target');
    assertEqual(s.setKind('h', 'target'), null, 'already the target');
  });

  test('removeComponent cascades to interactions, functions and positions', () => {
    const s = fixture();
    assertEqual(s.impactOf('b'), 3);
    s.removeComponent('b');
    assertEqual(s.component('b'), null);
    assertDeepEqual(s.interactions, []);
    assertDeepEqual(s.functions, []);
    assertDeepEqual(s.positions, {});
  });

  test('orderedComponents: target, system, supersystem in entry order', () => {
    const s = fixture();
    s.addComponent('system', 'Kopf');
    assertDeepEqual(orderedComponents(s.components).map((c) => c.name),
      ['Zähne', 'Borsten', 'Griff', 'Kopf', 'Zahnfleisch', 'Zahnpasta']);
  });
});

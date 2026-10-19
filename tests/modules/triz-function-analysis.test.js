/**
 * D.Mike — TRIZ function analysis: model
 *
 * Persistence and repair, the single-target rule, delete cascade,
 * interactions, functions and the derived values (rank, open pairs,
 * disadvantages).
 */

import { suite, test, assertEqual, assertTrue, assertDeepEqual, assertClose } from '../test-utils.js';
import {
  State, KINDS, pairKey, orderedComponents, isComplete, rankOf, openPairs, disadvantages, functionPairs,
  TABS, componentValue, valueCostRows, functionRanks,
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
    labels: { f1: { x: 30, y: 40 } },
    activeTab: 'model',
    showRanks: true,
  });
}

suite('triz-function-analysis — state', () => {
  test('a new state is empty', () => {
    const s = new State();
    assertDeepEqual([s.components, s.interactions, s.functions], [[], [], []]);
    assertDeepEqual(s.positions, {});
    assertDeepEqual(s.labels, {});
    assertEqual(s.activeTab, 'components');
    assertEqual(s.showRanks, false);
    assertEqual(s.hasContent(), false);
    assertDeepEqual(KINDS, ['target', 'system', 'supersystem']);
  });

  test('toJSON / fromJSON round trip', () => {
    const json = JSON.parse(JSON.stringify(fixture().toJSON()));
    assertDeepEqual(State.fromJSON(json).toJSON(), json);
    assertEqual(json._schema.name, 'triz-function-analysis');
    assertEqual(json.showRanks, true);
    assertEqual(State.fromJSON({ showRanks: 'yes' }).showRanks, false, 'only true switches it on');
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
      labels: { f2: { x: 7, y: 8 }, gone: { x: 1, y: 1 }, f3: { x: 1, y: null } },
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
    assertDeepEqual(s.labels, { f2: { x: 7, y: 8 } });
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

  test('removeComponent cascades to interactions, functions, positions and labels', () => {
    const s = fixture();
    assertEqual(s.impactOf('b'), 3);
    s.removeComponent('b');
    assertEqual(s.component('b'), null);
    assertDeepEqual(s.interactions, []);
    assertDeepEqual(s.functions, []);
    assertDeepEqual(s.positions, {});
    assertDeepEqual(s.labels, {});
  });

  test('orderedComponents: target, system, supersystem in entry order', () => {
    const s = fixture();
    s.addComponent('system', 'Kopf');
    assertDeepEqual(orderedComponents(s.components).map((c) => c.name),
      ['Zähne', 'Borsten', 'Griff', 'Kopf', 'Zahnfleisch', 'Zahnpasta']);
  });
});

suite('triz-function-analysis — interactions', () => {
  test('toggleInteraction cycles an unused pair: empty → ticked → excluded → empty', () => {
    const s = fixture();
    assertEqual(s.pairState('t', 'g'), 'none');
    assertDeepEqual(s.toggleInteraction('t', 'g'), { ok: true });
    assertTrue(s.hasInteraction('g', 't'));
    assertEqual(s.pairState('g', 't'), 'ticked');
    assertDeepEqual(s.toggleInteraction('g', 't'), { ok: true });
    assertEqual(s.hasInteraction('t', 'g'), false);
    assertTrue(s.isExcluded('t', 'g'));
    assertEqual(s.pairState('t', 'g'), 'excluded');
    assertDeepEqual(s.toggleInteraction('t', 'g'), { ok: true });
    assertEqual(s.pairState('t', 'g'), 'none');
    assertDeepEqual(s.exclusions, []);
  });

  test('a pair used by functions cannot be unticked', () => {
    const s = fixture();
    assertDeepEqual(s.toggleInteraction('t', 'b'), { ok: false, usedBy: 1 });
    assertTrue(s.hasInteraction('b', 't'));
    assertEqual(s.isExcluded('b', 't'), false);
  });

  test('a function on an excluded pair ticks it again', () => {
    const s = fixture();
    s.toggleInteraction('t', 'g');
    s.toggleInteraction('t', 'g');
    s.addFunction('g', 't');
    assertEqual(s.pairState('t', 'g'), 'ticked');
    assertDeepEqual(s.exclusions, []);
  });

  test('exclusions survive a round trip and are repaired on load', () => {
    const s = State.fromJSON({
      components: [{ id: 'x', name: 'X', kind: 'target' }, { id: 'y', name: 'Y', kind: 'system' }, { id: 'z', name: 'Z', kind: 'system' }],
      interactions: [{ a: 'x', b: 'y' }],
      exclusions: [{ a: 'z', b: 'x' }, { a: 'x', b: 'z' }, { a: 'y', b: 'x' }, { a: 'z', b: 'z' }, { a: 'z', b: 'gone' }],
    });
    assertDeepEqual(s.exclusions, [{ a: 'x', b: 'z' }], 'sorted, deduplicated, ticked pairs win');
    assertDeepEqual(State.fromJSON(s.toJSON()).exclusions, [{ a: 'x', b: 'z' }]);
  });

  test('removeComponent drops its exclusions', () => {
    const s = fixture();
    s.toggleInteraction('t', 'p');
    s.toggleInteraction('t', 'p');
    s.removeComponent('p');
    assertDeepEqual(s.exclusions, []);
  });

  test('self pairs are refused', () => {
    assertDeepEqual(fixture().toggleInteraction('b', 'b'), { ok: false, usedBy: 0 });
  });
});

suite('triz-function-analysis — functions', () => {
  test('addFunction with both ends ticks its pair', () => {
    const s = fixture();
    const f = s.addFunction('p', 't');
    assertDeepEqual([f.carrier, f.object, f.type, f.level, f.verb], ['p', 't', 'useful', 'adequate', '']);
    assertTrue(s.hasInteraction('t', 'p'));
  });

  test('addFunction without both ends ticks nothing', () => {
    const s = fixture();
    const before = s.interactions.length;
    s.addFunction('p', '');
    s.addFunction();
    assertEqual(s.interactions.length, before);
    assertEqual(isComplete(s.functions[3]), false);
  });

  test('functionPairs groups both directions of a pair; drafts stay alone', () => {
    const s = fixture();
    s.addFunction('t', 'b');
    s.addFunction('b', '');
    const groups = functionPairs(s);
    assertDeepEqual(groups.map((g) => g.functions.length), [2, 1, 1, 1]);
    assertDeepEqual(groups.map((g) => g.complete), [true, true, true, false]);
    assertEqual(groups[0].key, pairKey('b', 't'));
    assertTrue(groups[3].key.startsWith('draft|'));
  });

  test('swapDirection exchanges carrier and object', () => {
    const s = fixture();
    s.swapDirection('f3');
    assertDeepEqual([s.fn('f3').carrier, s.fn('f3').object], ['b', 'h']);
  });

  test('setType resets the level; same type keeps it', () => {
    const s = fixture();
    s.setType('f1', 'useful');
    assertEqual(s.fn('f1').level, 'insufficient');
    s.setType('f1', 'harmful');
    assertEqual(s.fn('f1').level, null);
    s.setType('f1', 'useful');
    assertEqual(s.fn('f1').level, 'adequate');
    s.setType('f1', 'bogus');
    assertEqual(s.fn('f1').type, 'useful');
  });

  test('setLevel only applies to useful functions', () => {
    const s = fixture();
    s.setLevel('f2', 'excessive');
    assertEqual(s.fn('f2').level, null);
    s.setLevel('f3', 'excessive');
    assertEqual(s.fn('f3').level, 'excessive');
    s.setLevel('f3', 'bogus');
    assertEqual(s.fn('f3').level, 'excessive');
  });

  test('removeFunction unlocks the pair', () => {
    const s = fixture();
    s.removeFunction('f1');
    assertEqual(s.fn('f1'), null);
    assertEqual(s.labels.f1, undefined, 'its label position goes too');
    assertDeepEqual(s.toggleInteraction('b', 't'), { ok: true });
  });

  test('movePosition rounds, clamps at 0 and ignores unknown ids', () => {
    const s = fixture();
    s.movePosition('t', 12.6, -30);
    assertDeepEqual(s.positions.t, { x: 13, y: 0 });
    s.movePosition('gone', 1, 1);
    assertEqual(s.positions.gone, undefined);
    s.resetPositions();
    assertDeepEqual(s.positions, {});
    assertDeepEqual(s.labels, {}, 'reset also straightens the arrows');
  });

  test('moveLabel rounds, clamps at 0 and ignores unknown functions', () => {
    const s = fixture();
    s.moveLabel('f2', 50.4, -3);
    assertDeepEqual(s.labels.f2, { x: 50, y: 0 });
    s.moveLabel('gone', 1, 1);
    assertEqual(s.labels.gone, undefined);
  });

  test('discardIfEmpty removes only unused empty components', () => {
    const s = fixture();
    const { component } = s.addComponent('system', '  ');
    assertEqual(s.discardIfEmpty(component.id), true);
    assertEqual(s.component(component.id), null);
    assertEqual(s.discardIfEmpty('t'), false, 'named component stays');
  });

  test('discardIfEmpty keeps a component that is in use', () => {
    const s = fixture();
    s.component('b').name = '';
    assertEqual(s.discardIfEmpty('b'), false);
    assertEqual(s.functions.length, 3);
    const lonely = s.addComponent('system', '').component;
    s.toggleInteraction(lonely.id, 't');
    assertEqual(s.discardIfEmpty(lonely.id), false, 'ticked pair counts as use');
  });
});

suite('triz-function-analysis — derived values', () => {
  test('rankOf follows the object kind', () => {
    const s = fixture();
    assertEqual(rankOf(s.fn('f1'), s.components), 'basic');
    assertEqual(rankOf(s.fn('f2'), s.components), null, 'harmful');
    assertEqual(rankOf(s.fn('f3'), s.components), 'auxiliary');
    assertEqual(rankOf(s.addFunction('b', 'p'), s.components), 'additional');
    assertEqual(rankOf(s.addFunction('b', ''), s.components), null, 'draft');
  });

  test('functionRanks numbers auxiliary functions by their distance to a basic or additional function', () => {
    // b removes plaque (B), c guides the paste (Ad); everything else holds something.
    const s = State.fromJSON({
      components: ['b', 'c', 'k', 'h', 'n', 'x', 'y'].map((id) => ({ id, kind: 'system' }))
        .concat([{ id: 't', kind: 'target' }, { id: 'p', kind: 'supersystem' }]),
      functions: [
        { id: 'fb', carrier: 'b', object: 't', type: 'useful', level: 'insufficient' },
        { id: 'fp', carrier: 'c', object: 'p', type: 'useful' },
        { id: 'fk', carrier: 'k', object: 'b', type: 'useful' },
        { id: 'fc', carrier: 'k', object: 'c', type: 'useful' },
        { id: 'fh', carrier: 'h', object: 'k', type: 'useful' },
        { id: 'fs', carrier: 'h', object: 'b', type: 'useful' },
        { id: 'fn', carrier: 'n', object: 'h', type: 'useful' },
        { id: 'fx', carrier: 'x', object: 'y', type: 'useful' },
        { id: 'fy', carrier: 'y', object: 'x', type: 'useful' },
        { id: 'fz', carrier: 'h', object: 'x', type: 'useful' },
        { id: 'fharm', carrier: 'b', object: 'h', type: 'harmful' },
        { id: 'fd', carrier: 'b', object: '', type: 'useful' },
      ],
    });
    const r = functionRanks(s);
    assertDeepEqual(r.get('fb'), { rank: 'basic', level: null });
    assertDeepEqual(r.get('fp'), { rank: 'additional', level: null });
    assertDeepEqual(r.get('fk'), { rank: 'auxiliary', level: 1 }, 'on a B carrier');
    assertDeepEqual(r.get('fc'), { rank: 'auxiliary', level: 1 }, 'on an Ad carrier');
    assertDeepEqual(r.get('fh'), { rank: 'auxiliary', level: 2 });
    assertDeepEqual(r.get('fs'), { rank: 'auxiliary', level: 1 });
    assertDeepEqual(r.get('fn'), { rank: 'auxiliary', level: 2 }, 'h carries Ax1 and Ax2: the shortest way counts');
    assertDeepEqual(r.get('fx'), { rank: 'auxiliary', level: null }, 'a cycle without a way to B/Ad has no level');
    assertDeepEqual(r.get('fy'), { rank: 'auxiliary', level: null });
    assertDeepEqual(r.get('fz'), { rank: 'auxiliary', level: null });
    assertEqual(r.has('fharm'), false, 'harmful');
    assertEqual(r.has('fd'), false, 'draft');
  });

  test('functionRanks: a harmful function does not carry its carrier into the chain', () => {
    const s = State.fromJSON({
      components: [{ id: 't', kind: 'target' }, { id: 'a', kind: 'system' }, { id: 'b', kind: 'system' }],
      functions: [
        { id: 'f1', carrier: 'a', object: 't', type: 'harmful' },
        { id: 'f2', carrier: 'b', object: 'a', type: 'useful' },
      ],
    });
    assertDeepEqual(functionRanks(s).get('f2'), { rank: 'auxiliary', level: null });
  });

  test('openPairs lists ticked pairs without a function in either direction', () => {
    const s = fixture();
    assertDeepEqual(openPairs(s), []);
    s.toggleInteraction('t', 'g');
    assertDeepEqual(openPairs(s), [{ a: 'g', b: 't' }]);
    s.addFunction('g', '');
    assertDeepEqual(openPairs(s), [{ a: 'g', b: 't' }]);
  });

  test('openPairs ignores drafts; a reverse function closes the pair', () => {
    const s = fixture();
    s.toggleInteraction('t', 'g');
    s.addFunction('t', 'g');
    assertDeepEqual(openPairs(s), []);
  });

  test('disadvantages lists harmful, insufficient and excessive functions with names', () => {
    const s = fixture();
    assertDeepEqual(disadvantages(s), [
      { functionId: 'f1', carrier: 'Borsten', verb: 'entfernt', object: 'Zähne', parameter: 'Belag', kind: 'insufficient' },
      { functionId: 'f2', carrier: 'Borsten', verb: 'verletzt', object: 'Zahnfleisch', parameter: '', kind: 'harmful' },
    ]);
  });

  test('disadvantages skips drafts', () => {
    const s = fixture();
    const f = s.addFunction('b', '');
    s.setType(f.id, 'harmful');
    assertEqual(disadvantages(s).length, 2);
  });

  test('pairKey matches sorted interactions', () => {
    const s = fixture();
    assertTrue(s.interactions.every((i) => pairKey(i.a, i.b) === `${i.a}|${i.b}`));
  });
});

suite('triz-function-analysis — value & cost', () => {
  const row = (s, id) => valueCostRows(s).find((r) => r.id === id);

  test('a component scores 3/2/1 per useful function it carries, harmful 0', () => {
    const s = fixture();
    assertEqual(componentValue('b', s), 3);
    assertEqual(componentValue('h', s), 1);
    assertEqual(componentValue('t', s), 0);
  });

  test('rows list system components only, normalised to 10', () => {
    const s = fixture();
    s.setCost('b', 200);
    s.setCost('h', 50);
    assertDeepEqual(valueCostRows(s).map((r) => r.id), ['b', 'h']);
    const b = row(s, 'b');
    assertDeepEqual([b.name, b.value, b.normValue, b.cost, b.normCost], ['Borsten', 3, 10, 200, 10]);
    const h = row(s, 'h');
    assertEqual(h.value, 1);
    assertClose(h.normValue, 10 / 3, 1e-9);
    assertDeepEqual([h.cost, h.normCost], [50, 2.5]);
  });

  test('no functions and all-zero costs normalise to 0, not NaN', () => {
    const s = fixture();
    s.functions = [];
    s.setCost('b', 0);
    s.setCost('h', 0);
    assertDeepEqual(valueCostRows(s).map((r) => [r.normValue, r.normCost]), [[0, 0], [0, 0]]);
  });

  test('a component without cost has null cost and is ignored for the maximum', () => {
    const s = fixture();
    s.setCost('h', 50);
    assertDeepEqual([row(s, 'b').cost, row(s, 'b').normCost], [null, null]);
    assertEqual(row(s, 'h').normCost, 10);
  });

  test('setCost stores numbers >= 0, empty as null, rejects the rest', () => {
    const s = fixture();
    assertTrue(s.setCost('b', '12.5'));
    assertEqual(s.component('b').cost, 12.5);
    s.setCost('b', 0);
    assertEqual(s.component('b').cost, 0);
    s.setCost('b', '');
    assertEqual(s.component('b').cost, null);
    s.setCost('b', 7);
    assertEqual(s.setCost('b', -1), false);
    assertEqual(s.setCost('b', 'abc'), false);
    assertEqual(s.component('b').cost, 7);
  });

  test('a new component has no cost', () => {
    const s = new State();
    assertEqual(s.addComponent('system').component.cost, null);
  });

  test('fromJSON repairs cost and toJSON round-trips it', () => {
    const comps = [-3, '5', NaN, undefined, 7].map((cost, i) => ({ id: `c${i}`, name: '', kind: 'system', note: '', cost }));
    const s = State.fromJSON({ components: comps });
    assertDeepEqual(s.components.map((c) => c.cost), [null, null, null, null, 7]);
    assertEqual(State.fromJSON(s.toJSON()).component('c4').cost, 7);
  });

  test('the value & cost tab is a known tab', () => {
    assertEqual(TABS[3], 'valueCost');
    assertEqual(State.fromJSON({ activeTab: 'valueCost' }).activeTab, 'valueCost');
  });

  test('a system component turned supersystem keeps its cost but leaves the rows', () => {
    const s = fixture();
    s.setCost('h', 50);
    s.setKind('h', 'supersystem');
    assertEqual(s.component('h').cost, 50);
    assertDeepEqual(valueCostRows(s).map((r) => r.id), ['b']);
    s.setKind('h', 'system');
    assertEqual(row(s, 'h').cost, 50);
  });
});

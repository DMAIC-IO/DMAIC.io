/**
 * D.Mike — TRIZ function analysis: derived values (domain/analysis.js)
 *
 * Pure functions over plain data: pair keys, ordering, function pairs, rank,
 * open pairs, disadvantages and value & cost. The model rules (single target,
 * cascade, repair on load) are covered in model.test.js.
 */

import { suite, test, assertEqual, assertTrue, assertDeepEqual, assertClose } from '../../test-utils.js';
import {
  pairKey, orderedComponents, rankOf, openPairs, disadvantages, functionPairs,
  TABS, componentValue, valueCostRows, functionRanks,
} from '../../../js/modules/triz-function-analysis/domain/analysis.js';

/** @param {object} d @returns {object} plain module data with every list present */
const data = (d) => ({ components: [], interactions: [], exclusions: [], functions: [], positions: {}, labels: {}, ...d });
const comp = (id, kind, extra = {}) => ({ id, name: id, kind, note: '', cost: null, ...extra });
const fnc = (id, carrier, object, extra = {}) => ({
  id, carrier, verb: '', object, parameter: '', type: 'useful', level: 'adequate', note: '', ...extra,
});

/** Toothbrush: target teeth, system bristles + handle, supersystem gums + paste. */
function fixture() {
  return data({
    components: [
      comp('t', 'target', { name: 'Zähne' }),
      comp('b', 'system', { name: 'Borsten' }),
      comp('h', 'system', { name: 'Griff' }),
      comp('g', 'supersystem', { name: 'Zahnfleisch' }),
      comp('p', 'supersystem', { name: 'Zahnpasta' }),
    ],
    interactions: [{ a: 'b', b: 't' }, { a: 'b', b: 'g' }, { a: 'b', b: 'h' }],
    functions: [
      fnc('f1', 'b', 't', { verb: 'entfernt', parameter: 'Belag', level: 'insufficient' }),
      fnc('f2', 'b', 'g', { verb: 'verletzt', type: 'harmful', level: null }),
      fnc('f3', 'h', 'b', { verb: 'hält' }),
    ],
  });
}
const fn = (s, id) => s.functions.find((f) => f.id === id);
const cost = (s, id, value) => { s.components.find((c) => c.id === id).cost = value; };

suite('triz-function-analysis — pairs and order', () => {
  test('pairKey is order independent', () => {
    assertEqual(pairKey('b', 'a'), 'a|b');
    assertEqual(pairKey('a', 'b'), 'a|b');
  });

  test('pairKey matches sorted interactions', () => {
    const s = fixture();
    assertTrue(s.interactions.every((i) => pairKey(i.a, i.b) === `${i.a}|${i.b}`));
  });

  test('orderedComponents: target, system, supersystem in entry order', () => {
    const s = fixture();
    s.components.push(comp('k', 'system', { name: 'Kopf' }));
    assertDeepEqual(orderedComponents(s.components).map((c) => c.name),
      ['Zähne', 'Borsten', 'Griff', 'Kopf', 'Zahnfleisch', 'Zahnpasta']);
  });

  test('functionPairs groups both directions of a pair; drafts stay alone', () => {
    const s = fixture();
    s.functions.push(fnc('f4', 't', 'b'), fnc('f5', 'b', ''));
    const groups = functionPairs(s);
    assertDeepEqual(groups.map((g) => g.functions.length), [2, 1, 1, 1]);
    assertDeepEqual(groups.map((g) => g.complete), [true, true, true, false]);
    assertEqual(groups[0].key, pairKey('b', 't'));
    assertTrue(groups[3].key.startsWith('draft|'));
  });
});

suite('triz-function-analysis — derived values', () => {
  test('rankOf follows the object kind', () => {
    const s = fixture();
    assertEqual(rankOf(fn(s, 'f1'), s.components), 'basic');
    assertEqual(rankOf(fn(s, 'f2'), s.components), null, 'harmful');
    assertEqual(rankOf(fn(s, 'f3'), s.components), 'auxiliary');
    assertEqual(rankOf(fnc('x1', 'b', 'p'), s.components), 'additional');
    assertEqual(rankOf(fnc('x2', 'b', ''), s.components), null, 'draft');
  });

  test('functionRanks numbers auxiliary functions by their distance to a basic or additional function', () => {
    // b removes plaque (B), c guides the paste (Ad); everything else holds something.
    const s = data({
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
    const s = data({
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
    s.interactions.push({ a: 'g', b: 't' });
    assertDeepEqual(openPairs(s), [{ a: 'g', b: 't' }]);
    s.functions.push(fnc('d1', 'g', ''));
    assertDeepEqual(openPairs(s), [{ a: 'g', b: 't' }]);
  });

  test('openPairs ignores drafts; a reverse function closes the pair', () => {
    const s = fixture();
    s.interactions.push({ a: 'g', b: 't' });
    s.functions.push(fnc('r1', 't', 'g'));
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
    s.functions.push(fnc('d2', 'b', '', { type: 'harmful', level: null }));
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
    cost(s, 'b', 200);
    cost(s, 'h', 50);
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
    cost(s, 'b', 0);
    cost(s, 'h', 0);
    assertDeepEqual(valueCostRows(s).map((r) => [r.normValue, r.normCost]), [[0, 0], [0, 0]]);
  });

  test('a component without cost has null cost and is ignored for the maximum', () => {
    const s = fixture();
    cost(s, 'h', 50);
    assertDeepEqual([row(s, 'b').cost, row(s, 'b').normCost], [null, null]);
    assertEqual(row(s, 'h').normCost, 10);
  });




  test('the value & cost tab is a known tab', () => {
    assertEqual(TABS[3], 'valueCost');
  });

  test('a system component turned supersystem keeps its cost but leaves the rows', () => {
    const s = fixture();
    cost(s, 'h', 50);
    s.components.find((c) => c.id === 'h').kind = 'supersystem';
    assertDeepEqual(valueCostRows(s).map((r) => r.id), ['b']);
    s.components.find((c) => c.id === 'h').kind = 'system';
    assertEqual(row(s, 'h').cost, 50);
  });
});

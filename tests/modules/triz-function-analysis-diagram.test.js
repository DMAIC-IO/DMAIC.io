/**
 * D.Mike — TRIZ function analysis: layout and diagram builder
 */

import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import { State } from '../../js/modules/triz-function-analysis/triz-function-analysis-model.js';
import {
  NODE_W, NODE_H, autoLayout, resolvePositions, buildFunctionDiagram,
} from '../../js/modules/triz-function-analysis/triz-function-analysis-diagram.js';

const comp = (id, kind) => ({ id, name: id.toUpperCase(), kind, note: '' });

/** Two boxes side by side: a (system) at (0,0), b (target) at (220,0). */
function pair(functions) {
  return State.fromJSON({
    components: [comp('a', 'system'), comp('b', 'target')],
    functions,
    positions: { a: { x: 0, y: 0 }, b: { x: 220, y: 0 } },
  });
}
const fnc = (id, carrier, object, extra = {}) => ({ id, carrier, object, verb: id, type: 'useful', level: 'adequate', ...extra });

suite('triz-function-analysis — autoLayout', () => {
  test('target right, system grid (3 cols) filled from the target side, supersystem top/bottom alternating', () => {
    const cs = [comp('t', 'target'), comp('s1', 'system'), comp('s2', 'system'), comp('s3', 'system'),
      comp('s4', 'system'), comp('u1', 'supersystem'), comp('u2', 'supersystem'), comp('u3', 'supersystem')];
    assertDeepEqual(autoLayout(cs), {
      s1: { x: 440, y: 84 }, s2: { x: 220, y: 84 }, s3: { x: 0, y: 84 }, s4: { x: 440, y: 168 },
      t: { x: 660, y: 126 },
      u1: { x: 0, y: 0 }, u2: { x: 0, y: 252 }, u3: { x: 220, y: 0 },
    });
  });

  test('system components closer to the target sit closer to it, so no link crosses a chain', () => {
    // Chain a — b — c — t, entered near-first: c must still end up next to the target.
    const cs = [comp('t', 'target'), comp('c', 'system'), comp('b', 'system'), comp('a', 'system')];
    const pairs = [{ a: 'a', b: 'b' }, { a: 'b', b: 'c' }, { a: 'c', b: 't' }];
    assertDeepEqual(autoLayout(cs, pairs), {
      c: { x: 440, y: 84 }, b: { x: 220, y: 84 }, a: { x: 0, y: 84 }, t: { x: 660, y: 84 },
    });
  });

  test('without system components the target sits in column 1', () => {
    assertDeepEqual(autoLayout([comp('t', 'target')]), { t: { x: 220, y: 84 } });
    assertDeepEqual(autoLayout([]), {});
  });

  test('resolvePositions: stored positions win, others get their auto slot', () => {
    const s = State.fromJSON({ components: [comp('t', 'target'), comp('s1', 'system')], positions: { t: { x: 5, y: 7 } } });
    assertDeepEqual(resolvePositions(s), { t: { x: 5, y: 7 }, s1: { x: 0, y: 84 } });
  });

  test('resolvePositions orders by interactions and functions', () => {
    const s = State.fromJSON({
      components: [comp('t', 'target'), comp('near', 'system'), comp('far', 'system')],
      interactions: [{ a: 'far', b: 'near' }],
      functions: [fnc('f', 'near', 't')],
    });
    assertDeepEqual(resolvePositions(s), { t: { x: 440, y: 84 }, near: { x: 220, y: 84 }, far: { x: 0, y: 84 } });
  });
});

suite('triz-function-analysis — buildFunctionDiagram', () => {
  test('nodes have the fixed box size and kind styling', () => {
    const { nodes } = buildFunctionDiagram(pair([]));
    assertDeepEqual(nodes.map((n) => [n.id, n.x, n.y, n.w, n.h]), [['a', 0, 0, NODE_W, NODE_H], ['b', 220, 0, NODE_W, NODE_H]]);
    assertEqual(nodes[1].stroke, 'var(--color-node-target-stroke)', 'target has a strong border');
    assertEqual(nodes[1].fill, 'var(--color-node-target-fill)', 'target is filled');
    assertEqual(nodes[1].lines[0].color, 'var(--color-node-target-text)', 'target text colour');
    assertEqual(nodes[0].lines[0].color, undefined, 'system keeps the default text colour');
    assertEqual(nodes[0].lines[0].text, 'A');
  });

  test('a moved label bends the link: via the label point, clipped towards it', () => {
    const s = pair([fnc('f', 'a', 'b'), fnc('g', 'a', 'b')]);
    s.labels.f = { x: 180, y: 122 };
    const { links } = buildFunctionDiagram(s);
    const [f, g] = links;
    assertDeepEqual(f.via, { x: 180, y: 122 });
    // a: box 0..140 × 0..44, centre (70, 22) → exits through the bottom edge towards (180, 122)
    assertDeepEqual([f.x1, f.y1], [94.2, 44]);
    // b: ellipse at 220..360 × 0..44 → exits towards (180, 122) left of its centre (290, 22)
    assertTrue(f.x2 < 290 && f.y2 > 22, 'object side clipped towards the label');
    assertEqual(g.via, undefined, 'unmoved label stays a straight link');
  });

  test('rank labels are appended to the verb when given', () => {
    const s = pair([fnc('f', 'a', 'b'), fnc('g', 'b', 'a', { verb: '' })]);
    const plain = buildFunctionDiagram(s).links;
    assertDeepEqual(plain.map((l) => l.label), ['f', '']);
    const ranked = buildFunctionDiagram(s, { rankLabels: new Map([['f', 'B'], ['g', 'Ax1']]) }).links;
    assertDeepEqual(ranked.map((l) => l.label), ['f · B', 'Ax1']);
  });

  test('a link is clipped to both box borders and carries arrow + label', () => {
    const { links } = buildFunctionDiagram(pair([fnc('f', 'a', 'b')]));
    assertEqual(links.length, 1);
    const l = links[0];
    assertDeepEqual([l.x1, l.y1, l.x2, l.y2], [140, 22, 220, 22]);
    assertDeepEqual([l.id, l.shape, l.arrow, l.label, l.style], ['f', 'straight', 'end', 'f', 'solid']);
  });

  test('notation: insufficient thin dashed, adequate 2 px, excessive thick dashed', () => {
    const { links } = buildFunctionDiagram(pair([
      fnc('i', 'a', 'b', { level: 'insufficient' }),
      fnc('e', 'a', 'b', { level: 'excessive' }),
      fnc('h', 'a', 'b', { type: 'harmful', level: null }),
      fnc('n', 'a', 'b'),
    ]));
    assertDeepEqual(links.map((l) => l.width), [1, 3, undefined, 2], 'line width grows with the level');
  });

  test('notation: harmful is a wave in the error colour', () => {
    const { links } = buildFunctionDiagram(pair([
      fnc('i', 'a', 'b', { level: 'insufficient' }),
      fnc('e', 'a', 'b', { level: 'excessive' }),
      fnc('h', 'a', 'b', { type: 'harmful', level: null }),
    ]));
    assertDeepEqual(links.map((l) => l.style), ['dashed', 'dashed', 'wave']);
    assertEqual(links[2].color, 'var(--color-error)');
    assertEqual(links[0].color, undefined);
  });

  test('opposite links between the same pair are offset to different sides', () => {
    const { links } = buildFunctionDiagram(pair([fnc('f', 'a', 'b'), fnc('g', 'b', 'a')]));
    assertDeepEqual(links.map((l) => [l.y1, l.y2]), [[15, 15], [29, 29]]);
    // b is the target: its ellipse (rx 70, ry 22) is cut 7 px below the centre → 290 - 70·√(1 - (7/22)²)
    assertDeepEqual([links[1].x1, links[1].x2], [223.64, 140]);
  });

  test('three parallel links get three distinct tracks', () => {
    const { links } = buildFunctionDiagram(pair([fnc('f', 'a', 'b'), fnc('g', 'a', 'b'), fnc('h', 'a', 'b')]));
    assertDeepEqual(links.map((l) => l.y1), [8, 22, 36]);
  });

  test('highlight marks the selected function and the selected component\'s links', () => {
    const s = pair([fnc('f', 'a', 'b'), fnc('g', 'b', 'a')]);
    assertDeepEqual(buildFunctionDiagram(s, { selectedId: 'f' }).links.map((l) => l.highlight), [true, false]);
    assertDeepEqual(buildFunctionDiagram(s, { selectedId: 'a' }).links.map((l) => l.highlight), [true, true]);
    assertDeepEqual(buildFunctionDiagram(s).links.map((l) => l.highlight), [false, false]);
  });

  test('draft functions produce no link', () => {
    const s = pair([fnc('f', 'a', '')]);
    assertEqual(buildFunctionDiagram(s).links.length, 0);
  });

  test('long names are shortened in the export boxes', () => {
    const s = State.fromJSON({ components: [{ id: 'x', name: 'Ein sehr langer Komponentenname', kind: 'system' }] });
    const text = buildFunctionDiagram(s).nodes[0].lines[0].text;
    assertTrue(text.length <= 20 && text.endsWith('…'), text);
  });
});

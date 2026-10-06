/**
 * D.Mike — Process Map export scene unit tests
 * Specifies buildPmapScene (pure layout → primitives) and renderSceneToSVG
 * (spec 2026-10-06-process-map-export-horizontal-design).
 */

import { suite, test, assert, assertEqual, assertDeepEqual } from '../test-utils.js';
import { buildPmapScene, renderSceneToSVG } from '../../js/modules/process-map/process-map-export.js';

// Every colour is its own key, so tests can pick out e.g. loop strokes.
const colors = new Proxy({}, { get: (_, key) => `c-${String(key)}` });
const opts = { t: (k) => k, colors, measure: (text, size) => String(text).length * size * 0.6 };

const step = (id, title, extra = {}) => ({
  id, title, description: '', valueType: null, substeps: [],
  inputs: [{ id: `${id}i`, name: `In ${title}` }],
  outputs: [{ id: `${id}o`, name: `Out ${title}` }],
  loop: null, ...extra,
});
const loop = (targetStepId, condition, titles) => ({
  targetStepId, condition, steps: titles.map((title, i) => ({ id: `l${i}`, title })),
});
const scene = (steps) => buildPmapScene(steps, opts);
const byRole = (s, role) => s.items.filter((it) => it.role === role);
const textOf = (s, text) => s.items.find((it) => it.kind === 'text' && it.text === text);
const centre = (card) => card.x + card.w / 2;

/** Five steps, loops 2→0 (two chips) and 4→1 (one chip). */
function twoLoopSteps() {
  const steps = ['A', 'B', 'C', 'D', 'E'].map((t, i) => step(`s${i}`, t));
  steps[2].loop = loop('s0', 'Dough torn', ['Knead again', 'Rest']);
  steps[4].loop = loop('s1', 'Too cold', ['Reheat']);
  return steps;
}

suite('Process Map export — scene layout', () => {
  test('scene width grows with the number of steps', () => {
    const one = scene([step('a', 'A')]);
    const three = scene([step('a', 'A'), step('b', 'B'), step('c', 'C')]);
    assert(one.width > 0 && one.height > 0, 'non-empty scene');
    assert(three.width > one.width, 'three columns are wider than one');
  });

  test('step columns run left to right', () => {
    const s = scene([step('a', 'A'), step('b', 'B'), step('c', 'C')]);
    const cards = byRole(s, 'card');
    assertEqual(cards.length, 3);
    assert(cards[0].x < cards[1].x && cards[1].x < cards[2].x, 'cards ordered by x');
    assertEqual(cards[0].y, cards[2].y, 'cards share one row');
    assert(textOf(s, 'A').x < textOf(s, 'B').x, 'titles ordered by x');
  });

  test('a loop adds a band below the outputs row', () => {
    const plain = [step('a', 'A'), step('b', 'B')];
    const looped = [step('a', 'A'), step('b', 'B', { loop: loop('a', 'Retry', []) })];
    const s = scene(looped);
    assert(s.height > scene(plain).height, 'band adds height');
    const outY = textOf(s, 'Out A').y;
    const rails = byRole(s, 'rail');
    assert(rails.length > 0, 'rail lines exist');
    rails.forEach((r) => assert(Math.min(r.y1, r.y2) > outY, 'rail below outputs'));
  });

  test('the arrowhead sits at the target column centre', () => {
    const s = scene([step('a', 'A'), step('b', 'B'), step('c', 'C', { loop: loop('a', 'x', []) })]);
    const arrows = byRole(s, 'arrow');
    assertEqual(arrows.length, 1);
    const xs = arrows[0].points.map(([x]) => x);
    const tip = (Math.min(...xs) + Math.max(...xs)) / 2;
    assertEqual(tip, centre(byRole(s, 'card')[0]));
  });

  test('an open loop (no target) draws a dashed rail and no arrow', () => {
    const s = scene([step('a', 'A'), step('b', 'B', { loop: loop(null, '', []) })]);
    assertEqual(byRole(s, 'arrow').length, 0);
    assert(byRole(s, 'rail').some((r) => r.dash), 'dashed rail segment');
  });

  test('a two-loop map has pass-through lines in the top band', () => {
    const s = scene(twoLoopSteps());
    const cards = byRole(s, 'card');
    const passX = [...new Set(byRole(s, 'pass').map((l) => l.x1))].sort((a, b) => a - b);
    assertDeepEqual(passX, [centre(cards[1]), centre(cards[4])]);
    const arrowTips = byRole(s, 'arrow').map((a) => a.points[2][0]).sort((a, b) => a - b);
    assertDeepEqual(arrowTips, [centre(cards[0]), centre(cards[1])]);
  });

  test('condition and chip titles appear as text items', () => {
    const s = scene(twoLoopSteps());
    ['Knead again', 'Rest', 'Reheat'].forEach((title) => assert(textOf(s, title), `chip ${title}`));
    assert(s.items.some((it) => it.kind === 'text' && it.text.includes('Dough torn')), 'condition');
  });

  test('chips run right to left and wrap only when no column is left', () => {
    const steps = ['A', 'B', 'C'].map((t, i) => step(`s${i}`, t));
    steps[2].loop = loop('s0', 'c', ['First', 'Second']);
    const s = scene(steps);
    assert(textOf(s, 'First').x > textOf(s, 'Second').x, 'first chip right of the second');
    assertEqual(textOf(s, 'First').y, textOf(s, 'Second').y, 'one chip line');
    // In the top band of twoLoopSteps, column 1 carries a pass-through line,
    // so the chips of loop 2→0 only have the source column and wrap under the controls.
    const two = scene(twoLoopSteps());
    assert(textOf(two, 'Rest').y > textOf(two, 'Knead again').y, 'second chip wrapped');
  });
});

suite('Process Map export — SVG renderer', () => {
  test('SVG output is well-formed and contains loop texts', () => {
    const steps = twoLoopSteps();
    steps[0].title = 'Fish & <Chips>';
    const svg = renderSceneToSVG(scene(steps));
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    assertEqual(doc.getElementsByTagName('parsererror').length, 0, 'no parser error');
    assertEqual(doc.documentElement.nodeName, 'svg');
    const text = doc.documentElement.textContent;
    ['Dough torn', 'Knead again', 'Reheat', 'Fish & <Chips>'].forEach((s) => assert(text.includes(s), s));
  });
});

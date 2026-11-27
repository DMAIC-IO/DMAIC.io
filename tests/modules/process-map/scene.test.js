/**
 * Process Map Bildexport: Szene (reines Layout → Zeichenelemente) und SVG.
 * Punkt und Winkel sind Formen statt Glyphen.
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { buildPmapScene, renderSceneToSVG, SCENE_VARS } from '../../../js/modules/process-map/io/scene.js';

// Jede Farbe ist ihr eigener Schlüssel; so lassen sich z. B. Loop-Linien herausgreifen.
const colors = /** @type {any} */ (Object.fromEntries(Object.keys(SCENE_VARS).map((k) => [k, `c-${k}`])));
const opts = { t: (/** @type {string} */ k) => k, colors, measure: (/** @type {string} */ text, /** @type {number} */ size) => String(text).length * size * 0.6 };

const step = (id, title, extra = {}) => /** @type {any} */ ({
  id, title, description: '', valueType: null, substeps: [],
  inputs: [{ id: `${id}i`, name: `In ${title}`, inputType: null }],
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

/** Fünf Schritte, Loops 2→0 (zwei Chips) und 4→1 (ein Chip). */
function twoLoopSteps() {
  const steps = ['A', 'B', 'C', 'D', 'E'].map((t, i) => step(`s${i}`, t));
  steps[2].loop = loop('s0', 'Dough torn', ['Knead again', 'Rest']);
  steps[4].loop = loop('s1', 'Too cold', ['Reheat']);
  return steps;
}

suite('Process Map Bildexport — Szene', () => {
  test('die Breite wächst mit der Zahl der Schritte', () => {
    const one = scene([step('a', 'A')]);
    const three = scene([step('a', 'A'), step('b', 'B'), step('c', 'C')]);
    assert(one.width > 0 && one.height > 0, 'nicht leer');
    assert(three.width > one.width, 'drei Spalten breiter als eine');
  });

  test('Schrittspalten laufen von links nach rechts', () => {
    const s = scene([step('a', 'A'), step('b', 'B'), step('c', 'C')]);
    const cards = byRole(s, 'card');
    assertEqual(cards.length, 3);
    assert(cards[0].x < cards[1].x && cards[1].x < cards[2].x, 'Karten nach x');
    assertEqual(cards[0].y, cards[2].y);
  });

  test('ein Loop fügt ein Band unter der Output-Zeile an', () => {
    const plain = [step('a', 'A'), step('b', 'B')];
    const s = scene([step('a', 'A'), step('b', 'B', { loop: loop('a', 'Retry', []) })]);
    assert(s.height > scene(plain).height, 'Band macht höher');
    const outY = textOf(s, 'Out A').y;
    const rails = byRole(s, 'rail');
    assert(rails.length > 0, 'Schienen');
    rails.forEach((r) => assert(Math.min(r.y1, r.y2) > outY, 'Schiene unter den Outputs'));
  });

  test('die Pfeilspitze sitzt in der Mitte der Zielspalte', () => {
    const s = scene([step('a', 'A'), step('b', 'B'), step('c', 'C', { loop: loop('a', 'x', []) })]);
    const arrows = byRole(s, 'arrow');
    assertEqual(arrows.length, 1);
    const xs = arrows[0].points.map(([x]) => x);
    assertEqual((Math.min(...xs) + Math.max(...xs)) / 2, centre(byRole(s, 'card')[0]));
  });

  test('ein offener Loop zeichnet eine gestrichelte Schiene ohne Pfeil', () => {
    const s = scene([step('a', 'A'), step('b', 'B', { loop: loop(null, '', []) })]);
    assertEqual(byRole(s, 'arrow').length, 0);
    assert(byRole(s, 'rail').some((r) => r.dash), 'gestrichelt');
  });

  test('zwei Loops: Durchlässe und Pfeilspitzen im oberen Band', () => {
    const s = scene(twoLoopSteps());
    const cards = byRole(s, 'card');
    assertDeepEqual([...new Set(byRole(s, 'pass').map((l) => l.x1))].sort((a, b) => a - b), [centre(cards[1]), centre(cards[4])]);
    assertDeepEqual(byRole(s, 'arrow').map((a) => a.points[2][0]).sort((a, b) => a - b), [centre(cards[0]), centre(cards[1])]);
  });

  test('Chips laufen von rechts nach links und brechen erst ohne freie Spalte um', () => {
    const steps = ['A', 'B', 'C'].map((t, i) => step(`s${i}`, t));
    steps[2].loop = loop('s0', 'c', ['First', 'Second']);
    const s = scene(steps);
    assert(textOf(s, 'First').x > textOf(s, 'Second').x, 'erster Chip rechts');
    assertEqual(textOf(s, 'First').y, textOf(s, 'Second').y);
    const two = scene(twoLoopSteps());
    assert(textOf(two, 'Rest').y > textOf(two, 'Knead again').y, 'zweiter Chip umbrochen');
  });

  test('Punkt und Winkel sind Formen: kein ● ▾ ▸ in Texten', () => {
    const steps = [step('a', 'A', { substeps: [{ id: 'x', title: 'X' }] }), step('b', 'B')];
    const s = scene(steps);
    assert(!s.items.some((it) => it.kind === 'text' && /[●▾▸]/.test(it.text)), 'keine Glyphen');
    assertEqual(byRole(s, 'dot').length, 4);
    byRole(s, 'dot').forEach((d) => assertEqual(d.r, d.w / 2));
    const chevrons = byRole(s, 'chevron');
    assertEqual(chevrons.length, 2);
    assertEqual(chevrons[0].fill, 'c-accent');
    assertEqual(chevrons[1].fill, 'c-textTertiary');
    assert(textOf(s, 'inputs »') && textOf(s, '» outputs') && textOf(s, 'substepsLabel (1)'), 'Beschriftungen');
  });

  test('ohne Farbe gilt die Rückfallfarbe', () => {
    const s = buildPmapScene([step('a', 'A')], { ...opts, colors: {} });
    assertEqual(s.items[0].fill, '#ffffff');
  });
});

suite('Process Map Bildexport — SVG', () => {
  test('SVG ist ein Dokument mit maskierten Texten und rgba als Deckkraft', () => {
    const steps = twoLoopSteps();
    steps[0].title = 'Fish & <Chips>';
    const svg = renderSceneToSVG(scene(steps));
    assert(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), 'Wurzel');
    assert(svg.endsWith('</svg>'), 'Ende');
    assert(svg.includes('Fish &amp; &lt;Chips&gt;'), 'maskiert');
    for (const s of ['Dough torn', 'Knead again', 'Reheat']) assert(svg.includes(s), s);
    const rgba = renderSceneToSVG({ width: 1, height: 1, items: [{ kind: 'rect', x: 0, y: 0, w: 1, h: 1, fill: 'rgba(0,102,204,0.10)' }] });
    assert(rgba.includes('fill="#0066cc" fill-opacity="0.1"'), rgba);
  });
});

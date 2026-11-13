/**
 * Tests for modules/project-charter/interaction/ — Organigramm-Knoten verschieben
 * (orgNodeGesture, kind move) und Ziele umsortieren (goalRowGesture, kind
 * reorder), angehängt an echtes DOM mit Tastatur- und Zeiger-Ereignissen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, afterEach } from '../../test-utils.js';
import { isGesture } from '../../../js/core/interaction/define.js';
import { attachGesture } from '../../../js/core/interaction/attach.js';
import { orgNodeGesture } from '../../../js/modules/project-charter/interaction/org-node.js';
import { goalRowGesture } from '../../../js/modules/project-charter/interaction/goals.js';

const cleanup = [];
const NW = 220;
const NH = 50;

function mount(root, def, host) {
  root.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:600px;';
  document.body.append(root);
  const calls = [];
  const env = { execute: (name, args) => { calls.push([name, args]); }, notify() {}, t: (k) => k };
  const detach = attachGesture(root, def, host, env);
  cleanup.push(() => { detach(); root.remove(); });
  return calls;
}
function key(target, k, init = {}) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
}
function alt(target, k) { target.focus(); key(target, k, { altKey: true }); }
function pointer(target, type, x, y) {
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, pointerType: 'mouse',
    button: type === 'pointermove' ? -1 : 0, clientX: x, clientY: y,
  }));
}
function drag(target, sx, sy, tx, ty) {
  pointer(target, 'pointerdown', sx, sy);
  for (let i = 1; i <= 4; i++) pointer(target, 'pointermove', sx + (tx - sx) * i / 4, sy + (ty - sy) * i / 4);
  pointer(target, 'pointerup', tx, ty);
}

//  r1 ─┬─ a ─── a1          (Zeile 0: r1, r2; Zeile 1: a, b; Zeile 2: a1)
//      └─ b
//  r2
// kids: Anzahl aller Kinder (auch ausgeblendeter), x/y: linke obere Ecke
const TREE = [
  { id: 'r1', parent: null, x: 0, y: 0, kids: 2 },
  { id: 'a', parent: 'r1', x: 0, y: 100, kids: 1 },
  { id: 'b', parent: 'r1', x: 300, y: 100, kids: 0 },
  { id: 'a1', parent: 'a', x: 0, y: 200, kids: 0 },
  { id: 'r2', parent: null, x: 700, y: 0, kids: 0 },
];

function setupOrg(tree = TREE) {
  const root = document.createElement('div');
  for (const t of tree) {
    const el = document.createElement('div');
    el.className = 'pc__org-node';
    el.tabIndex = 0;
    el.dataset.id = t.id;
    if (t.parent) el.dataset.parentId = t.parent;
    el.dataset.childCount = String(t.kids);
    el.style.cssText = `position:absolute;left:${t.x}px;top:${t.y}px;width:${NW}px;height:${NH}px;`;
    root.append(el);
  }
  const host = { state: { dragPreview: null } };
  const calls = mount(root, orgNodeGesture({ handle: '.pc__org-node' }), host);
  const node = (id) => root.querySelector(`[data-id="${id}"]`);
  const center = (id) => ({ x: tree.find((t) => t.id === id).x + NW / 2, y: tree.find((t) => t.id === id).y + NH / 2 });
  return { root, host, calls, node, center };
}

suite('project-charter gestures — Organigrammknoten', () => {
  afterEach(() => { while (cleanup.length) cleanup.pop()(); });

  test('ist eine move-Geste', () => {
    const def = orgNodeGesture({ handle: '.pc__org-node' });
    assertTrue(isGesture(def));
    assertEqual(def.kind, 'move');
  });

  test('start: id, Elternknoten, Index unter den Geschwistern', () => {
    const { node } = setupOrg();
    const def = orgNodeGesture({ handle: '.pc__org-node' });
    assertDeepEqual(def.start.call({}, node('b')), { id: 'b', parentId: 'r1', index: 1 });
    assertDeepEqual(def.start.call({}, node('r2')), { id: 'r2', parentId: null, index: 1 });
  });

  test('locate: Überlappung mit Nicht-Nachfahre → letztes Kind dieses Knotens', () => {
    const { node, center, calls } = setupOrg();
    const c = center('b'); const t = center('r2');
    drag(node('b'), c.x, c.y, t.x, t.y);
    assertDeepEqual(calls, [['moveOrgNode', { id: 'b', parentId: 'r2', index: 0 }]]);
  });

  test('locate: Ziel mit Kindern → Index = Kinderzahl (auch ausgeblendete)', () => {
    const { node, center, calls } = setupOrg();
    const c = center('b'); const t = center('a');
    drag(node('b'), c.x, c.y, t.x, t.y);
    assertDeepEqual(calls, [['moveOrgNode', { id: 'b', parentId: 'a', index: 1 }]]);
  });

  test('locate: Überlappung mit dem eigenen Elternknoten hängt nicht um (Geschwisterlogik)', () => {
    // Als letztes Kind von r1 würde a auf Index 1 landen; stattdessen gilt die Höhe der
    // Geschwister — r1 liegt eine Zeile darüber, außerhalb der Toleranz → kein Kommando.
    const s = setupOrg();
    const c = s.center('a');
    drag(s.node('a'), c.x, c.y, 50, 25);
    assertEqual(s.calls.length, 0);
  });

  test('locate: Überlappung mit einem Nachfahren → null, kein Kommando, Vorschau geräumt', () => {
    const { node, center, calls, host } = setupOrg();
    const c = center('r1'); const t = center('a1');
    drag(node('r1'), c.x, c.y, t.x, t.y);
    assertEqual(calls.length, 0);
    assertEqual(host.state.dragPreview, null);
  });

  test('locate: auf Geschwisterhöhe → Platz unter den Geschwistern', () => {
    const { node, center, calls } = setupOrg();
    const c = center('b');
    // leere Fläche zwischen a und b (x 230..300) auf Höhe der Geschwister, links von a-Mitte
    drag(node('b'), c.x, c.y, 20, 100 + NH / 2 + 30);
    assertDeepEqual(calls, [['moveOrgNode', { id: 'b', parentId: 'r1', index: 0 }]]);
  });

  test('locate: Toleranz refH + VG/2 — knapp innerhalb ja, weit außerhalb null', () => {
    // Referenz b: Mitte y 125; Toleranz 50 + 18 = 68; Zeiger rechts von b (freie Fläche)
    const near = setupOrg();
    const c = near.center('a');
    drag(near.node('a'), c.x, c.y, 600, 125 + 60);
    assertDeepEqual(near.calls, [['moveOrgNode', { id: 'a', parentId: 'r1', index: 1 }]]);
    const far = setupOrg();
    drag(far.node('a'), c.x, c.y, 600, 125 + 75);
    assertEqual(far.calls.length, 0);
  });

  test('Vorschau während des Ziehens: { id, parentId, index, x, y }', () => {
    const { node, center, host } = setupOrg();
    const c = center('b'); const t = center('r2');
    pointer(node('b'), 'pointerdown', c.x, c.y);
    pointer(node('b'), 'pointermove', c.x + 100, c.y - 40);
    pointer(node('b'), 'pointermove', t.x, t.y);
    const p = host.state.dragPreview;
    assertEqual(p.id, 'b');
    assertEqual(p.parentId, 'r2');
    assertEqual(p.index, 0);
    assertTrue(typeof p.x === 'number' && typeof p.y === 'number');
    pointer(node('b'), 'pointerup', t.x, t.y);
    assertEqual(host.state.dragPreview, null);
  });

  test('step ←: an Index 0 → null (kein Kommando)', () => {
    const { node, calls } = setupOrg();
    alt(node('a'), 'ArrowLeft');
    assertEqual(calls.length, 0);
  });

  test('step ←/→: Platz unter den Geschwistern', () => {
    const { node, calls } = setupOrg();
    alt(node('b'), 'ArrowLeft');
    alt(node('a'), 'ArrowRight');
    assertDeepEqual(calls, [
      ['moveOrgNode', { id: 'b', parentId: 'r1', index: 0 }],
      ['moveOrgNode', { id: 'a', parentId: 'r1', index: 1 }],
    ]);
  });

  test('step →: am Ende → null', () => {
    const { node, calls } = setupOrg();
    alt(node('b'), 'ArrowRight');
    alt(node('r2'), 'ArrowRight');
    assertEqual(calls.length, 0);
  });

  test('step ↑: Kind einer Wurzel → Wurzel direkt rechts neben dem bisherigen Elternknoten', () => {
    const { node, calls } = setupOrg();
    alt(node('a'), 'ArrowUp');
    assertDeepEqual(calls, [['moveOrgNode', { id: 'a', parentId: null, index: 1 }]]);
  });

  test('step ↑: tieferer Knoten → Geschwister des Elternknotens, direkt rechts daneben', () => {
    const { node, calls } = setupOrg();
    alt(node('a1'), 'ArrowUp');
    assertDeepEqual(calls, [['moveOrgNode', { id: 'a1', parentId: 'r1', index: 1 }]]);
  });

  test('step ↑: an einer Wurzel → null', () => {
    const { node, calls } = setupOrg();
    alt(node('r1'), 'ArrowUp');
    assertEqual(calls.length, 0);
  });

  test('step ↓: ohne linken Nachbarn → null', () => {
    const { node, calls } = setupOrg();
    alt(node('a'), 'ArrowDown');
    alt(node('r1'), 'ArrowDown');
    assertEqual(calls.length, 0);
  });

  test('step ↓: letztes Kind des linken Nachbarn', () => {
    const { node, calls } = setupOrg();
    alt(node('b'), 'ArrowDown');
    alt(node('r2'), 'ArrowDown');
    assertDeepEqual(calls, [
      ['moveOrgNode', { id: 'b', parentId: 'a', index: 1 }],
      ['moveOrgNode', { id: 'r2', parentId: 'r1', index: 2 }],
    ]);
  });

  test('Enter-Modus: ↑ dann → ergibt ein Kommando mit dem Endergebnis', () => {
    const { node, calls } = setupOrg();
    const el = node('a1'); el.focus();
    key(el, 'Enter'); key(el, 'ArrowUp'); key(el, 'ArrowRight'); key(el, 'Enter');
    assertDeepEqual(calls, [['moveOrgNode', { id: 'a1', parentId: 'r1', index: 2 }]]);
  });
});

function goals(ids) {
  const root = document.createElement('div');
  const body = document.createElement('div');
  body.setAttribute('data-reorder-group', 'goals');
  body.setAttribute('data-reorder-closed', '');
  ids.forEach((id, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'height:20px;';
    row.setAttribute('data-reorder-index', String(i));
    row.setAttribute('data-id', id);
    const grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'pc__goal-grip';
    grip.style.cssText = 'display:block;width:20px;height:20px;padding:0;border:0;';
    row.append(grip);
    body.append(row);
  });
  root.append(body);
  const host = { state: { dragPreview: null } };
  const calls = mount(root, goalRowGesture({ handle: '.pc__goal-grip' }), host);
  const grip = (id) => root.querySelector(`[data-id="${id}"] .pc__goal-grip`);
  return { root, host, calls, grip };
}

suite('project-charter gestures — Ziele', () => {
  afterEach(() => { while (cleanup.length) cleanup.pop()(); });

  test('ist eine geschlossene reorder-Geste auf der y-Achse', () => {
    const def = goalRowGesture({ handle: '.pc__goal-grip' });
    assertTrue(isGesture(def));
    assertEqual(def.kind, 'reorder');
    assertEqual(def.axis, 'y');
    const { root } = goals(['g1', 'g2']);
    assertTrue(root.querySelector('[data-reorder-group]').hasAttribute('data-reorder-closed'));
  });

  test('Endindex → beforeId der Zeile an diesem Platz', () => {
    const { calls, grip } = goals(['g1', 'g2', 'g3']);
    grip('g1').focus();
    key(grip('g1'), 'Enter'); key(grip('g1'), 'ArrowDown'); key(grip('g1'), 'Enter');
    assertDeepEqual(calls, [['moveGoal', { id: 'g1', beforeId: 'g3' }]]);
  });

  test('ans Ende → beforeId null', () => {
    const { calls, grip } = goals(['g1', 'g2', 'g3']);
    grip('g1').focus();
    key(grip('g1'), 'Enter'); key(grip('g1'), 'ArrowDown'); key(grip('g1'), 'ArrowDown'); key(grip('g1'), 'Enter');
    assertDeepEqual(calls, [['moveGoal', { id: 'g1', beforeId: null }]]);
  });

  test('Alt+↑: vor die vorige Zeile', () => {
    const { calls, grip } = goals(['g1', 'g2', 'g3']);
    alt(grip('g3'), 'ArrowUp');
    assertDeepEqual(calls, [['moveGoal', { id: 'g3', beforeId: 'g2' }]]);
  });

  test('Zeiger: Zeile nach oben ziehen', () => {
    const { calls, grip } = goals(['g1', 'g2', 'g3']);
    drag(grip('g3'), 10, 50, 10, 5);
    assertDeepEqual(calls, [['moveGoal', { id: 'g3', beforeId: 'g1' }]]);
  });

  test('Ablegen am Ausgangsplatz → kein Kommando', () => {
    const { calls, grip } = goals(['g1', 'g2', 'g3']);
    drag(grip('g2'), 10, 30, 10, 32);
    assertEqual(calls.length, 0);
  });
});

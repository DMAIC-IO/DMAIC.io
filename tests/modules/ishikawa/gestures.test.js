/**
 * Tests for modules/ishikawa/interaction/ — Umsortieren in den Tabellen
 * Fakten/Experimente (rowGesture) und im Ursachenbaum (treeGesture), angehängt
 * an echtes DOM mit Tastatur- und Zeiger-Ereignissen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, afterEach } from '../../test-utils.js';
import { isGesture } from '../../../js/core/interaction/define.js';
import { attachGesture } from '../../../js/core/interaction/attach.js';
import { rowGesture } from '../../../js/modules/ishikawa/interaction/rows.js';
import { treeGesture } from '../../../js/modules/ishikawa/interaction/tree.js';

const cleanup = [];
const ROW_H = 20;
const tt = (key, p = {}) => `${key}(${Object.entries(p).map(([k, v]) => `${k}=${v}`).join(',')})`;
const live = () => document.getElementById('dmike-live-region')?.textContent ?? '';

/**
 * Eine Tabelle je Gruppe; jede Zeile 20 px hoch, der Griff in der ersten Zelle.
 * @param {HTMLElement} root @param {string} group @param {number[]} ids
 */
function table(root, group, ids) {
  const t = document.createElement('table');
  t.style.cssText = 'display:block;border-spacing:0;';
  const body = document.createElement('tbody');
  body.style.cssText = 'display:block;';
  body.setAttribute('data-reorder-group', group);
  body.setAttribute('data-reorder-closed', '');
  ids.forEach((id, i) => {
    const tr = document.createElement('tr');
    tr.style.cssText = `display:block;height:${ROW_H}px;`;
    tr.setAttribute('data-reorder-index', String(i));
    tr.setAttribute('data-id', String(id));
    const td = document.createElement('td');
    td.style.cssText = 'display:block;padding:0;';
    const grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'grip';
    grip.style.cssText = `display:block;width:20px;height:${ROW_H}px;padding:0;border:0;`;
    td.append(grip);
    tr.append(td);
    body.append(tr);
  });
  t.append(body);
  root.append(t);
}

function mount(root, def, host) {
  root.style.cssText = 'position:fixed;left:0;top:0;width:200px;';
  document.body.append(root);
  const calls = [];
  const env = { execute: (name, args) => { calls.push([name, args]); }, notify() {}, t: tt };
  const detach = attachGesture(root, def, host, env);
  cleanup.push(() => { detach(); root.remove(); });
  return calls;
}

function key(target, k, init = {}) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
}
function keys(target, list) {
  target.focus();
  for (const k of list) key(target, k);
}
function altKey(target, k) {
  target.focus();
  key(target, k, { altKey: true });
}
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
/** Mitte der Zeile `i` einer Tabelle, die bei `top` beginnt; `dy` verschiebt. */
const rowY = (i, top = 0, dy = 0) => top + i * ROW_H + ROW_H / 2 + dy;

/** Fakten 1, 2, 3 oben (y 0–60), Experimente 10, 11 darunter (y 60–100). */
function setupRows(command = 'moveFactBefore') {
  const root = document.createElement('div');
  table(root, 'facts', [1, 2, 3]);
  table(root, 'experiments', [10, 11]);
  const host = { state: { dragPreview: null } };
  const calls = mount(root, rowGesture({ handle: '.grip', command }), host);
  const grip = (id) => root.querySelector(`[data-id="${id}"] .grip`);
  return { root, host, calls, grip };
}

//   1 ─┬─ 3 ─── 5
//      └─ 4
//   2 ─── 6
//   7
// Sichtbar in Baumreihenfolge: 1, 3, 5, 4, 2, 6, 7 (Index 0–6).
const TREE = [
  { id: 1, parentId: null }, { id: 3, parentId: 1 }, { id: 5, parentId: 3 }, { id: 4, parentId: 1 },
  { id: 2, parentId: null }, { id: 6, parentId: 2 }, { id: 7, parentId: null },
];
const VISIBLE = [1, 3, 5, 4, 2, 6, 7];

function setupTree(visible = VISIBLE) {
  const root = document.createElement('div');
  table(root, 'causes', visible);
  const host = { model: { rows: TREE.map((r) => ({ ...r })) }, state: { dragPreview: null } };
  const calls = mount(root, treeGesture({ handle: '.grip' }), host);
  const grip = (id) => root.querySelector(`[data-id="${id}"] .grip`);
  return { root, host, calls, grip };
}

suite('ishikawa gestures — Fakten und Experimente', () => {
  afterEach(() => { while (cleanup.length) cleanup.pop()(); });

  test('ist eine reorder-Geste auf der y-Achse', () => {
    const def = rowGesture({ handle: '.grip', command: 'moveFactBefore' });
    assertTrue(isGesture(def));
    assertEqual(def.kind, 'reorder');
    assertEqual(def.axis, 'y');
  });

  test('Tastatur ↓: Kommando mit der id der Zeile am Endindex', () => {
    const { calls, grip } = setupRows();
    keys(grip(1), ['Enter', 'ArrowDown', 'Enter']);
    assertDeepEqual(calls, [['moveFactBefore', { factId: 1, targetFactId: 3 }]]);
  });

  test('Alt+↑: vor die vorige Zeile', () => {
    const { calls, grip } = setupRows();
    altKey(grip(3), 'ArrowUp');
    assertDeepEqual(calls, [['moveFactBefore', { factId: 3, targetFactId: 2 }]]);
  });

  test('ans Ende → targetFactId null', () => {
    const { calls, grip } = setupRows();
    keys(grip(1), ['Enter', 'ArrowDown', 'ArrowDown', 'Enter']);
    assertDeepEqual(calls, [['moveFactBefore', { factId: 1, targetFactId: null }]]);
  });

  test('Zeiger hinter die letzte Zeile → targetFactId null', () => {
    const { calls, grip } = setupRows();
    drag(grip(1), 10, rowY(0), 10, rowY(2, 0, 5));
    assertDeepEqual(calls, [['moveFactBefore', { factId: 1, targetFactId: null }]]);
  });

  test('Experimente: moveExperimentBefore mit den Parametern der Agentenaktion', () => {
    const { calls, grip } = setupRows('moveExperimentBefore');
    altKey(grip(11), 'ArrowUp');
    assertDeepEqual(calls, [['moveExperimentBefore', { experimentId: 11, targetExperimentId: 10 }]]);
  });

  test('Zeiger: Gruppe der anderen Tabelle ist kein Ziel', () => {
    const { calls, grip } = setupRows();
    drag(grip(1), 10, rowY(0), 10, rowY(1, 60));
    assertEqual(calls.length, 0);
    assertEqual(live(), 'common.gesture.cancelled()');
  });

  test('Tastatur → in die andere Tabelle bewegt nichts', () => {
    const { calls, grip } = setupRows();
    keys(grip(1), ['Enter', 'ArrowRight', 'Enter']);
    assertEqual(calls.length, 0);
  });

  test('Vorschau: { kind, index, ids }, danach null', () => {
    const { host, grip } = setupRows();
    keys(grip(2), ['Enter']);
    assertDeepEqual(host.state.dragPreview, { kind: 'facts', index: 1, ids: [2] });
    key(grip(2), 'ArrowDown');
    assertDeepEqual(host.state.dragPreview, { kind: 'facts', index: 2, ids: [2] });
    key(grip(2), 'Escape');
    assertEqual(host.state.dragPreview, null);
  });

  test('zurück an den Ausgangsplatz ergibt kein Kommando', () => {
    const { calls, grip } = setupRows();
    keys(grip(1), ['Enter', 'ArrowDown', 'ArrowUp', 'Enter']);
    assertEqual(calls.length, 0);
  });
});

suite('ishikawa gestures — Ursachenbaum', () => {
  afterEach(() => { while (cleanup.length) cleanup.pop()(); });

  test('ist eine reorder-Geste auf der y-Achse', () => {
    const def = treeGesture({ handle: '.grip' });
    assertTrue(isGesture(def));
    assertEqual(def.kind, 'reorder');
    assertEqual(def.axis, 'y');
  });

  test('Zeiger: Ziel im eigenen Teilbaum → clamp null, kein Kommando', () => {
    const { calls, grip } = setupTree();
    // Zeile 1 auf die obere Hälfte von Zeile 4 (Kind von 1).
    drag(grip(1), 10, rowY(0), 10, rowY(3, 0, -5));
    assertEqual(calls.length, 0);
    assertEqual(live(), 'common.gesture.cancelled()');
  });

  test('clamp direkt: Ziel im Teilbaum → null, sonst Position mit Zielzeile', () => {
    const { root, host } = setupTree();
    const def = treeGesture({ handle: '.grip' });
    const ctx = { root, axis: 'y' };
    const from = { group: 'causes', index: 0, id: 1, beforeId: 1 };
    assertEqual(def.clamp.call(host, { group: 'causes', index: 2, id: 1 }, ctx, from), null);
    assertDeepEqual(def.clamp.call(host, { group: 'causes', index: 3, id: 1 }, ctx, from),
      { group: 'causes', index: 3, id: 1, beforeId: 2 });
  });

  test('Zeiger: vor eine Zeile unter anderem Elternknoten', () => {
    const { calls, grip } = setupTree();
    // Zeile 4 (unter 1) auf die obere Hälfte von Zeile 6 (unter 2).
    drag(grip(4), 10, rowY(3), 10, rowY(5, 0, -5));
    assertDeepEqual(calls, [['moveRowBefore', { rowId: 4, targetRowId: 6 }]]);
  });

  test('Zeiger: direkt vor der folgenden Zeile ist der Ausgangsplatz', () => {
    const { calls, grip } = setupTree();
    // Zeile 4 steht schon direkt vor Zeile 2: Endindex = Ausgangsindex.
    drag(grip(4), 10, rowY(3), 10, rowY(4, 0, -5));
    assertEqual(calls.length, 0);
  });

  test('Zeiger hinter die letzte Zeile: begrenzt auf die letzte Zeile', () => {
    const { calls, grip } = setupTree();
    drag(grip(2), 10, rowY(4), 10, rowY(6, 0, 8));
    assertDeepEqual(calls, [['moveRowBefore', { rowId: 2, targetRowId: 7 }]]);
  });

  test('Alt+↑ an der ersten Geschwisterzeile → kein Kommando', () => {
    const { calls, grip } = setupTree();
    altKey(grip(1), 'ArrowUp');
    altKey(grip(3), 'ArrowUp');
    assertEqual(calls.length, 0);
  });

  test('Alt+↑ vor die vorige Geschwisterzeile', () => {
    const { calls, grip } = setupTree();
    altKey(grip(2), 'ArrowUp');
    assertDeepEqual(calls, [['moveRowBefore', { rowId: 2, targetRowId: 1 }]]);
  });

  test('Alt+↓ springt über den Teilbaum der nächsten Geschwisterzeile', () => {
    const { calls, grip } = setupTree();
    altKey(grip(1), 'ArrowDown');
    assertDeepEqual(calls, [['moveRowBefore', { rowId: 1, targetRowId: 7 }]]);
  });

  test('Alt+↓ hinter die letzte Geschwisterzeile → targetRowId null', () => {
    const { calls, grip } = setupTree();
    altKey(grip(3), 'ArrowDown');
    assertDeepEqual(calls, [['moveRowBefore', { rowId: 3, targetRowId: null }]]);
  });

  test('Alt+↓ an der letzten Geschwisterzeile → kein Kommando', () => {
    const { calls, grip } = setupTree();
    altKey(grip(4), 'ArrowDown');
    altKey(grip(7), 'ArrowDown');
    assertEqual(calls.length, 0);
  });

  test('Tastatur: Index der Vorschau hinter dem Teilbaum der übersprungenen Zeile', () => {
    const { host, calls, grip } = setupTree();
    keys(grip(3), ['Enter', 'ArrowDown']);
    // Ohne Zeile 3: 1, 5, 4, 2, 6, 7 — hinter 4 liegt Index 3.
    assertEqual(host.state.dragPreview.index, 3);
    key(grip(3), 'ArrowUp');
    key(grip(3), 'Enter');
    assertEqual(calls.length, 0);
  });

  test('Vorschau enthält alle ids des Teilbaums', () => {
    const { host, grip } = setupTree();
    keys(grip(1), ['Enter']);
    assertDeepEqual(host.state.dragPreview, { kind: 'tree', index: 0, ids: [1, 3, 5, 4] });
    key(grip(1), 'ArrowDown');
    assertDeepEqual(host.state.dragPreview.ids, [1, 3, 5, 4]);
    key(grip(1), 'Escape');
    assertEqual(host.state.dragPreview, null);
  });

  test('Tastatur: Geschwister zugeklappter Zeilen bleiben erreichbar', () => {
    // Zeile 2 zugeklappt: 6 ist nicht sichtbar.
    const { host, calls, grip } = setupTree([1, 3, 5, 4, 2, 7]);
    keys(grip(1), ['Enter', 'ArrowDown']);
    assertEqual(host.state.dragPreview.index, 4);
    key(grip(1), 'Enter');
    assertDeepEqual(calls, [['moveRowBefore', { rowId: 1, targetRowId: 7 }]]);
  });
});

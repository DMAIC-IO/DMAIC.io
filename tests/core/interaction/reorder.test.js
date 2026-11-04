/**
 * Tests for core/interaction/gestures/reorder.js — Vorgaben für kind
 * 'reorder' an echtem DOM: Startposition, Einfügeindex (Mitte, Anfang,
 * Ende), Gruppenwechsel, Begrenzung des Index, Ansagetext.
 */
import { suite, test, assertEqual, assertDeepEqual, afterEach } from '../../test-utils.js';
import { reorder, groupsOf, itemsOf, maxIndex } from '../../../js/core/interaction/gestures/reorder.js';
import { makeContext } from '../../../js/core/interaction/helpers.js';

let root = null;

/** Zwei Listen nebeneinander: a = x,y,z (je 20 px hoch), b = w. */
function fixture() {
  root = document.createElement('div');
  root.style.cssText = 'position:fixed;left:0;top:0;display:flex;gap:20px;';
  for (const [key, ids] of [['a', ['x', 'y', 'z']], ['b', ['w']]]) {
    const ul = document.createElement('ul');
    ul.dataset.group = key;
    ul.dataset.groupLabel = `Liste ${key.toUpperCase()}`;
    ul.style.cssText = 'margin:0;padding:0;list-style:none;width:100px;min-height:100px;';
    ids.forEach((id, i) => {
      const li = document.createElement('li');
      li.dataset.index = String(i);
      li.dataset.id = id;
      li.style.height = '20px';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'h';
      b.textContent = id;
      li.append(b);
      ul.append(li);
    });
    root.append(ul);
  }
  document.body.append(root);
  return root;
}
const t = (key, p = {}) => `${key}(${Object.entries(p).map(([k, v]) => `${k}=${v}`).join(',')})`;
const A0 = Object.freeze({ group: 'a', index: 0 });

suite('interaction/gestures/reorder', () => {
  afterEach(() => { root?.remove(); root = null; });

  test('groupsOf/itemsOf in DOM-Reihenfolge', () => {
    fixture();
    assertDeepEqual(groupsOf(root).map(g => g.dataset.group), ['a', 'b']);
    assertEqual(itemsOf(groupsOf(root)[0]).length, 3);
  });

  test('start liest Gruppe und Index', () => {
    fixture();
    assertDeepEqual(reorder.start(root.querySelector('[data-id="y"] .h')), { group: 'a', index: 1 });
  });

  test('locate: Anfang, Mitte, Ende der eigenen Gruppe (Endindex)', () => {
    fixture();
    const ctx = makeContext(root);
    assertDeepEqual(reorder.locate({ x: 50, y: 2 }, ctx, A0), { group: 'a', index: 0 });
    assertDeepEqual(reorder.locate({ x: 50, y: 45 }, ctx, A0), { group: 'a', index: 1 });
    assertDeepEqual(reorder.locate({ x: 50, y: 58 }, ctx, A0), { group: 'a', index: 2 });
  });

  test('locate: fremde Gruppe ohne Abzug', () => {
    fixture();
    assertDeepEqual(reorder.locate({ x: 170, y: 15 }, makeContext(root), A0), { group: 'b', index: 1 });
  });

  test('locate: außerhalb jeder Gruppe → null', () => {
    fixture();
    assertEqual(reorder.locate({ x: 500, y: 15 }, makeContext(root), A0), null);
  });

  test('step: ↑↓ Index, ←→ Nachbargruppe, Rand → null', () => {
    fixture();
    const ctx = makeContext(root);
    assertDeepEqual(reorder.step(A0, { x: 0, y: 1 }, ctx, A0), { group: 'a', index: 1 });
    assertDeepEqual(reorder.step({ group: 'a', index: 2 }, { x: 1, y: 0 }, ctx, A0), { group: 'b', index: 2 });
    assertEqual(reorder.step(A0, { x: -1, y: 0 }, ctx, A0), null);
  });

  test('clamp begrenzt auf die Länge (eigene: n−1, fremde: n)', () => {
    fixture();
    const ctx = makeContext(root);
    assertDeepEqual(reorder.clamp({ group: 'a', index: 3 }, ctx, A0), { group: 'a', index: 2 });
    assertDeepEqual(reorder.clamp({ group: 'b', index: 2 }, ctx, A0), { group: 'b', index: 1 });
    assertDeepEqual(reorder.clamp({ group: 'a', index: -1 }, ctx, A0), { group: 'a', index: 0 });
    assertEqual(reorder.clamp({ group: 'q', index: 0 }, ctx, A0), null);
    assertEqual(maxIndex(root, 'b', A0), 1);
  });

  test('announce: Position, beim Gruppenwechsel mit Gruppenname', () => {
    fixture();
    const ctx = makeContext(root);
    assertEqual(reorder.announce({ group: 'a', index: 1 }, t, ctx, A0), 'common.gesture.position(pos=2,total=3)');
    assertEqual(reorder.announce({ group: 'b', index: 0 }, t, ctx, A0),
      'common.gesture.positionInGroup(group=Liste B,pos=1,total=2)');
  });
});

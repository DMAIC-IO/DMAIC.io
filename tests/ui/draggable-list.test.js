import { suite, test, assertEqual } from '../test-utils.js';
import { draggableList, computeDropIndex } from '../../js/ui/draggable-list.js';

/** Build a fake items NodeList from a list of {top,height} rects. */
function fakeItems(rects) {
  return rects.map(r => ({ getBoundingClientRect: () => r }));
}

suite('UI — computeDropIndex (pure pointer→index math)', () => {
  test('empty list → append at 0', () => {
    assertEqual(computeDropIndex(fakeItems([]), 100), 0);
  });

  test('pointer above the first midpoint → index 0', () => {
    const items = fakeItems([{ top: 0, height: 20 }, { top: 20, height: 20 }]);
    assertEqual(computeDropIndex(items, 5), 0); // 5 < 0+10
  });

  test('pointer in the lower half of item 0 → index 1', () => {
    const items = fakeItems([{ top: 0, height: 20 }, { top: 20, height: 20 }]);
    assertEqual(computeDropIndex(items, 15), 1); // 15 >= 10, 15 < 30
  });

  test('pointer below every midpoint → append at length', () => {
    const items = fakeItems([{ top: 0, height: 20 }, { top: 20, height: 20 }]);
    assertEqual(computeDropIndex(items, 999), 2);
  });

  test('exactly on a midpoint counts as below (>= boundary)', () => {
    const items = fakeItems([{ top: 0, height: 20 }]);
    assertEqual(computeDropIndex(items, 10), 1); // 10 < 10 is false
  });
});

suite('UI — draggableList mixin', () => {
  test('isDragOver reflects the active drop target group', () => {
    const c = draggableList({ onReorder() {} });
    assertEqual(c.isDragOver('a'), false);
    c._dragOverGroup = 'a';
    assertEqual(c.isDragOver('a'), true);
    assertEqual(c.isDragOver('b'), false);
  });

  test('dragStart records source identity, adds class, sets effectAllowed', () => {
    let cls = null, effect = null;
    const c = draggableList({ onReorder() {}, draggingClass: 'x-drag' });
    const $event = {
      target: { classList: { add: (n) => { cls = n; }, remove() {} } },
      dataTransfer: { set effectAllowed(v) { effect = v; } },
    };
    c.dragStart('colA', 3, $event);
    assertEqual(c._dragSource.group, 'colA');
    assertEqual(c._dragSource.idx, 3);
    assertEqual(cls, 'x-drag');
    assertEqual(effect, 'move');
  });

  test('dragEnd removes class and resets transient state', () => {
    let removed = null;
    const c = draggableList({ onReorder() {}, draggingClass: 'x-drag' });
    c._dragSource = { group: 'a', idx: 1 };
    c._dragOverGroup = 'a';
    c.dragEnd({ target: { classList: { remove: (n) => { removed = n; } } } });
    assertEqual(removed, 'x-drag');
    assertEqual(c._dragOverGroup, null);
    assertEqual(c._dragSource.group, null);
    assertEqual(c._dragSource.idx, null);
  });

  test('dragOver prevents default, sets dropEffect and the over-group', () => {
    let prevented = false, drop = null;
    const c = draggableList({ onReorder() {} });
    c.dragOver('colB', {
      preventDefault: () => { prevented = true; },
      dataTransfer: { set dropEffect(v) { drop = v; } },
    });
    assertEqual(prevented, true);
    assertEqual(drop, 'move');
    assertEqual(c._dragOverGroup, 'colB');
  });

  test('dragLeave clears the over-group only when pointer truly leaves', () => {
    const c = draggableList({ onReorder() {} });
    c._dragOverGroup = 'colB';
    // relatedTarget is a child → still inside, do not clear
    c.dragLeave('colB', { currentTarget: { contains: () => true }, relatedTarget: {} });
    assertEqual(c._dragOverGroup, 'colB');
    // relatedTarget outside → clear
    c.dragLeave('colB', { currentTarget: { contains: () => false }, relatedTarget: {} });
    assertEqual(c._dragOverGroup, null);
  });

  test('drop ignores when no drag is in progress (source group null)', () => {
    let called = false;
    const c = draggableList({ onReorder() { called = true; } });
    c.drop('colA', {
      preventDefault() {},
      currentTarget: { querySelectorAll: () => [] },
      clientY: 0,
    });
    assertEqual(called, false);
    assertEqual(c._dragOverGroup, null);
  });

  test('drop calls onReorder with source identity + computed target index', () => {
    let move = null;
    const c = draggableList({ onReorder: (m) => { move = m; } });
    c._dragSource = { group: 'src', idx: 2 };
    const items = fakeItems([{ top: 0, height: 20 }, { top: 20, height: 20 }]);
    c.drop('dst', {
      preventDefault() {},
      currentTarget: { querySelectorAll: () => items },
      clientY: 15, // lower half of item 0 → target index 1
    });
    assertEqual(move.sourceGroup, 'src');
    assertEqual(move.sourceIdx, 2);
    assertEqual(move.targetGroup, 'dst');
    assertEqual(move.targetIdx, 1);
    assertEqual(c._dragOverGroup, null);
  });
});

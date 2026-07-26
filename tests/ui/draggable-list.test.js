import { suite, test, assertEqual } from '../test-utils.js';
import {
  draggableList, computeDropIndex, draggableRows,
  DRAGGING_CLASS, DROP_TARGET_CLASS,
} from '../../js/ui/draggable-list.js';

/**
 * Minimal stand-in for a <tr>: records class/attribute changes and answers
 * closest('tr') with itself. `table` is the fake scope returned by
 * closest('table') so the mixin's cleanup pass has something to sweep.
 */
function fakeRow(table = fakeTable()) {
  const classes = new Set();
  const attrs = {};
  const row = {
    classList: {
      add: (...n) => n.forEach(x => classes.add(x)),
      remove: (...n) => n.forEach(x => classes.delete(x)),
      has: (n) => classes.has(n),
    },
    setAttribute: (k, v) => { attrs[k] = v; },
    removeAttribute: (k) => { delete attrs[k]; },
    getAttribute: (k) => attrs[k] ?? null,
    closest: (sel) => (sel === 'tr' ? row : sel === 'table' ? table : null),
    _classes: classes,
    _attrs: attrs,
  };
  table._rows.push(row);
  return row;
}

/** Fake <table> whose querySelectorAll returns rows carrying a given class. */
function fakeTable() {
  const rows = [];
  return {
    _rows: rows,
    querySelectorAll: (sel) => {
      const wanted = sel.split(',').map(s => s.trim().replace(/^\./, ''));
      return rows.filter(r => wanted.some(w => r._classes.has(w)));
    },
  };
}

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

suite('UI — draggableRows mixin (reorderable table rows)', () => {
  test('dragArm arms the owning row, not the grip button', () => {
    const c = draggableRows({ onMove() {} });
    const tr = fakeRow();
    c.dragArm({ target: { closest: (sel) => (sel === 'tr' ? tr : null) } });
    assertEqual(tr.getAttribute('draggable'), 'true');
  });

  test('dragStart records the source id, marks the row and sets effectAllowed', () => {
    let effect = null;
    const c = draggableRows({ onMove() {} });
    const tr = fakeRow();
    c.dragStart('g', 'r1', {
      target: tr,
      dataTransfer: { set effectAllowed(v) { effect = v; } },
    });
    assertEqual(c._dragRow.id, 'r1');
    assertEqual(tr._classes.has(DRAGGING_CLASS), true);
    assertEqual(effect, 'move');
  });

  test('dragEnd disarms the row and clears state across the whole table', () => {
    const c = draggableRows({ onMove() {} });
    const table = fakeTable();
    const dragged = fakeRow(table);
    const other = fakeRow(table);
    dragged.setAttribute('draggable', 'true');
    dragged.classList.add(DRAGGING_CLASS);
    other.classList.add(DROP_TARGET_CLASS);   // stale marker on a different row

    c._dragRow = { group: 'g', id: 'r1' };
    c.dragEnd({ target: dragged });

    assertEqual(c._dragRow.id, null);
    assertEqual(dragged.getAttribute('draggable'), null);
    assertEqual(dragged._classes.has(DRAGGING_CLASS), false);
    assertEqual(other._classes.has(DROP_TARGET_CLASS), false);
  });

  test('dragOver marks the hovered row and unmarks the previous one', () => {
    let prevented = false, drop = null;
    const c = draggableRows({ onMove() {} });
    const table = fakeTable();
    const previous = fakeRow(table);
    const hovered = fakeRow(table);
    previous.classList.add(DROP_TARGET_CLASS);

    c._dragRow = { group: 'g', id: 'src' };
    c.dragOver('g', 'r2', {
      preventDefault: () => { prevented = true; },
      dataTransfer: { set dropEffect(v) { drop = v; } },
      currentTarget: hovered,
    });

    assertEqual(prevented, true);
    assertEqual(drop, 'move');
    assertEqual(previous._classes.has(DROP_TARGET_CLASS), false);
    assertEqual(hovered._classes.has(DROP_TARGET_CLASS), true);
  });

  test('dragOver does not mark the dragged row as its own drop target', () => {
    const c = draggableRows({ onMove() {} });
    const tr = fakeRow();
    c._dragRow = { group: 'g', id: 'r1' };
    c.dragOver('g', 'r1', { preventDefault() {}, currentTarget: tr });
    assertEqual(tr._classes.has(DROP_TARGET_CLASS), false);
  });

  test('dragDrop reports source and target ids', () => {
    let move = null;
    const c = draggableRows({ onMove: (m) => { move = m; } });
    c._dragRow = { group: 'g', id: 'r1' };
    c.dragDrop('g', 'r5', { preventDefault() {}, currentTarget: fakeRow() });
    assertEqual(move.sourceId, 'r1');
    assertEqual(move.targetId, 'r5');
    assertEqual(c._dragRow.id, null);
  });

  test('dropping a row on itself is a no-op', () => {
    let called = false;
    const c = draggableRows({ onMove() { called = true; } });
    c._dragRow = { group: 'g', id: 'r1' };
    c.dragDrop('g', 'r1', { preventDefault() {}, currentTarget: fakeRow() });
    assertEqual(called, false);
  });

  test('dropping with no drag in progress is a no-op', () => {
    let called = false;
    const c = draggableRows({ onMove() { called = true; } });
    c.dragDrop('g', 'r1', { preventDefault() {}, currentTarget: fakeRow() });
    assertEqual(called, false);
  });

  // ── Group isolation (one component, several tables) ──

  test('dragOver ignores a row from a different table', () => {
    let prevented = false;
    const c = draggableRows({ onMove() {} });
    const tr = fakeRow();
    c._dragRow = { group: 'facts', id: 'f1' };
    c.dragOver('experiments', 'x1', {
      preventDefault: () => { prevented = true; },
      currentTarget: tr,
    });
    // No preventDefault means the browser refuses the drop.
    assertEqual(prevented, false);
    assertEqual(tr._classes.has(DROP_TARGET_CLASS), false);
  });

  test('dropping into a different table does not move anything', () => {
    let called = false;
    const c = draggableRows({ onMove() { called = true; } });
    c._dragRow = { group: 'facts', id: 'f1' };
    c.dragDrop('experiments', 'x1', { preventDefault() {}, currentTarget: fakeRow() });
    assertEqual(called, false);
  });

  test('onMove reports which table moved', () => {
    let move = null;
    const c = draggableRows({ onMove: (m) => { move = m; } });
    c._dragRow = { group: 'experiments', id: 'x1' };
    c.dragDrop('experiments', 'x3', { preventDefault() {}, currentTarget: fakeRow() });
    assertEqual(move.group, 'experiments');
    assertEqual(move.sourceId, 'x1');
    assertEqual(move.targetId, 'x3');
  });

  test('rowIds is asked for the group being reordered', () => {
    const asked = [];
    const c = draggableRows({
      onMove() {},
      rowIds: (group) => { asked.push(group); return ['a', 'b']; },
      doc: null,
    });
    c.dragKey('facts', 'b', { key: 'ArrowUp', altKey: true, preventDefault() {} });
    assertEqual(asked[0], 'facts');
  });

  // ── Keyboard ──

  /** draggableRows wired to a fixed id list, recording the moves it requests. */
  function keyboardFixture(ids) {
    const moves = [];
    const c = draggableRows({
      onMove: (m) => { moves.push(m); },
      rowIds: () => ids,
      doc: null,          // no aria-live region in the unit environment
    });
    return { c, moves };
  }

  const keyEvent = (key, altKey = true) => ({ key, altKey, preventDefault() {} });

  test('Alt+ArrowUp moves the row before its predecessor', () => {
    const { c, moves } = keyboardFixture(['a', 'b', 'c']);
    c.dragKey('g', 'c', keyEvent('ArrowUp'));
    assertEqual(moves.length, 1);
    assertEqual(moves[0].sourceId, 'c');
    assertEqual(moves[0].targetId, 'b');
  });

  test('Alt+ArrowDown is expressed as moving the successor up — no append path', () => {
    const { c, moves } = keyboardFixture(['a', 'b', 'c']);
    c.dragKey('g', 'a', keyEvent('ArrowDown'));
    assertEqual(moves.length, 1);
    assertEqual(moves[0].sourceId, 'b');
    assertEqual(moves[0].targetId, 'a');
  });

  test('Alt+ArrowDown on the last row does nothing (no wrap-around)', () => {
    const { c, moves } = keyboardFixture(['a', 'b', 'c']);
    c.dragKey('g', 'c', keyEvent('ArrowDown'));
    assertEqual(moves.length, 0);
  });

  test('Alt+ArrowUp on the first row does nothing (no wrap-around)', () => {
    const { c, moves } = keyboardFixture(['a', 'b', 'c']);
    c.dragKey('g', 'a', keyEvent('ArrowUp'));
    assertEqual(moves.length, 0);
  });

  test('arrow keys without Alt are ignored', () => {
    const { c, moves } = keyboardFixture(['a', 'b', 'c']);
    c.dragKey('g', 'b', keyEvent('ArrowUp', false));
    c.dragKey('g', 'b', keyEvent('ArrowDown', false));
    assertEqual(moves.length, 0);
  });

  test('non-arrow keys are ignored', () => {
    const { c, moves } = keyboardFixture(['a', 'b', 'c']);
    c.dragKey('g', 'b', keyEvent('Enter'));
    assertEqual(moves.length, 0);
  });

  test('an unknown row id is ignored', () => {
    const { c, moves } = keyboardFixture(['a', 'b', 'c']);
    c.dragKey('g', 'zzz', keyEvent('ArrowUp'));
    assertEqual(moves.length, 0);
  });

  test('without rowIds the keyboard is inert (mouse drag still works)', () => {
    let called = false;
    const c = draggableRows({ onMove() { called = true; }, doc: null });
    c.dragKey('g', 'a', keyEvent('ArrowUp'));
    assertEqual(called, false);
  });

  test('a single-row list cannot move in either direction', () => {
    const { c, moves } = keyboardFixture(['only']);
    c.dragKey('g', 'only', keyEvent('ArrowUp'));
    c.dragKey('g', 'only', keyEvent('ArrowDown'));
    assertEqual(moves.length, 0);
  });
});

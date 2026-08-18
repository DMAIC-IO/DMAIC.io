import { suite, test, assertEqual } from '../test-utils.js';
import { chainViewMixin } from '../../js/core/flowchart/flowchart-view.js';

suite('chainViewMixin — shape', () => {
  test('returns object with expected keys', () => {
    const mixin = chainViewMixin(/* module */ null, /* t */ (k) => k);
    ['_draggedStepId', '_activeGap', 'stepDragStart', 'stepDragEnd',
     'isDragging', 'showStartRail', 'showEndRail', 'isGapActive', 'gapClass',
     'gapDragOver', 'gapDragLeave', 'gapDrop',
     'gapDragOverAfter', 'gapDragLeaveAfter', 'gapDropAfter', 'gapClassAfter',
     'autoSize', '_autoSizeAll'].forEach((k) => {
      assertEqual(k in mixin, true);
    });
    assertEqual(mixin._draggedStepId, null);
    assertEqual(mixin._activeGap, null);
    assertEqual(typeof mixin.stepDragStart, 'function');
    assertEqual(typeof mixin.autoSize, 'function');
  });

  test('the card-on-card drop handlers are gone', () => {
    const mixin = chainViewMixin(null, (k) => k);
    ['stepDragOver', 'stepDragLeave', 'stepDrop'].forEach((k) => {
      assertEqual(k in mixin, false);
    });
  });

  test('stepDragStart records the id', () => {
    const mixin = chainViewMixin(null, (k) => k);
    const fakeEvt = { dataTransfer: { setData() {}, effectAllowed: '' }, target: null };
    mixin.stepDragStart('abc', fakeEvt);
    assertEqual(mixin._draggedStepId, 'abc');
  });

  test('stepDragEnd clears the id and the active gap', () => {
    const mixin = chainViewMixin(null, (k) => k);
    const fakeEvt = { dataTransfer: { setData() {}, effectAllowed: '' }, target: null };
    mixin.stepDragStart('abc', fakeEvt);
    mixin._activeGap = 2;
    mixin.stepDragEnd({ target: null });
    assertEqual(mixin._draggedStepId, null);
    assertEqual(mixin._activeGap, null);
  });
});

suite('chainViewMixin — gap drops', () => {
  /** Mixin plus a stub model, mirroring the substep suite's ctx(). */
  function ctx(state) {
    return Object.assign(Object.create(null), chainViewMixin(null, (k) => k), { model: state });
  }
  const dragEvt = () => ({ dataTransfer: { setData() {}, effectAllowed: '' }, target: null });
  const overEvt = () => {
    let prevented = false;
    return {
      dataTransfer: { dropEffect: '' },
      preventDefault() { prevented = true; },
      get prevented() { return prevented; },
    };
  };

  test('gapDragOver marks the gap and accepts the drop, but only during a drag', () => {
    const c = ctx({ steps: [], moveStepToGap: () => true });
    const idle = overEvt();
    c.gapDragOver(1, idle);
    assertEqual(c._activeGap, null);
    assertEqual(idle.prevented, false);

    c.stepDragStart('s1', dragEvt());
    const live = overEvt();
    c.gapDragOver(1, live);
    assertEqual(c._activeGap, 1);
    assertEqual(live.prevented, true);
    assertEqual(live.dataTransfer.dropEffect, 'move');
  });

  test('gapDragLeave only clears the gap it was called for', () => {
    const c = ctx({ steps: [], moveStepToGap: () => true });
    c.stepDragStart('s1', dragEvt());
    c.gapDragOver(2, overEvt());
    c.gapDragLeave(1, overEvt());
    assertEqual(c._activeGap, 2);
    c.gapDragLeave(2, overEvt());
    assertEqual(c._activeGap, null);
  });

  test('gapDrop hands the gap index to the model and resets the drag state', () => {
    const moves = [];
    const c = ctx({ steps: [], moveStepToGap: (f, g) => { moves.push([f, g]); return true; } });
    c.stepDragStart('s1', dragEvt());
    c.gapDragOver(3, overEvt());
    c.gapDrop(3, overEvt());
    assertEqual(moves.length, 1);
    assertEqual(moves[0].join(','), 's1,3');
    assertEqual(c._draggedStepId, null);
    assertEqual(c._activeGap, null);
  });

  test('gapDrop without a drag in flight does nothing', () => {
    let called = 0;
    const c = ctx({ steps: [], moveStepToGap: () => { called++; return true; } });
    c.gapDrop(1, overEvt());
    assertEqual(called, 0);
  });

  test('the …After variants address the gap behind the step', () => {
    const moves = [];
    const c = ctx({ steps: [], moveStepToGap: (f, g) => { moves.push([f, g]); return true; } });
    c.stepDragStart('s1', dragEvt());
    c.gapDragOverAfter(2, overEvt());
    assertEqual(c._activeGap, 3);
    c.gapDragLeaveAfter(2, overEvt());
    assertEqual(c._activeGap, null);
    c.gapDropAfter(2, overEvt());
    assertEqual(moves[0].join(','), 's1,3');
  });

  test('gapClass is empty when idle and marks the hovered gap while dragging', () => {
    const c = ctx({ steps: [], moveStepToGap: () => true });
    assertEqual(c.gapClass(1), '');
    c.stepDragStart('s1', dragEvt());
    assertEqual(c.gapClass(1), 'fc-connector--drop');
    c.gapDragOver(1, overEvt());
    assertEqual(c.gapClass(1), 'fc-connector--drop is-drop-target');
    assertEqual(c.gapClass(2), 'fc-connector--drop');
    assertEqual(c.gapClassAfter(0), 'fc-connector--drop is-drop-target');
  });

  test('the rails exist only during a drag, at the two ends of the chain', () => {
    const c = ctx({ steps: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], moveStepToGap: () => true });
    assertEqual(c.isDragging(), false);
    assertEqual(c.showStartRail(0), false);
    assertEqual(c.showEndRail(2), false);

    c.stepDragStart('a', dragEvt());
    assertEqual(c.isDragging(), true);
    assertEqual(c.showStartRail(0), true);
    assertEqual(c.showStartRail(1), false);
    assertEqual(c.showEndRail(2), true);
    assertEqual(c.showEndRail(1), false);
  });
});

suite('chainViewMixin — stepNum', () => {
  test('zero-pads the 1-based chain position', () => {
    const m = chainViewMixin(null, (k) => k);
    assertEqual(m.stepNum(0), '01');
    assertEqual(m.stepNum(8), '09');
  });

  test('does not pad beyond two digits', () => {
    const m = chainViewMixin(null, (k) => k);
    assertEqual(m.stepNum(9), '10');
    assertEqual(m.stepNum(99), '100');
  });
});

suite('chainViewMixin — substeps', () => {
  function ctx(state) {
    return Object.assign(Object.create(null), chainViewMixin(null, (k) => k), { model: state });
  }

  test('substepNum builds a hierarchical label', () => {
    const m = chainViewMixin(null, (k) => k);
    assertEqual(m.substepNum(1, 2), '2.3');
  });

  test('substepsBarLabel appends the count only when non-empty', () => {
    const m = chainViewMixin(null, (k) => k);
    assertEqual(m.substepsBarLabel({ substeps: [] }), 'substepsLabel');
    assertEqual(m.substepsBarLabel({ substeps: [1, 2] }), 'substepsLabel (2)');
    assertEqual(m.substepsBarLabel(undefined), 'substepsLabel');
  });

  test('subDrop reorders within one parent and ignores cross-parent drops', () => {
    const moves = [];
    const c = ctx({ moveSubstep: (p, f, t) => { moves.push([p, f, t]); return true; } });
    const evt = () => ({ preventDefault() {}, stopPropagation() {}, currentTarget: { classList: { remove() {} } } });

    c.subDragStart('p1', 's1', { stopPropagation() {}, target: {} });
    c.subDrop('p1', 's2', evt());
    assertEqual(moves.length, 1);
    assertEqual(moves[0].join(','), 'p1,s1,s2');

    // A drop on a different parent must not move anything.
    c.subDragStart('p1', 's1', { stopPropagation() {}, target: {} });
    c.subDrop('p2', 's9', evt());
    assertEqual(moves.length, 1);
  });

  test('subDrop on the dragged substep itself is a no-op', () => {
    let called = 0;
    const c = ctx({ moveSubstep: () => { called++; return true; } });
    const evt = () => ({ preventDefault() {}, stopPropagation() {}, currentTarget: { classList: { remove() {} } } });
    c.subDragStart('p1', 's1', { stopPropagation() {}, target: {} });
    c.subDrop('p1', 's1', evt());
    assertEqual(called, 0);
  });

  test('toggleSubsteps/addSubstep/removeSubstep delegate to the model', () => {
    const calls = [];
    const c = ctx({
      toggleSubsteps: (id) => calls.push(['toggle', id]),
      addSubstep: (id) => calls.push(['add', id]),
      removeSubstep: (p, s) => calls.push(['remove', p, s]),
    });
    c.toggleSubsteps('a'); c.addSubstep('a'); c.removeSubstep('a', 'b');
    assertEqual(calls.map((x) => x[0]).join(','), 'toggle,add,remove');
  });
});

suite('chainViewMixin — autoSize', () => {
  test('adds the borders back under box-sizing: border-box', () => {
    // scrollHeight is the CONTENT height; assigning it verbatim to `height`
    // under border-box clips the last line by the border width.
    const el = document.createElement('textarea');
    el.style.boxSizing = 'border-box';
    el.style.border = '1px solid black';
    el.style.width = '120px';
    el.value = 'eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf';
    document.body.appendChild(el);
    try {
      const m = chainViewMixin(null, (k) => k);
      m.autoSize({ target: el });
      assertEqual(el.clientHeight >= el.scrollHeight, true);
    } finally {
      el.remove();
    }
  });
});

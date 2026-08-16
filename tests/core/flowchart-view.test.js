import { suite, test, assertEqual } from '../test-utils.js';
import { chainViewMixin } from '../../js/core/flowchart/flowchart-view.js';

suite('chainViewMixin — shape', () => {
  test('returns object with expected keys', () => {
    const mixin = chainViewMixin(/* module */ null, /* t */ (k) => k);
    ['_draggedStepId', 'stepDragStart', 'stepDragOver', 'stepDragLeave',
     'stepDrop', 'stepDragEnd', 'autoSize', '_autoSizeAll'].forEach((k) => {
      assertEqual(k in mixin, true);
    });
    assertEqual(mixin._draggedStepId, null);
    assertEqual(typeof mixin.stepDragStart, 'function');
    assertEqual(typeof mixin.autoSize, 'function');
  });

  test('stepDragStart records the id', () => {
    const mixin = chainViewMixin(null, (k) => k);
    const fakeEvt = { dataTransfer: { setData() {}, effectAllowed: '' }, target: null };
    mixin.stepDragStart('abc', fakeEvt);
    assertEqual(mixin._draggedStepId, 'abc');
  });

  test('stepDragEnd clears the id', () => {
    const mixin = chainViewMixin(null, (k) => k);
    const fakeEvt = { dataTransfer: { setData() {}, effectAllowed: '' }, target: null };
    mixin.stepDragStart('abc', fakeEvt);
    mixin.stepDragEnd({ target: null });
    assertEqual(mixin._draggedStepId, null);
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

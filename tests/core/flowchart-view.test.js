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

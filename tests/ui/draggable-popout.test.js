import { suite, test, assertEqual } from '../test-utils.js';
import { draggablePopout } from '../../js/ui/draggable-popout.js';

// Bind mixin methods to a plain object (stand-in for the Alpine component proxy).
function mount(options) {
  const ctx = draggablePopout(options);
  return ctx;
}

suite('UI — draggablePopout mixin', () => {
  test('popoutStyle returns size + initial position before any drag', () => {
    const c = mount();
    assertEqual(c.popoutStyle(), 'width:520px;height:auto;max-height:80vh;left:calc(50% - 260px);top:60px');
  });

  test('custom size and initialPosition are honoured', () => {
    const c = mount({ size: 'width:380px;', initialPosition: 'left:10px;top:20px' });
    assertEqual(c.popoutStyle(), 'width:380px;left:10px;top:20px');
  });

  test('popoutStyle switches to pixel position once dragged', () => {
    const c = mount();
    c._popLeft = 100;
    c._popTop = 40;
    assertEqual(c.popoutStyle(), 'width:520px;height:auto;max-height:80vh;left:100px;top:40px');
  });

  test('popoutResetPosition restores the centred default', () => {
    const c = mount();
    c._popLeft = 100; c._popTop = 40; c._popDragging = true;
    c.popoutResetPosition();
    assertEqual(c._popLeft, null);
    assertEqual(c._popTop, null);
    assertEqual(c._popDragging, false);
    assertEqual(c.popoutStyle().includes('calc(50% - 260px)'), true);
  });

  test('drag start records the grab offset and arms dragging', () => {
    const c = mount();
    const win = { offsetLeft: 50, offsetTop: 60, matches: () => false };
    const $event = {
      clientX: 70, clientY: 90,
      target: { closest: () => null },
      currentTarget: { closest: (sel) => (sel === '.dmike-chart-popout' ? win : null) },
    };
    c.popoutDragStart($event);
    assertEqual(c._popDragging, true);
    assertEqual(c._popOffX, 20); // 70 - 50
    assertEqual(c._popOffY, 30); // 90 - 60
  });

  test('drag start is ignored when grabbing the close button', () => {
    const c = mount();
    const $event = {
      clientX: 0, clientY: 0,
      target: { closest: (sel) => (sel === '.dmike-chart-popout-close' ? {} : null) },
      currentTarget: { closest: () => ({ offsetLeft: 0, offsetTop: 0 }) },
    };
    c.popoutDragStart($event);
    assertEqual(c._popDragging, false);
  });

  test('drag move updates position only while dragging', () => {
    const c = mount();
    c.popoutDragMove({ clientX: 999, clientY: 999 }); // not dragging → ignored
    assertEqual(c._popLeft, null);

    c._popDragging = true;
    c._popOffX = 20; c._popOffY = 30;
    c.popoutDragMove({ clientX: 200, clientY: 150 });
    assertEqual(c._popLeft, 180); // 200 - 20
    assertEqual(c._popTop, 120);  // 150 - 30
  });

  test('drag end disarms dragging', () => {
    const c = mount();
    c._popDragging = true;
    c.popoutDragEnd();
    assertEqual(c._popDragging, false);
  });
});

/**
 * Tests for js/core/event-bus.js
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { EventBus } from '../../js/core/event-bus.js';

suite('EventBus', () => {
  test('on/emit: handler receives arguments', () => {
    const bus = new EventBus();
    let received = null;
    bus.on('test', (val) => { received = val; });
    bus.emit('test', 42);
    assertEqual(received, 42);
  });

  test('off: unsubscribed handler is not called', () => {
    const bus = new EventBus();
    let called = false;
    const fn = () => { called = true; };
    bus.on('test', fn);
    bus.off('test', fn);
    bus.emit('test');
    assertEqual(called, false);
  });

  test('once: handler auto-unsubscribes after first call', () => {
    const bus = new EventBus();
    let count = 0;
    bus.once('test', () => { count++; });
    bus.emit('test');
    bus.emit('test');
    assertEqual(count, 1);
  });

  test('emit: multiple handlers for same event all called', () => {
    const bus = new EventBus();
    let a = 0, b = 0;
    bus.on('test', () => a++);
    bus.on('test', () => b++);
    bus.emit('test');
    assertEqual(a, 1);
    assertEqual(b, 1);
  });

  test('emit: error in one handler does not prevent others', () => {
    const bus = new EventBus();
    let second = false;
    bus.on('test', () => { throw new Error('boom'); });
    bus.on('test', () => { second = true; });
    bus.emit('test');
    assertEqual(second, true);
  });
});

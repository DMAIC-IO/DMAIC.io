/**
 * Tests for core/interaction/wait.js — waitForCommand filtert
 * command:executed nach Instanz, Kommando und Argumenten.
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { EventBus } from '../../../js/core/event-bus.js';
import { waitForCommand } from '../../../js/core/interaction/wait.js';

const ev = (instanceId, command, args) => ({ instanceId, command, args, result: true });
const listeners = (bus) => bus._listeners.get('command:executed')?.size ?? 0;

suite('interaction/wait — waitForCommand', () => {
  test('löst beim ersten passenden Ereignis auf', async () => {
    const bus = new EventBus();
    const p = waitForCommand(bus, { command: 'moveItem' });
    bus.emit('command:executed', ev('i1', 'other', {}));
    bus.emit('command:executed', ev('i1', 'moveItem', { to: 'b' }));
    const got = await p;
    assertEqual(got.command, 'moveItem');
    assertEqual(got.args.to, 'b');
  });

  test('Filter instance', async () => {
    const bus = new EventBus();
    const p = waitForCommand(bus, { instance: 'i2' });
    bus.emit('command:executed', ev('i1', 'x', {}));
    bus.emit('command:executed', ev('i2', 'x', {}));
    assertEqual((await p).instanceId, 'i2');
  });

  test('Filter where: flacher Teilvergleich', async () => {
    const bus = new EventBus();
    const p = waitForCommand(bus, { where: { to: 'b', pos: { i: 1 } } });
    bus.emit('command:executed', ev('i1', 'm', { to: 'a', pos: { i: 1 } }));
    bus.emit('command:executed', ev('i1', 'm', { to: 'b', pos: { i: 2 } }));
    bus.emit('command:executed', ev('i1', 'm', { to: 'b', pos: { i: 1 }, extra: 9 }));
    assertEqual((await p).args.extra, 9);
  });

  test('meldet sich nach dem Treffer ab', async () => {
    const bus = new EventBus();
    const p = waitForCommand(bus, {});
    assertEqual(listeners(bus), 1);
    bus.emit('command:executed', ev('i', 'c', {}));
    await p;
    assertEqual(listeners(bus), 0);
  });

  test('Ablauf → reject und abgemeldet', async () => {
    const bus = new EventBus();
    let error = null;
    try { await waitForCommand(bus, { command: 'never', timeout: 10 }); } catch (e) { error = e; }
    assertTrue(error instanceof Error);
    assertTrue(/timeout after 10 ms \(never\)/.test(error.message));
    assertEqual(listeners(bus), 0);
  });
});

/**
 * Asynchrone Abläufe (core/async-task.js) — Lebenszyklus mit steuerbaren Promises.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertThrows } from '../test-utils.js';
import { asyncTask, isAsyncTask, checkAsyncTasks, defineAsyncTaskSlots, createAsyncTasks } from '../../js/core/async-task.js';
import { createReactivity } from './fake-reactivity.js';

const flush = () => new Promise((r) => setTimeout(r, 0));
function deferred() {
  let resolve; let reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
const abortError = () => new DOMException('aborted', 'AbortError');
/** Ein Lauf, der auf `gate` wartet und beim Abbruch mit AbortError endet. */
const waitFor = (gate, signal) => new Promise((resolve, reject) => {
  gate.promise.then(resolve, reject);
  signal.addEventListener('abort', () => reject(abortError()));
});

function setup(defs, { model = { a: 1, b: 10 } } = {}) {
  const rx = createReactivity();
  const comp = { model };
  defineAsyncTaskSlots(comp, Object.keys(defs));
  const vm = rx.reactive(comp);
  const notified = [];
  const host = createAsyncTasks({
    defs, vm, reactivity: rx,
    checkArgs: (name, params, args) => {
      const given = args ?? {};
      for (const k of Object.keys(given)) if (!Object.hasOwn(params, k)) throw new Error(`invalid ${name} param ${k}`);
      return { ...given };
    },
    notify: (m) => notified.push(m),
  });
  return { vm, host, notified, rx };
}

suite('asyncTask: Deklaration', () => {
  test('Fabrik prüft run, auto, params, blocked', () => {
    assertThrows(() => asyncTask({}), /run must be a function/);
    assertThrows(() => asyncTask({ auto: 'ja', run() {} }), /auto must be a boolean/);
    assertThrows(() => asyncTask({ auto: true, params: { n: {} }, run() {} }), /auto takes no params/);
    assertThrows(() => asyncTask({ auto: true, blocked() { return null; }, run() {} }), /auto takes no blocked/);
    const t = asyncTask({ run() {} });
    assertTrue(isAsyncTask(t));
    assertEqual(t.auto, false);
    assertDeepEqual({ ...t.params }, {});
    assertTrue(Object.isFrozen(t));
  });
  test('checkAsyncTasks: kein asyncTask(), Kollision', () => {
    assertThrows(() => checkAsyncTasks('m', { x: { run() {} } }, {}), /m: asyncTasks.x is not an asyncTask\(\)/);
    assertThrows(() => checkAsyncTasks('m', { x: asyncTask({ run() {} }) }, { x: 'computed' }), /m: asyncTask x collides with computed/);
  });
  test('Wert ist nur lesbar', () => {
    const comp = {};
    defineAsyncTaskSlots(comp, ['x']);
    assertEqual(comp.x, null);
    assertThrows(() => { comp.x = 1; }, /asyncTask x is read-only/);
    assertDeepEqual({ ...comp._asyncTasks.x }, { running: false, progress: null, error: null, value: null });
  });
});

suite('asyncTask: manueller Lauf', () => {
  test('Start, Status, Wert, Ende', async () => {
    const gate = deferred();
    const { vm, host } = setup({ calc: asyncTask({ async run(_a, { signal }) { await waitFor(gate, signal); return this.model.a + 1; } }) });
    const done = host.start('calc');
    assertEqual(vm._asyncTasks.calc.running, true);
    assertEqual(vm._asyncTasks.calc.progress, null);
    gate.resolve();
    assertDeepEqual(await done, { status: 'done', value: 2 });
    assertEqual(vm.calc, 2);
    assertEqual(vm._asyncTasks.calc.running, false);
  });
  test('Doppelstart wird abgewiesen, der erste Lauf läuft weiter', async () => {
    const gate = deferred();
    const { host } = setup({ calc: asyncTask({ async run(_a, { signal }) { await waitFor(gate, signal); return 1; } }) });
    const first = host.start('calc');
    const second = await host.start('calc');
    assertEqual(second.status, 'rejected');
    assertTrue(/already running/.test(second.reason));
    gate.resolve();
    assertEqual((await first).status, 'done');
  });
  test('blocked() verhindert den Start mit seinem Grund', async () => {
    let reason = 'zu wenig Daten';
    let runs = 0;
    const { host } = setup({ calc: asyncTask({ blocked() { return reason; }, run() { runs += 1; return 1; } }) });
    assertEqual(host.blockedReason('calc'), 'zu wenig Daten');
    assertDeepEqual(await host.start('calc'), { status: 'rejected', reason: 'zu wenig Daten' });
    reason = null;
    assertEqual((await host.start('calc')).status, 'done');
    assertEqual(runs, 1);
  });
  test('Parameter werden vor dem Start geprüft', async () => {
    let runs = 0;
    const { host } = setup({ calc: asyncTask({ params: { n: {} }, run({ n }) { runs += 1; return n; } }) });
    const bad = await host.start('calc', { zz: 1 });
    assertEqual(bad.status, 'rejected');
    assertTrue(/invalid calc param zz/.test(bad.reason));
    assertDeepEqual(await host.start('calc', { n: 3 }), { status: 'done', value: 3 });
    assertEqual(runs, 1);
  });
  test('Abbruch: kein Fehler, alter Wert bleibt, spätes Ergebnis verworfen', async () => {
    const { vm, host, notified } = setup({ calc: asyncTask({ async run(_a, { signal }) {
      const g = deferred(); host._lastGate = g; await waitFor(g, signal); return this.model.a;
    } }) });
    const p1 = host.start('calc'); host._lastGate.resolve(); await p1;
    assertEqual(vm.calc, 1);
    vm.model.a = 5;
    const p2 = host.start('calc');
    assertEqual(host.cancel('calc'), true);
    assertDeepEqual(await p2, { status: 'cancelled' });
    assertEqual(vm._asyncTasks.calc.running, false);
    assertEqual(vm.calc, 1);
    assertEqual(vm._asyncTasks.calc.error, null);
    assertDeepEqual(notified, []);
    assertEqual(host.cancel('calc'), false);
  });
  test('Abbruch eines Laufs, der das Signal übergeht: Ergebnis verworfen', async () => {
    const gate = deferred();
    const { vm, host } = setup({ calc: asyncTask({ async run() { await gate.promise; return 42; } }) });
    const p = host.start('calc');
    host.cancel('calc');
    gate.resolve();
    assertDeepEqual(await p, { status: 'cancelled' });
    await flush();
    assertEqual(vm.calc, null);
  });
  test('Fehler: Wert null, error mit Meldung, notify bei manuellem Task', async () => {
    const { vm, host, notified } = setup({ calc: asyncTask({ async run() { throw new Error('kaputt'); } }) });
    const out = await host.start('calc');
    assertEqual(out.status, 'failed');
    assertEqual(out.error.message, 'kaputt');
    assertEqual(vm.calc, null);
    assertEqual(vm._asyncTasks.calc.error, 'kaputt');
    assertDeepEqual(notified, ['kaputt']);
  });
  test('synchroner Wurf in run zählt als Fehler', async () => {
    const { host } = setup({ calc: asyncTask({ run() { throw new Error('sofort'); } }) });
    assertEqual((await host.start('calc')).status, 'failed');
  });
  test('Fortschritt: geklemmt, null zu Beginn und am Ende', async () => {
    const gate = deferred();
    let report;
    const { vm, host } = setup({ calc: asyncTask({ async run(_a, { signal, progress }) { report = progress; await waitFor(gate, signal); return 1; } }) });
    const p = host.start('calc');
    assertEqual(vm._asyncTasks.calc.progress, null);
    report(0.5); assertEqual(vm._asyncTasks.calc.progress, 0.5);
    report(7); assertEqual(vm._asyncTasks.calc.progress, 1);
    report(-1); assertEqual(vm._asyncTasks.calc.progress, 0);
    report(Number.NaN); assertEqual(vm._asyncTasks.calc.progress, 0);
    gate.resolve(); await p;
    assertEqual(vm._asyncTasks.calc.progress, null);
    report(0.3);
    assertEqual(vm._asyncTasks.calc.progress, null, 'Meldung eines beendeten Laufs zählt nicht');
  });
  test('Start eines auto-Tasks wirft', () => {
    const { host } = setup({ live: asyncTask({ auto: true, run() { return 1; } }) });
    assertThrows(() => host.start('live'), /live is an auto task/);
    host.release();
  });
  test('unbekannter Task wirft', () => {
    const { host } = setup({ calc: asyncTask({ run() { return 1; } }) });
    assertThrows(() => host.start('nope'), /nope/);
  });
});

suite('asyncTask: auto', () => {
  test('startet beim Aufbau, liest bis zum ersten await als Abhängigkeit', async () => {
    const gates = [];
    let starts = 0;
    const { vm, host } = setup({ live: asyncTask({ auto: true, async run(_a, { signal }) {
      starts += 1;
      const a = this.model.a;
      const g = deferred(); gates.push(g);
      await waitFor(g, signal);
      return a + this.model.b;
    } }) });
    assertEqual(starts, 1);
    gates.shift().resolve(); await flush();
    assertEqual(vm.live, 11);
    vm.model.b = 20; await flush();
    assertEqual(starts, 1, 'b wird erst nach dem await gelesen');
    vm.model.a = 2; await flush();
    assertEqual(starts, 2);
    gates.shift().resolve(); await flush();
    assertEqual(vm.live, 22);
    host.release();
  });
  test('Neustart bricht ab; ältere Läufe, die später enden, kommen nicht an', async () => {
    const gates = [];
    const { vm, host } = setup({ live: asyncTask({ auto: true, async run() {
      const a = this.model.a; const g = deferred(); gates.push(g); await g.promise; return a;
    } }) });
    vm.model.a = 2; await flush();
    vm.model.a = 3; await flush();
    assertEqual(gates.length, 3);
    gates[2].resolve(); await flush();
    gates[0].resolve(); gates[1].resolve(); await flush();
    assertEqual(vm.live, 3);
    host.release();
  });
  test('fünf Änderungen in einem Tick: ein Neustart', async () => {
    let starts = 0;
    const { vm, host } = setup({ live: asyncTask({ auto: true, run() { starts += 1; return this.model.a; } }) });
    for (let i = 0; i < 5; i++) vm.model.a = 10 + i;
    await flush();
    assertEqual(starts, 2);
    assertEqual(vm.live, 14);
    host.release();
  });
  test('Fehler eines auto-Tasks: error gesetzt, keine Meldung', async () => {
    const { vm, host, notified } = setup({ live: asyncTask({ auto: true, async run() { throw new Error('nein'); } }) });
    await flush();
    assertEqual(vm._asyncTasks.live.error, 'nein');
    assertEqual(vm.live, null);
    assertDeepEqual(notified, []);
    host.release();
  });
  test('settle wartet auf laufende auto-Tasks', async () => {
    const gate = deferred();
    const { vm, host } = setup({ live: asyncTask({ auto: true, async run() { await gate.promise; return 7; } }) });
    const settled = host.settle(1000);
    gate.resolve();
    assertEqual(await settled, true);
    assertEqual(vm.live, 7);
    host.release();
  });
  test('settle mit Zeitgrenze kehrt mit false zurück', async () => {
    const { host } = setup({ live: asyncTask({ auto: true, run() { return new Promise(() => {}); } }) });
    assertEqual(await host.settle(5), false);
    host.release();
  });
  test('readStatus: value nur bei auto', async () => {
    const { host } = setup({
      calc: asyncTask({ run() { return 1; } }),
      live: asyncTask({ auto: true, run() { return { n: 2 }; } }),
    });
    await flush();
    assertDeepEqual(host.readStatus(), {
      calc: { running: false, progress: null, error: null },
      live: { running: false, progress: null, error: null, value: { n: 2 } },
    });
    host.release();
  });
});

suite('asyncTask: Abbau', () => {
  test('release bricht ab, verwirft späte Ergebnisse, gibt Beobachter frei', async () => {
    const gate = deferred();
    let starts = 0;
    const { vm, host } = setup({
      calc: asyncTask({ async run(_a, { signal }) { await waitFor(gate, signal); return 1; } }),
      live: asyncTask({ auto: true, async run() { starts += 1; const a = this.model.a; await gate.promise; return a; } }),
    });
    const p = host.start('calc');
    host.release();
    assertDeepEqual(await p, { status: 'cancelled' });
    gate.resolve(); await flush();
    assertEqual(vm.live, null);
    vm.model.a = 5; await flush();
    assertEqual(starts, 1);
    assertEqual((await host.start('calc')).status, 'rejected');
  });
});

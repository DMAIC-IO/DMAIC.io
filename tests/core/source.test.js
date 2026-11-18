/**
 * Leser Source (core/source.js) — im Browser (Alpine).
 */
import Alpine from '../../vendor/alpinejs/csp.js';
import { suite, test, assertEqual, assertThrows } from '../test-utils.js';
import { createSource, registerReader, installWorksheetRevisions } from '../../js/core/source.js';
import { readWorksheetState } from '../helpers/legacy-worksheet-read.js';
import { defineComputedSlots, bindComputed } from '../../js/core/computed.js';
import { worksheetChanged } from '../../js/modules/worksheet/viewmodel/changed.js';

// Mikrotask-Drain statt Timer: kein rAF/Timer eines anderen Tests mischt sich ein.
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const frame = () => new Promise((r) => requestAnimationFrame(r));

function fakeBus() {
  const handlers = {};
  return {
    on(ev, fn) { (handlers[ev] ??= []).push(fn); },
    emit(ev, payload) { for (const fn of handlers[ev] ?? []) fn(payload); },
  };
}

function project(states) {
  const sm = { get: (path) => (path === 'phases' ? { data: Object.keys(states).map((instanceId) => ({ instanceId, moduleId: 'worksheet' })) } : undefined) };
  registerReader(sm, (id, o) => readWorksheetState(states[id] ?? null, o));
  return sm;
}

suite('Source', () => {
  test('read ruft touch(instanceId): Effekt rechnet nach worksheet:dataChanged neu', async () => {
    const bus = fakeBus();
    installWorksheetRevisions(bus);
    const states = { ws1: { sheets: [{ id: 's1', state: { rowCount: 1, columns: [{ id: 'c1', values: [1] }] } }] } };
    const src = createSource(project(states));
    let runs = 0;
    const runner = Alpine.effect(() => { src.read('ws1', { sheetId: 's1' }); runs++; });
    assertEqual(runs, 1);
    bus.emit('worksheet:dataChanged', { instanceId: 'ws1' });
    await flush();
    assertEqual(runs, 2);
    Alpine.release(runner);
  });

  test('worksheetChanged: eine Ableitung über src.read ist sofort veraltet und liest neu, vor dem Frame des Ereignisses', async () => {
    const bus = fakeBus();
    installWorksheetRevisions(bus);
    const emitted = [];
    bus.on('worksheet:dataChanged', (p) => emitted.push(p.instanceId));
    const states = { wsSync: { sheets: [{ id: 's1', state: { rowCount: 1, columns: [{ id: 'c1', roleManual: false, values: [1] }] } }] } };
    const src = createSource(project(states));
    const comp = {};
    defineComputedSlots(comp, ['confirmed']);
    const vm = Alpine.reactive(comp);
    const release = bindComputed(Alpine, vm, {
      confirmed() { return src.read('wsSync', { sheetId: 's1' }).columns[0].roleConfirmed; },
    });
    assertEqual(vm.confirmed, false);
    // Wie ein Kommando des Arbeitsblatts: erst der Stand, dann die Meldung.
    states.wsSync.sheets[0].state.columns[0].roleManual = true;
    worksheetChanged('setColumnRole', { instanceId: 'wsSync', eventBus: bus });
    assertEqual(vm._computedCells.confirmed.dirty, true);
    assertEqual(vm.confirmed, true);
    assertEqual(emitted.length, 0, 'das Ereignis kommt erst im nächsten Frame');
    await frame();
    assertEqual(emitted.length, 1, 'genau ein Ereignis nach dem Frame');
    release();
  });

  test('worksheetChanged: Ansichtskommandos erhöhen den Zähler nicht', () => {
    const bus = fakeBus();
    installWorksheetRevisions(bus);
    const states = { wsView: { sheets: [{ id: 's1', state: { rowCount: 1, columns: [{ id: 'c1', values: [1] }] } }] } };
    const src = createSource(project(states));
    const comp = {};
    defineComputedSlots(comp, ['rows']);
    const vm = Alpine.reactive(comp);
    const release = bindComputed(Alpine, vm, { rows() { return src.read('wsView', { sheetId: 's1' }).rowCount; } });
    assertEqual(vm.rows, 1);
    worksheetChanged('switchSheet', { instanceId: 'wsView', eventBus: bus });
    assertEqual(vm._computedCells.rows.dirty, false);
    release();
  });

  test("list hängt an '#list': module:added rechnet neu", async () => {
    const bus = fakeBus();
    installWorksheetRevisions(bus);
    const src = createSource(project({ ws1: null }));
    let runs = 0;
    const runner = Alpine.effect(() => { src.list(); runs++; });
    bus.emit('module:added', { moduleId: 'worksheet' });
    await flush();
    assertEqual(runs, 2);
    Alpine.release(runner);
  });

  test('list nennt die Instanzen des Projekts', () => {
    const src = createSource(project({ ws1: null, ws2: null }));
    assertEqual(src.list().map((i) => i.instanceId).join(), 'ws1,ws2');
  });

  test('createSource ohne registrierten Leser wirft', () => {
    assertThrows(() => createSource({ get: () => ({}) }), /reader not registered/);
  });
});

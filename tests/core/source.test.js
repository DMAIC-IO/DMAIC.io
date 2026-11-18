/**
 * Leser Source (core/source.js) — im Browser (Alpine).
 */
import Alpine from '../../vendor/alpinejs/csp.js';
import { suite, test, assertEqual, assertThrows } from '../test-utils.js';
import { createSource, registerReader, installWorksheetRevisions } from '../../js/core/source.js';
import { readWorksheetState } from '../helpers/legacy-worksheet-read.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

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

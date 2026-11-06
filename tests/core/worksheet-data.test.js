/**
 * Reaktiver Lesezugriff auf Arbeitsblätter (core/worksheet-data.js) — im Browser (Alpine).
 */
import Alpine from '../../vendor/alpinejs/csp.js';
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { installWorksheetRevisions, createWorksheetData } from '../../js/core/worksheet-data.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

function fakeBus() {
  const handlers = {};
  return {
    on(ev, fn) { (handlers[ev] ??= []).push(fn); },
    off(ev, fn) { handlers[ev] = (handlers[ev] ?? []).filter((h) => h !== fn); },
    emit(ev, payload) { for (const fn of handlers[ev] ?? []) fn(payload); },
  };
}

function fakeStore(states) {
  return { getModuleState: (id) => states[id] ?? null };
}

const sheet = (values) => ({ sheets: [{ id: 's1', state: { columns: [{ id: 'c1', name: 'Gewicht', shortName: 'G', values }] } }] });

suite('ctx.data', () => {
  test('values, numeric, name; fehlend → null', () => {
    const data = createWorksheetData(fakeStore({ ws1: sheet([1, '2,5', '', null, 'x', 3, '4']) }));
    const ref = { instanceId: 'ws1', sheetId: 's1', columnId: 'c1' };
    assertDeepEqual(data.values(ref), [1, '2,5', '', null, 'x', 3, '4']);
    // coerceNumeric: '4' zählt, '2,5', '', null und 'x' fallen heraus
    assertDeepEqual(data.numeric(ref), [1, 3, 4]);
    assertEqual(data.name(ref), 'Gewicht');
    assertEqual(data.numeric({ ...ref, columnId: 'nope' }), null);
    assertEqual(data.values({ instanceId: 'ws1', columnId: 'c1' }), null);
    assertEqual(data.name(null), null);
  });

  test('worksheet:dataChanged des Blatts rechnet neu, ein fremdes nicht', async () => {
    const bus = fakeBus();
    installWorksheetRevisions(bus);
    const states = { ws1: sheet([1, 2, 3]), ws2: sheet([9]) };
    const data = createWorksheetData(fakeStore(states));
    const ref = { instanceId: 'ws1', sheetId: 's1', columnId: 'c1' };
    let runs = 0;
    let sum = 0;
    const runner = Alpine.effect(() => { runs += 1; sum = data.numeric(ref).reduce((a, b) => a + b, 0); });
    bus.emit('worksheet:dataChanged', { instanceId: 'ws2' });
    await flush();
    assertEqual(runs, 1);
    states.ws1 = sheet([1, 2, 30]);
    bus.emit('worksheet:dataChanged', { instanceId: 'ws1' });
    await flush();
    assertEqual(runs, 2);
    assertEqual(sum, 33);
    Alpine.release(runner);
  });

  test('module:removed und Projektwechsel rechnen neu', async () => {
    const bus = fakeBus();
    installWorksheetRevisions(bus);
    const states = { ws9: sheet([1]) };
    const data = createWorksheetData(fakeStore(states));
    const ref = { instanceId: 'ws9', sheetId: 's1', columnId: 'c1' };
    let last;
    const runner = Alpine.effect(() => { last = data.numeric(ref); });
    delete states.ws9;
    bus.emit('module:removed', { moduleId: 'worksheet', instanceId: 'ws9' });
    await flush();
    assertEqual(last, null);
    states.ws9 = sheet([4, 5]);
    bus.emit('project:switched', {});
    await flush();
    assertDeepEqual(last, [4, 5]);
    states.ws9 = sheet([6]);
    bus.emit('state:remote-changed', { instanceIds: ['ws9'], metaChanged: false });
    await flush();
    assertDeepEqual(last, [6]);
    Alpine.release(runner);
  });
});

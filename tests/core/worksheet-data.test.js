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

function fakeProject(states, phases) {
  return {
    getModuleState: (id) => states[id] ?? null,
    get: (path) => {
      if (path === 'phases') return phases;
      const m = /^phases\.(.+)$/.exec(path);
      return m ? phases[m[1]] ?? [] : undefined;
    },
  };
}

suite('ctx.data.columns', () => {
  test('wählbare Spalten nach Typ und Anzahl, Form { key, name }', () => {
    const states = {
      ws1: { sheets: [{ id: 's1', name: 'Blatt', state: { columns: [
        { id: 'c1', name: 'Fehler', type: 'numeric', values: [1, 2, 3] },
        { id: 'c2', name: 'Text', type: 'text', values: ['a', 'b'] },
        { id: 'c3', name: '', shortName: 'K', type: 'numeric', values: [4] },
      ] } }] },
    };
    const data = createWorksheetData(fakeProject(states, { control: [{ instanceId: 'ws1', moduleId: 'worksheet' }] }));
    assertDeepEqual(data.columns({ types: ['numeric'], minCount: 2 }), [{ key: 'ws1|s1|c1', name: 'Fehler' }]);
    assertDeepEqual(data.columns({ types: ['numeric'] }).map((c) => c.name), ['Fehler', 'K']);
  });

  test('neue Spalte im Blatt und module:added rechnen neu', async () => {
    const bus = fakeBus();
    installWorksheetRevisions(bus);
    const phases = { control: [{ instanceId: 'ws9', moduleId: 'worksheet' }] };
    const states = { ws9: { sheets: [{ id: 's1', state: { columns: [] } }] } };
    const data = createWorksheetData(fakeProject(states, phases));
    let seen = null;
    const runner = Alpine.effect(() => { seen = data.columns({}).length; });
    assertEqual(seen, 0);
    states.ws9 = { sheets: [{ id: 's1', state: { columns: [{ id: 'c1', name: 'A', type: 'numeric', values: [1] }] } }] };
    bus.emit('worksheet:dataChanged', { instanceId: 'ws9' });
    await flush();
    assertEqual(seen, 1);
    phases.control.push({ instanceId: 'ws10', moduleId: 'worksheet' });
    states.ws10 = { sheets: [{ id: 's1', state: { columns: [{ id: 'c1', name: 'B', type: 'numeric', values: [1] }] } }] };
    bus.emit('module:added', { moduleId: 'worksheet', instanceId: 'ws10' });
    await flush();
    assertEqual(seen, 2);
    Alpine.release(runner);
  });
});

/**
 * Reaktiver Lesezugriff auf Arbeitsblätter (core/worksheet-data.js) — im Browser (Alpine).
 */
import Alpine from '../../vendor/alpinejs/csp.js';
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { installWorksheetRevisions, createWorksheetData, bumpWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerWorksheetReader } from '../../js/core/worksheet-columns.js';
import { readWorksheetState } from '../../js/modules/worksheet/worksheet-read.js';
import { useStoredWorksheetReader } from '../helpers/worksheet-reader.js';

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
  const sm = { getModuleState: (id) => states[id] ?? null };
  useStoredWorksheetReader(sm);
  return sm;
}

const sheet = (values) => ({ sheets: [{ id: 's1', state: { rowCount: values.length, columns: [{ id: 'c1', name: 'Gewicht', shortName: 'G', values }] } }] });

suite('ctx.data', () => {
  test('values, numeric, name; fehlend → null', () => {
    const data = createWorksheetData(fakeStore({ ws1: sheet([1, '2,5', '', null, 'x', 3, '4']) }));
    const ref = { instanceId: 'ws1', sheetId: 's1', columnId: 'c1' };
    assertDeepEqual(data.values(ref), [1, '2,5', '', null, 'x', 3, '4']);
    // wie das Arbeitsblatt: '4' und '2,5' zählen, '', null und 'x' fallen heraus
    assertDeepEqual(data.numeric(ref), [1, 2.5, 3, 4]);
    assertEqual(data.name(ref), 'Gewicht');
    assertEqual(data.numeric({ ...ref, columnId: 'nope' }), null);
    assertEqual(data.values({ instanceId: 'ws1', columnId: 'c1' }), null);
    assertEqual(data.name(null), null);
  });

  test('numeric liest Dezimalkomma, Wahrheitswerte zählen nicht', () => {
    const data = createWorksheetData(fakeStore({ ws1: sheet(['4', '2,5', true, false, '', null, 'x', 7, Infinity]) }));
    assertDeepEqual(data.numeric({ instanceId: 'ws1', sheetId: 's1', columnId: 'c1' }), [4, 2.5, 7]);
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

  test('column: Name, Typ, Rolle, Bestätigung; ohne Werte; fehlend → null', () => {
    const data = createWorksheetData(fakeStore({ ws1: { sheets: [{ id: 's1', state: { columns: [
      { id: 'c1', name: 'Schicht', type: 'text', role: 'categorical', roleManual: true, values: ['A'] },
      { id: 'c2', name: '', shortName: 'G', type: 'numeric', role: 'continuous', values: [1] }] } }] } }));
    const r = (columnId) => ({ instanceId: 'ws1', sheetId: 's1', columnId });
    assertDeepEqual(data.column(r('c1')), { name: 'Schicht', type: 'text', role: 'categorical', roleConfirmed: true });
    assertDeepEqual(data.column(r('c2')), { name: 'G', type: 'numeric', role: 'continuous', roleConfirmed: false });
    assertEqual(data.column(r('nope')), null);
    assertEqual(data.column(null), null);
  });

  test('column folgt worksheet:dataChanged', async () => {
    const bus = fakeBus();
    installWorksheetRevisions(bus);
    const mk = (role) => ({ sheets: [{ id: 's1', state: { columns: [{ id: 'c1', name: 'X', type: 'numeric', role, values: [1] }] } }] });
    const states = { ws1: mk('continuous') };
    const data = createWorksheetData(fakeStore(states));
    const ref = { instanceId: 'ws1', sheetId: 's1', columnId: 'c1' };
    let role = null;
    const runner = Alpine.effect(() => { role = data.column(ref).role; });
    assertEqual(role, 'continuous');
    states.ws1 = mk('categorical');
    bus.emit('worksheet:dataChanged', { instanceId: 'ws1' });
    await flush();
    assertEqual(role, 'categorical');
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
  const sm = {
    getModuleState: (id) => states[id] ?? null,
    get: (path) => {
      if (path === 'phases') return phases;
      const m = /^phases\.(.+)$/.exec(path);
      return m ? phases[m[1]] ?? [] : undefined;
    },
  };
  useStoredWorksheetReader(sm);
  return sm;
}

suite('ctx.data.columns', () => {
  test('wählbare Spalten nach Typ und Anzahl, Form { key, name }', () => {
    const states = {
      ws1: { sheets: [{ id: 's1', name: 'Blatt', state: { rowCount: 3, columns: [
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
    states.ws9 = { sheets: [{ id: 's1', state: { rowCount: 1, columns: [{ id: 'c1', name: 'A', type: 'numeric', values: [1] }] } }] };
    bus.emit('worksheet:dataChanged', { instanceId: 'ws9' });
    await flush();
    assertEqual(seen, 1);
    phases.control.push({ instanceId: 'ws10', moduleId: 'worksheet' });
    states.ws10 = { sheets: [{ id: 's1', state: { rowCount: 1, columns: [{ id: 'c1', name: 'B', type: 'numeric', values: [1] }] } }] };
    bus.emit('module:added', { moduleId: 'worksheet', instanceId: 'ws10' });
    await flush();
    assertEqual(seen, 2);
    Alpine.release(runner);
  });

  test('project:rehydrated rechnet column() neu', async () => {
    const bus = fakeBus();
    installWorksheetRevisions(bus);
    const states = { wsR: sheet([1]) };
    const data = createWorksheetData(fakeStore(states));
    const ref = { instanceId: 'wsR', sheetId: 's1', columnId: 'c1' };
    let last;
    const runner = Alpine.effect(() => { last = data.numeric(ref); });
    states.wsR = sheet([7, 8]);
    bus.emit('project:rehydrated', {});
    await flush();
    assertDeepEqual(last, [7, 8]);
    Alpine.release(runner);
  });

  test('Verschiebung eines Arbeitsblatts (removed + added) rechnet columns() neu, ein Nicht-Arbeitsblatt nicht', async () => {
    const bus = fakeBus();
    installWorksheetRevisions(bus);
    const phases = { measure: [{ instanceId: 'wsM', moduleId: 'worksheet' }], analyze: [] };
    const states = { wsM: { sheets: [{ id: 's1', state: { columns: [{ id: 'c1', name: 'A', type: 'numeric', values: [1] }] } }] } };
    const data = createWorksheetData(fakeProject(states, phases));
    let runs = 0;
    const runner = Alpine.effect(() => { runs += 1; data.columns({}); });
    assertEqual(runs, 1);
    bus.emit('module:added', { moduleId: 'histogram', phase: 'analyze', instanceId: 'h1' });
    await flush();
    assertEqual(runs, 1);
    phases.analyze.push(phases.measure.pop());
    bus.emit('module:removed', { moduleId: 'worksheet', phase: 'measure', instanceId: 'wsM' });
    bus.emit('module:added', { moduleId: 'worksheet', phase: 'analyze', instanceId: 'wsM' });
    await flush();
    assertEqual(runs, 2);
    Alpine.release(runner);
  });

  test('columns({ maxCount }) filtert nach Werteanzahl', () => {
    const states = { ws1: { sheets: [{ id: 's1', state: { rowCount: 4, columns: [
      { id: 'c1', name: 'Kurz', type: 'numeric', values: [1, 2] },
      { id: 'c2', name: 'Lang', type: 'numeric', values: [1, 2, 3, 4] },
    ] } }] } };
    const data = createWorksheetData(fakeProject(states, { control: [{ instanceId: 'ws1', moduleId: 'worksheet' }] }));
    assertDeepEqual(data.columns({ maxCount: 3 }).map((c) => c.name), ['Kurz']);
  });

  test('sheet und sheets: Zeilenzahl, Spalten, null, Reaktivität', async () => {
    const bus = fakeBus();
    installWorksheetRevisions(bus);
    const states = { wsS: { sheets: [
      { id: 's1', name: 'Eins', state: { rowCount: 3, columns: [
        { id: 'c1', name: 'A', type: 'numeric', values: [1, 2, 3] },
        { id: 'c2', name: 'B', type: 'numeric', values: [], meta: { lock: 'hard', managedBy: 'doe-planner', reason: 'run-order' } },
      ] } },
      { id: 's2', name: 'Zwei', state: null },
    ] } };
    const data = createWorksheetData(fakeStore(states));
    const shown = data.sheet({ instanceId: 'wsS', sheetId: 's1' });
    assertDeepEqual(shown, { id: 's1', name: 'Eins', rowCount: 3, columns: [
      { id: 'c1', name: 'A', type: 'numeric', meta: null },
      { id: 'c2', name: 'B', type: 'numeric', meta: { lock: 'hard', managedBy: 'doe-planner', reason: 'run-order' } },
    ] });
    // Eine Kopie: Schreiben am Ergebnis ändert das Blatt nicht.
    shown.columns[1].meta.lock = 'soft';
    assertEqual(states.wsS.sheets[0].state.columns[1].meta.lock, 'hard');
    assertEqual(data.sheet({ instanceId: 'wsS', sheetId: 'nope' }), null);
    // Ein Blatt ohne Stand: rowCount 0, keine Spalten.
    assertDeepEqual(data.sheet({ instanceId: 'wsS', sheetId: 's2' }), { id: 's2', name: 'Zwei', rowCount: 0, columns: [] });
    assertEqual(data.sheet({ instanceId: 'weg', sheetId: 's1' }), null);
    assertEqual(data.sheet(null), null);
    assertDeepEqual(data.sheets('wsS'), [{ id: 's1', name: 'Eins', rowCount: 3 }, { id: 's2', name: 'Zwei', rowCount: 0 }]);
    assertEqual(data.sheets('weg'), null);

    let rows = -1; let count = -1;
    const r1 = Alpine.effect(() => { rows = data.sheet({ instanceId: 'wsS', sheetId: 's1' }).rowCount; });
    const r2 = Alpine.effect(() => { count = data.sheets('wsS').length; });
    states.wsS.sheets[0].state.rowCount = 5;
    bus.emit('worksheet:dataChanged', { instanceId: 'wsS' });
    await flush();
    assertEqual(rows, 5);
    states.wsS.sheets.push({ id: 's3', name: 'Drei', state: null });
    bus.emit('module:added', { moduleId: 'worksheet', instanceId: 'wsX' });
    await flush();
    assertEqual(count, 3);
    Alpine.release(r1); Alpine.release(r2);
  });
});

suite('ctx.data über den Leser (readSync)', () => {
  test('liest nur über den Leser, nie über getModuleState', () => {
    const stored = { wsL: { sheets: [{ id: 's1', name: 'Eins', state: { rowCount: 2, columns: [
      { id: 'c1', name: 'A', type: 'numeric', values: [1, '2,5'] }] } }] } };
    const sm = {
      getModuleState: () => { throw new Error('getModuleState must not be called'); },
      get: (p) => (p === 'phases' ? { data: [{ instanceId: 'wsL', moduleId: 'worksheet' }] } : p === 'phases.data' ? [{ instanceId: 'wsL', moduleId: 'worksheet' }] : undefined),
    };
    registerWorksheetReader(sm, (id, o) => readWorksheetState(stored[id], o));
    const data = createWorksheetData(sm);
    const ref = { instanceId: 'wsL', sheetId: 's1', columnId: 'c1' };
    assertDeepEqual(data.numeric(ref), [1, 2.5]);
    assertDeepEqual(data.sheets('wsL'), [{ id: 's1', name: 'Eins', rowCount: 2 }]);
    assertEqual(data.sheet({ instanceId: 'wsL', sheetId: 's1' }).columns.length, 1);
    assertDeepEqual(data.columns({}), [{ key: 'wsL|s1|c1', name: 'A' }]);
  });

  test('über einen Alpine-Proxy des stateManager (this._ui.services) liest die Fassade weiter', () => {
    const states = { wsA: sheet([1, 2]) };
    const sm = fakeStore(states);
    const data = createWorksheetData(Alpine.reactive({ sm }).sm);
    assertDeepEqual(data.values({ instanceId: 'wsA', sheetId: 's1', columnId: 'c1' }), [1, 2]);
  });

  test('Leser zuerst not_loaded → null; nach bumpWorksheetRevisions und bereitem Leser läuft der Effekt neu', async () => {
    const stored = { wsP: { sheets: [{ id: 's1', name: 'Eins', state: { rowCount: 2, columns: [
      { id: 'c1', name: 'A', type: 'numeric', values: [4, 5] }] } }] } };
    let ready = false;
    const sm = { getModuleState: () => { throw new Error('getModuleState must not be called'); }, get: () => undefined };
    registerWorksheetReader(sm, (id, o) => {
      if (!ready) { const e = new Error('not_loaded'); e.code = 'not_loaded'; throw e; }
      return readWorksheetState(stored[id], o);
    });
    const data = createWorksheetData(sm);
    const ref = { instanceId: 'wsP', sheetId: 's1', columnId: 'c1' };
    let runs = 0;
    let last;
    const runner = Alpine.effect(() => { runs += 1; last = data.values(ref); });
    assertEqual(runs, 1);
    assertEqual(last, null);
    ready = true;
    bumpWorksheetRevisions();
    await flush();
    assertEqual(runs, 2);
    assertDeepEqual(last, [4, 5]);
    Alpine.release(runner);
  });
});

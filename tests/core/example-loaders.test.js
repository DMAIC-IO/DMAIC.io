/**
 * Beispiel-Lader mit Arbeitsblatt (core/examples-registry.js): Platzhalter-Ersatz.
 */
import { suite, test, assertEqual, assertTrue, assertThrows } from '../test-utils.js';
import { loadExampleViaWorksheet, loadWorksheetExample } from '../../js/core/examples-registry.js';
import { defineModel, columnRef, list } from '../../js/core/model.js';

const Schema = defineModel({ fields: { colRef1: columnRef(), colRefsK: list(columnRef({ nullable: false })) } });
const src = (c) => ({ instanceId: '__source__', sheetId: 's1', columnId: c });

/** Projektstand mit Phasen — genug für provisionWorksheet/removeProvisionedWorksheet. */
function fakeStore() {
  const store = { phases: { data: [] } };
  const states = {};
  return {
    get(path) { return path.split('.').reduce((o, k) => o?.[k], store); },
    set(path, v) {
      const keys = path.split('.');
      const last = keys.pop();
      keys.reduce((o, k) => (o[k] ??= {}), store)[last] = v;
    },
    setModuleState(id, s) { states[id] = s; },
    getModuleState(id) { return states[id] ?? null; },
    removeModuleState(id) { delete states[id]; },
  };
}

function fakeModule() {
  let state = null;
  const events = [];
  const mod = {
    _context: {
      instanceId: 'me',
      i18n: { t: (k) => k, getLanguage: () => 'de' },
      notify() {},
      stateManager: fakeStore(),
      eventBus: { emit(name, p) { events.push([name, p]); }, on() {}, off() {} },
    },
    getState() { return state; },
    setState(s) { state = s; },
  };
  return { mod, events, get state() { return state; } };
}

const payload = () => ({ meta: { id: 'x' }, data: {
  colRef1: src('a'), colRefsK: [src('b')],
  sourceWorksheetData: { sheets: [{ id: 's1', name: 'S', state: { columns: [] } }] },
} });

suite('Beispiel-Lader: rewriteRefs aus dem Schema', () => {
  test('loadWorksheetExample ohne rewriteRefs nutzt rewriteColumnRefs', async () => {
    const f = fakeModule();
    await loadWorksheetExample(f.mod, payload(), { Model: Schema });
    assertTrue(typeof f.state.exampleWorksheetId === 'string');
    assertEqual(f.state.colRef1.instanceId, f.state.exampleWorksheetId);
    assertEqual(f.state.colRefsK[0].instanceId, f.state.exampleWorksheetId);
    assertEqual(f.events[0][0], 'module:added');
  });

  test('loadExampleViaWorksheet ohne rewriteRefs nutzt rewriteColumnRefs', async () => {
    const f = fakeModule();
    await loadExampleViaWorksheet(f.mod, payload(), { State: Schema });
    assertEqual(f.state.colRef1.instanceId, f.state.exampleWorksheetId);
    assertEqual(f.state.colRefsK[0].instanceId, f.state.exampleWorksheetId);
  });

  test('altes Model: dreistellige rewriteRefs, Rückgabe zählt', async () => {
    const Old = { fromJSON: () => ({ hasContent: () => false }) };
    const seen = [];
    const f = fakeModule();
    await loadExampleViaWorksheet(f.mod, payload(), {
      State: Old,
      rewriteRefs(data, from, to) { seen.push([from, to]); return { ...data, marked: to }; },
    });
    assertEqual(seen[0][0], '__source__');
    assertEqual(f.state.marked, seen[0][1]);
    const g = fakeModule();
    await loadWorksheetExample(g.mod, payload(), {
      Model: Old,
      rewriteRefs(data, from, to) { return { ...data, marked: to }; },
    });
    assertEqual(typeof g.state.marked, 'string');
  });

  test('altes Model: rewriteRefs ohne Rückgabe behält die veränderten Daten', async () => {
    const Old = { fromJSON: () => ({ hasContent: () => false }) };
    const f = fakeModule();
    await loadWorksheetExample(f.mod, payload(), {
      Model: Old,
      rewriteRefs(data, from, to) { data.marked = to; },
    });
    assertEqual(f.state.marked, f.state.exampleWorksheetId);
  });

  test('altes Model ohne rewriteRefs: Fehler statt stiller Platzhalter', async () => {
    const Old = { fromJSON: () => ({ hasContent: () => false }) };
    const f = fakeModule();
    let err = null;
    try { await loadWorksheetExample(f.mod, payload(), { Model: Old }); } catch (e) { err = e; }
    assertTrue(err instanceof Error && /rewriteRefs/.test(err.message));
    assertThrows(() => { if (err) throw err; }, /schema/);
  });

  test('kaputter Stand eines Schema-Models: Laden mit Reparatur statt Wurf', async () => {
    const f = fakeModule();
    f.mod.setState({ colRef1: { instanceId: 42 } });
    await loadWorksheetExample(f.mod, payload(), { Model: Schema });
    assertEqual(f.state.colRef1.instanceId, f.state.exampleWorksheetId);
  });
});

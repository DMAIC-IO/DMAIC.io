/**
 * Tests for core/worksheet-append.js — eine Spalte in einen Worksheet
 * schreiben, ob er eingehängt ist oder nur im Store steht (Bug 13).
 */
import { suite, test, assertEqual, assertDeepEqual, assert } from '../test-utils.js';
import { applyAppendColumn, sendColumnToWorksheet } from '../../js/core/worksheet-append.js';

function col(id, name, values) {
  return { id, name, shortName: id, type: 'numeric', unit: '', values, formulas: values.map(() => null), format: { decimals: 6 } };
}

function wsState() {
  return {
    sheets: [
      { id: 'sheet_1', name: 'A', state: { columns: [col('c1', 'X', [1, 2]), col('c2', 'Y', [null, null])], rowCount: 2, colWidths: {}, sortCol: null, sortDir: null, selection: null } },
      { id: 'sheet_2', name: 'B', state: null },
    ],
    activeSheetId: 'sheet_1',
    sheetCounter: 2,
  };
}

suite('core/worksheet-append — applyAppendColumn', () => {
  test('__new__ hängt eine Spalte an und hebt die Zeilenzahl an', () => {
    const before = wsState();
    const res = applyAppendColumn(before, { sheetId: 'sheet_1', colId: '__new__', name: 'N', values: [7, 8, 9], discrete: true });
    assertEqual(res.ok, true);
    const st = res.state.sheets[0].state;
    assertEqual(st.columns.length, 3);
    assertEqual(st.columns[2].name, 'N');
    assertEqual(st.columns[2].shortName, 'C3');
    assertDeepEqual(st.columns[2].values, [7, 8, 9]);
    assertDeepEqual(st.columns[2].format, { decimals: 0 });
    assert(typeof st.columns[2].id === 'string' && st.columns[2].id.length > 0, 'id fehlt');
    assertEqual(st.rowCount, 3);
  });

  test('ist rein: die Eingabe bleibt unverändert', () => {
    const before = wsState();
    const snapshot = JSON.stringify(before);
    applyAppendColumn(before, { sheetId: 'sheet_1', colId: 'c2', name: 'N', values: [5, 6] });
    applyAppendColumn(before, { sheetId: 'sheet_1', colId: '__new__', name: 'N', values: [5] });
    assertEqual(JSON.stringify(before), snapshot);
  });

  test('bestehende Spalte: Werte ersetzt, Name bleibt', () => {
    const res = applyAppendColumn(wsState(), { sheetId: 'sheet_1', colId: 'c2', name: 'N', values: [5, 6] });
    const c = res.state.sheets[0].state.columns[1];
    assertEqual(c.name, 'Y');
    assertDeepEqual(c.values, [5, 6]);
    assertDeepEqual(c.formulas, [null, null]);
  });

  test('__first__ und __slot__ überschreiben auch den Namen', () => {
    let res = applyAppendColumn(wsState(), { sheetId: 'sheet_1', colId: '__first__', name: 'F', values: [3] });
    assertEqual(res.state.sheets[0].state.columns[0].name, 'F');
    res = applyAppendColumn(wsState(), { sheetId: 'sheet_1', colId: '__slot__', slot: 1, name: 'S', values: [4], type: 'text' });
    const c = res.state.sheets[0].state.columns[1];
    assertEqual(c.name, 'S');
    assertEqual(c.type, 'text');
    assertDeepEqual(c.format, {});
  });

  test('leeres Blatt ohne Zustand: __first__ legt die erste Spalte an', () => {
    const res = applyAppendColumn(wsState(), { sheetId: 'sheet_2', colId: '__first__', name: 'F', values: [1, 2, 3, 4] });
    assertEqual(res.ok, true);
    const st = res.state.sheets[1].state;
    assertEqual(st.columns.length, 1);
    assertEqual(st.columns[0].shortName, 'C1');
    assertEqual(st.rowCount, 4);
  });

  test('unbekanntes Blatt und unbekannte Spalte werden gemeldet', () => {
    assertDeepEqual(applyAppendColumn(wsState(), { sheetId: 'nope', colId: '__new__', name: 'N', values: [] }), { ok: false, reason: 'unknown_sheet' });
    assertDeepEqual(applyAppendColumn(wsState(), { sheetId: 'sheet_1', colId: 'nope', name: 'N', values: [] }), { ok: false, reason: 'unknown_column' });
    assertDeepEqual(applyAppendColumn(null, { sheetId: 'sheet_1', colId: '__new__', name: 'N', values: [] }), { ok: false, reason: 'unknown_sheet' });
  });
});

/** Context-Attrappe: Store mit einem Worksheet, EventBus synchron. */
function fakeContext({ mounted = false, mountedReply = { ok: true } } = {}) {
  const moduleStates = { ws1: wsState() };
  const phases = { data: [{ instanceId: 'ws1', moduleId: 'worksheet' }, { instanceId: 'tool', moduleId: 'random-generator' }] };
  const handlers = {};
  const emitted = [];
  const stateManager = {
    get(path) {
      if (path === 'phases') return phases;
      if (path.startsWith('phases.')) return phases[path.slice(7)];
      return undefined;
    },
    getModuleState(id) { return moduleStates[id] ?? null; },
    setModuleState(id, s) { moduleStates[id] = s; },
  };
  const eventBus = {
    on(evt, fn) { (handlers[evt] ??= []).push(fn); },
    off(evt, fn) { handlers[evt] = (handlers[evt] ?? []).filter(h => h !== fn); },
    emit(evt, payload) {
      emitted.push({ evt, payload });
      for (const h of [...(handlers[evt] ?? [])]) h(payload);
    },
  };
  if (mounted) {
    eventBus.on('worksheet:appendColumn', (p) => { if (p.instanceId === 'ws1') p.reply?.(mountedReply); });
  }
  const i18n = { t: k => k };
  return { instanceId: 'tool', stateManager, eventBus, i18n, moduleStates, emitted };
}

suite('core/worksheet-append — sendColumnToWorksheet', () => {
  const payload = { sheetId: 'sheet_1', colId: '__new__', name: 'N', values: [1, 2, 3] };

  test('eingehängt: nur das Event, der Store bleibt dem Worksheet überlassen', () => {
    const ctx = fakeContext({ mounted: true });
    const before = ctx.moduleStates.ws1;
    const res = sendColumnToWorksheet(ctx, 'ws1', payload);
    assertDeepEqual(res, { instanceId: 'ws1', mounted: true });
    assertEqual(ctx.moduleStates.ws1, before);
    const ev = ctx.emitted.filter(e => e.evt === 'worksheet:appendColumn');
    assertEqual(ev.length, 1);
    assertEqual(ev[0].payload.instanceId, 'ws1');
    assertEqual(ev[0].payload.name, 'N');
  });

  test('eingehängt, aber abgelehnt: ehrlicher Fehler', () => {
    const ctx = fakeContext({ mounted: true, mountedReply: { ok: false, reason: 'unknown_column' } });
    let err = null;
    try { sendColumnToWorksheet(ctx, 'ws1', payload); } catch (e) { err = e; }
    assert(err, 'kein Fehler geworfen');
    assertEqual(err.message, 'modules.worksheet.appendTargetUnknown');
  });

  test('nicht eingehängt: in den Store schreiben und dataChanged melden', () => {
    const ctx = fakeContext();
    const res = sendColumnToWorksheet(ctx, 'ws1', payload);
    assertDeepEqual(res, { instanceId: 'ws1', mounted: false });
    const cols = ctx.moduleStates.ws1.sheets[0].state.columns;
    assertEqual(cols.length, 3);
    assertDeepEqual(cols[2].values, [1, 2, 3]);
    assert(ctx.emitted.some(e => e.evt === 'worksheet:dataChanged' && e.payload.instanceId === 'ws1'), 'dataChanged fehlt');
  });

  test('nicht eingehängt, Spalte unbekannt: Fehler, Store unverändert', () => {
    const ctx = fakeContext();
    const before = JSON.stringify(ctx.moduleStates.ws1);
    let err = null;
    try { sendColumnToWorksheet(ctx, 'ws1', { ...payload, colId: 'weg' }); } catch (e) { err = e; }
    assert(err, 'kein Fehler geworfen');
    assertEqual(JSON.stringify(ctx.moduleStates.ws1), before);
    assert(!ctx.emitted.some(e => e.evt === 'worksheet:dataChanged'), 'dataChanged trotz Fehler');
  });

  test('unbekanntes Ziel: Fehler, nichts gesendet', () => {
    const ctx = fakeContext();
    let err = null;
    try { sendColumnToWorksheet(ctx, 'gibt-es-nicht', payload); } catch (e) { err = e; }
    assert(err, 'kein Fehler geworfen');
    assertEqual(err.message, 'modules.worksheet.appendTargetUnknown');
    assert(!ctx.emitted.some(e => e.evt === 'worksheet:dataChanged'), 'dataChanged trotz Fehler');
  });

  test('ein Nicht-Worksheet als Ziel ist unbekannt', () => {
    const ctx = fakeContext();
    let err = null;
    try { sendColumnToWorksheet(ctx, 'tool', payload); } catch (e) { err = e; }
    assert(err, 'kein Fehler geworfen');
  });
});

/**
 * Tests for core/worksheet-write.js — Schreibplan bauen, ganz oder gar nicht
 * in einen Worksheet schreiben, Schreibregel je Schritt.
 */
import { suite, test, assertEqual, assertDeepEqual, assert } from '../test-utils.js';
import {
  worksheetWrite, commitWorksheetWrite, applyWriteColumn, WriteError, START_SLOTS,
} from '../../js/core/worksheet-write.js';
import { COLUMN_TYPES } from '../../js/core/datagrid/datagrid-utils.js';
import { validRolesForType } from '../../js/core/datagrid/datagrid-roles.js';

function col(id, name, values, extra = {}) {
  return { id, name, shortName: id, type: 'numeric', unit: '', values, formulas: values.map(() => null), format: { decimals: 6 }, ...extra };
}

function wsState() {
  return {
    sheets: [
      { id: 'sheet_1', name: 'A', state: { columns: [col('c1', 'X', [1, 2]), col('c2', 'Y', [null, null], { type: 'text', format: {} })], rowCount: 2, colWidths: {}, sortCol: null, sortDir: null, selection: null } },
      { id: 'sheet_2', name: 'B', state: null },
    ],
    activeSheetId: 'sheet_1',
    sheetCounter: 2,
  };
}

/** Fehler eines Aufrufs fangen (synchron oder abgelehnt). */
async function caught(fn) {
  try { await fn(); } catch (e) { return e; }
  return null;
}

// ─── Builder ─────────────────────────────────────────────────────

suite('core/worksheet-write — worksheetWrite', () => {
  test('START_SLOTS ist 5', () => {
    assertEqual(START_SLOTS, 5);
  });

  test('build() liefert reines JSON', () => {
    const plan = worksheetWrite()
      .newWorksheet({ name: 'Import' })
      .column({ name: 'A', type: 'currency', values: [1, 2], format: { decimals: 2 } })
      .column({ name: 'B', values: [3], discrete: true })
      .build();
    assertDeepEqual(JSON.parse(JSON.stringify(plan)), plan);
    assertDeepEqual(plan.target, { kind: 'new', name: 'Import' });
    assertEqual(plan.sheetId, 'sheet_1');
  });

  test('build() kopiert reaktive Proxys (Format, Werte) als reines JSON', () => {
    const format = new Proxy({ decimals: 2 }, {});
    const values = new Proxy([1, 2], {});
    const plan = worksheetWrite().newWorksheet({ name: 'N' }).column({ name: 'A', type: 'currency', values, format }).build();
    assertDeepEqual(plan.ops[0].format, { decimals: 2 });
    assertDeepEqual(plan.ops[0].values, [1, 2]);
    assertDeepEqual(JSON.parse(JSON.stringify(plan)), plan);
  });

  test('neues Arbeitsblatt: 7 Spalten werden Slots 0–4 plus 2 × append', () => {
    let b = worksheetWrite().newWorksheet({ name: 'N' });
    for (let i = 0; i < 7; i++) b = b.column({ name: `S${i}`, values: [i] });
    const plan = b.build();
    assertDeepEqual(plan.ops.map(o => o.to), [
      { kind: 'slot', slot: 0 }, { kind: 'slot', slot: 1 }, { kind: 'slot', slot: 2 },
      { kind: 'slot', slot: 3 }, { kind: 'slot', slot: 4 },
      { kind: 'append' }, { kind: 'append' },
    ]);
    assertEqual(plan.ops[0].type, 'numeric');
  });

  test('bestehendes Arbeitsblatt: column hängt an, overwrite zielt auf die Spalte', () => {
    const plan = worksheetWrite().worksheet('w').sheet('s')
      .column({ name: 'A', values: [1] })
      .overwrite('c9', { type: 'text', values: ['x'] })
      .build();
    assertDeepEqual(plan.target, { kind: 'existing', instanceId: 'w' });
    assertEqual(plan.sheetId, 's');
    assertDeepEqual(plan.ops.map(o => o.to), [{ kind: 'append' }, { kind: 'column', colId: 'c9' }]);
  });

  test('build() wirft missing_sheet, unknown_type und empty_plan', async () => {
    let err = await caught(() => worksheetWrite().worksheet('w').column({ name: 'A', values: [] }).build());
    assert(err instanceof WriteError, 'kein WriteError');
    assertEqual(err.reason, 'missing_sheet');
    err = await caught(() => worksheetWrite().newWorksheet({ name: 'N' }).column({ name: 'A', type: 'foo', values: [] }).build());
    assertEqual(err?.reason, 'unknown_type');
    err = await caught(() => worksheetWrite().newWorksheet({ name: 'N' }).build());
    assertEqual(err?.reason, 'empty_plan');
  });
});

// ─── applyWriteColumn ────────────────────────────────────────────

suite('core/worksheet-write — applyWriteColumn', () => {
  test('append hängt eine Spalte an und hebt die Zeilenzahl an; discrete → decimals 0', () => {
    const res = applyWriteColumn(wsState(), { sheetId: 'sheet_1', to: { kind: 'append' }, name: 'N', type: 'numeric', values: [7, 8, 9], discrete: true });
    assertEqual(res.ok, true);
    const st = res.state.sheets[0].state;
    assertEqual(st.columns.length, 3);
    assertEqual(st.columns[2].name, 'N');
    assertEqual(st.columns[2].shortName, 'C3');
    assertEqual(st.columns[2].type, 'numeric');
    assertDeepEqual(st.columns[2].values, [7, 8, 9]);
    assertDeepEqual(st.columns[2].format, { decimals: 0 });
    assertEqual(res.colId, st.columns[2].id);
    assertEqual(st.rowCount, 3);
  });

  test('jeder Typ aus COLUMN_TYPES kommt mit Format an', () => {
    for (const type of Object.keys(COLUMN_TYPES)) {
      const format = { decimals: 3, marker: type };
      const res = applyWriteColumn(wsState(), { sheetId: 'sheet_1', to: { kind: 'append' }, name: type, type, values: [1], format });
      const c = res.state.sheets[0].state.columns[2];
      assertEqual(c.type, type, `append ${type}`);
      assertDeepEqual(c.format, format, `append ${type}`);
      const res2 = applyWriteColumn(wsState(), { sheetId: 'sheet_1', to: { kind: 'slot', slot: 0 }, name: type, type, values: [1], format });
      const c2 = res2.state.sheets[0].state.columns[0];
      assertEqual(c2.type, type, `slot ${type}`);
      assertDeepEqual(c2.format, format, `slot ${type}`);
    }
  });

  test('currency mit decimals 2 in einen Slot setzt Typ und Format', () => {
    const res = applyWriteColumn(wsState(), { sheetId: 'sheet_1', to: { kind: 'slot', slot: 0 }, name: 'Preis', type: 'currency', values: [1.5], format: { decimals: 2 } });
    const c = res.state.sheets[0].state.columns[0];
    assertEqual(c.name, 'Preis');
    assertEqual(c.type, 'currency');
    assertDeepEqual(c.format, { decimals: 2 });
  });

  test('Datum in einen leeren Startslot: Rolle passt zum neuen Typ', () => {
    const state = wsState();
    state.sheets[0].state.columns[0].role = 'continuous';
    const res = applyWriteColumn(state, { sheetId: 'sheet_1', to: { kind: 'slot', slot: 0 }, name: 'Tag', type: 'date', values: ['2026-01-01', '2026-01-02'] });
    const c = res.state.sheets[0].state.columns[0];
    assertEqual(c.type, 'date');
    assertEqual(c.role, 'date');
    assert(validRolesForType('date').includes(c.role), 'Rolle ungültig für date');
  });

  test('Typwechsel: eine passende Hand-Rolle bleibt, eine unpassende fällt', () => {
    const state = wsState();
    Object.assign(state.sheets[0].state.columns[0], { role: 'identifier', roleManual: true });
    Object.assign(state.sheets[0].state.columns[1], { role: 'freeText', roleManual: true });
    let res = applyWriteColumn(state, { sheetId: 'sheet_1', to: { kind: 'column', colId: 'c1' }, name: '', type: 'currency', values: [1, 2], format: { decimals: 2 } });
    const kept = res.state.sheets[0].state.columns[0];
    assertEqual(kept.role, 'identifier');
    assertEqual(kept.roleManual, true);
    res = applyWriteColumn(state, { sheetId: 'sheet_1', to: { kind: 'column', colId: 'c2' }, name: '', type: 'date', values: ['2026-01-01'] });
    const dropped = res.state.sheets[0].state.columns[1];
    assertEqual(dropped.role, 'date');
    assertEqual(dropped.roleManual, false);
  });

  test('numeric ohne Format in eine Textspalte lässt text', () => {
    const res = applyWriteColumn(wsState(), { sheetId: 'sheet_1', to: { kind: 'slot', slot: 1 }, name: 'Z', type: 'numeric', values: [4] });
    const c = res.state.sheets[0].state.columns[1];
    assertEqual(c.type, 'text');
    assertDeepEqual(c.format, {});
    assertDeepEqual(c.values, [4]);
  });

  test('text setzt text und {}', () => {
    const res = applyWriteColumn(wsState(), { sheetId: 'sheet_1', to: { kind: 'column', colId: 'c1' }, name: 'T', type: 'text', values: ['a'] });
    const c = res.state.sheets[0].state.columns[0];
    assertEqual(c.type, 'text');
    assertDeepEqual(c.format, {});
    assertEqual(c.name, 'X', 'column überschreibt den Namen nicht');
  });

  test('Slot ohne Spalte wird append', () => {
    const res = applyWriteColumn(wsState(), { sheetId: 'sheet_2', to: { kind: 'slot', slot: 0 }, name: 'F', type: 'numeric', values: [1, 2, 3, 4] });
    assertEqual(res.ok, true);
    const st = res.state.sheets[1].state;
    assertEqual(st.columns.length, 1);
    assertEqual(st.columns[0].shortName, 'C1');
    assertEqual(st.rowCount, 4);
  });

  test('ist rein: die Eingabe bleibt unverändert', () => {
    const before = wsState();
    const snapshot = JSON.stringify(before);
    applyWriteColumn(before, { sheetId: 'sheet_1', to: { kind: 'column', colId: 'c2' }, name: 'N', type: 'numeric', values: [5, 6] });
    applyWriteColumn(before, { sheetId: 'sheet_1', to: { kind: 'append' }, name: 'N', type: 'numeric', values: [5] });
    assertEqual(JSON.stringify(before), snapshot);
  });

  test('unbekanntes Blatt und unbekannte Spalte werden gemeldet', () => {
    assertDeepEqual(applyWriteColumn(wsState(), { sheetId: 'nope', to: { kind: 'append' }, name: 'N', values: [] }), { ok: false, reason: 'unknown_sheet' });
    assertDeepEqual(applyWriteColumn(wsState(), { sheetId: 'sheet_1', to: { kind: 'column', colId: 'nope' }, name: 'N', values: [] }), { ok: false, reason: 'unknown_column' });
    assertDeepEqual(applyWriteColumn(null, { sheetId: 'sheet_1', to: { kind: 'append' }, name: 'N', values: [] }), { ok: false, reason: 'unknown_sheet' });
  });

  test('eine Formel auf dem Zielblatt rechnet nach dem Schreiben neu', () => {
    const dep = { id: 'b', name: 'B', shortName: 'C2', type: 'numeric', values: [99], formulas: ['=C1[1]*2'] };
    const src = { id: 'a', name: 'A', shortName: 'C1', type: 'numeric', values: [1], formulas: [null] };
    const ws = { sheets: [{ id: 's', name: 'S', state: { columns: [src, dep], rowCount: 1 } }] };
    const res = applyWriteColumn(ws, { sheetId: 's', to: { kind: 'column', colId: 'a' }, name: 'A', type: 'numeric', values: [21] });
    assertEqual(res.state.sheets[0].state.columns[1].values[0], 42);
    assertEqual(dep.values[0], 99);
  });
});

// ─── commitWorksheetWrite ────────────────────────────────────────

/**
 * Context-Attrappe: Store mit einem Worksheet `ws1` in Phase `data`, EventBus
 * synchron. `mounted` legt einen Empfänger für `ws1` an, der mit `reply`
 * antwortet; `activateNew` meldet einen neu angelegten Worksheet als aktiv
 * und lässt ihn mit `newReply` antworten.
 */
function fakeContext({ mounted = null, activateNew = false, newReply = null } = {}) {
  const moduleStates = { ws1: wsState() };
  const phases = { data: [{ instanceId: 'ws1', moduleId: 'worksheet', order: 0 }, { instanceId: 'tool', moduleId: 'data-import', order: 1 }] };
  const handlers = {};
  const emitted = [];
  const calls = { setModuleState: 0 };
  const stateManager = {
    get(path) {
      if (path === 'phases') return phases;
      if (path.startsWith('phases.')) return phases[path.slice(7)];
      return undefined;
    },
    set(path, value) { phases[path.slice(7)] = value; },
    getModuleState(id) { return moduleStates[id] ?? null; },
    setModuleState(id, s) { calls.setModuleState++; moduleStates[id] = s; },
    removeModuleState(id) { delete moduleStates[id]; },
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
    eventBus.on('worksheet:writeColumns', (p) => { if (p.instanceId === 'ws1') p.reply(mounted); });
  }
  if (activateNew) {
    eventBus.on('module:added', ({ instanceId }) => {
      eventBus.on('worksheet:writeColumns', (p) => { if (p.instanceId === instanceId) p.reply(newReply); });
      queueMicrotask(() => eventBus.emit('module:activated', { instanceId }));
    });
  }
  const i18n = { t: k => k };
  return { instanceId: 'tool', stateManager, eventBus, i18n, moduleStates, phases, emitted, calls };
}

suite('core/worksheet-write — commitWorksheetWrite', () => {
  test('ein Ziel, das kein Worksheet ist: unknown_instance, nichts geschrieben', async () => {
    const ctx = fakeContext();
    const plan = worksheetWrite().worksheet('tool').sheet('sheet_1').column({ name: 'A', values: [1] }).build();
    const err = await caught(() => commitWorksheetWrite(ctx, plan));
    assert(err instanceof WriteError, 'kein WriteError');
    assertEqual(err.reason, 'unknown_instance');
    assertEqual(err.message, 'modules.worksheet.appendTargetUnknown');
    assertEqual(ctx.calls.setModuleState, 0);
    assertEqual(ctx.emitted.length, 0);
  });

  test('nicht eingehängt, zweiter Schritt mit unbekannter Spalte: nichts geschrieben', async () => {
    const ctx = fakeContext();
    const before = JSON.stringify(ctx.moduleStates.ws1);
    const plan = worksheetWrite().worksheet('ws1').sheet('sheet_1')
      .column({ name: 'A', values: [1] })
      .overwrite('weg', { values: [2] })
      .build();
    const err = await caught(() => commitWorksheetWrite(ctx, plan));
    assertEqual(err?.reason, 'unknown_column');
    assertEqual(JSON.stringify(ctx.moduleStates.ws1), before);
    assertEqual(ctx.calls.setModuleState, 0);
    assert(!ctx.emitted.some(e => e.evt === 'worksheet:dataChanged'), 'dataChanged trotz Fehler');
  });

  test('nicht eingehängt, gültig: genau ein setModuleState und ein dataChanged', async () => {
    const ctx = fakeContext();
    const plan = worksheetWrite().worksheet('ws1').sheet('sheet_1')
      .column({ name: 'A', values: [1, 2, 3] })
      .overwrite('c1', { type: 'currency', values: [5, 6], format: { decimals: 2 } })
      .build();
    const res = await commitWorksheetWrite(ctx, plan);
    assertEqual(ctx.calls.setModuleState, 1);
    assertEqual(ctx.emitted.filter(e => e.evt === 'worksheet:dataChanged').length, 1);
    const cols = ctx.moduleStates.ws1.sheets[0].state.columns;
    assertEqual(cols.length, 3);
    assertDeepEqual(cols[2].values, [1, 2, 3]);
    assertEqual(cols[0].type, 'currency');
    assertDeepEqual(res, { instanceId: 'ws1', sheetId: 'sheet_1', columnIds: [cols[2].id, 'c1'], created: false });
  });

  test('eingehängt: ein Ereignis mit allen Schritten, columnIds aus der Quittung', async () => {
    const ctx = fakeContext({ mounted: { ok: true, columnIds: ['x1', 'x2'] } });
    const before = ctx.moduleStates.ws1;
    const plan = worksheetWrite().worksheet('ws1').sheet('sheet_1')
      .column({ name: 'A', values: [1] })
      .column({ name: 'B', values: [2] })
      .build();
    const res = await commitWorksheetWrite(ctx, plan);
    const ev = ctx.emitted.filter(e => e.evt === 'worksheet:writeColumns');
    assertEqual(ev.length, 1);
    assertEqual(ev[0].payload.sheetId, 'sheet_1');
    assertDeepEqual(ev[0].payload.ops, plan.ops);
    assertDeepEqual(res.columnIds, ['x1', 'x2']);
    assertEqual(ctx.moduleStates.ws1, before);
    assertEqual(ctx.calls.setModuleState, 0);
  });

  test('eingehängt, abgelehnt: Fehler mit dem Grund der Quittung', async () => {
    const ctx = fakeContext({ mounted: { ok: false, reason: 'unknown_sheet' } });
    const plan = worksheetWrite().worksheet('ws1').sheet('sheet_9').column({ name: 'A', values: [1] }).build();
    const err = await caught(() => commitWorksheetWrite(ctx, plan));
    assertEqual(err?.reason, 'unknown_sheet');
  });

  test('eingehängt, Schreiben gescheitert: write_failed, kein Store-Ersatz', async () => {
    const ctx = fakeContext({ mounted: { ok: false, reason: 'write_failed' } });
    const before = ctx.moduleStates.ws1;
    const plan = worksheetWrite().worksheet('ws1').sheet('sheet_1').column({ name: 'A', values: [1] }).build();
    const err = await caught(() => commitWorksheetWrite(ctx, plan));
    assert(err instanceof WriteError, 'kein WriteError');
    assertEqual(err.reason, 'write_failed');
    assertEqual(err.message, 'modules.worksheet.writeFailed');
    assertEqual(ctx.moduleStates.ws1, before);
    assertEqual(ctx.calls.setModuleState, 0);
  });

  test('neues Arbeitsblatt: added, activated, dann das Ereignis; created true', async () => {
    const ctx = fakeContext({ activateNew: true, newReply: { ok: true, columnIds: ['n1'] } });
    const plan = worksheetWrite().newWorksheet({ name: 'Import' }).column({ name: 'A', values: [1] }).build();
    const res = await commitWorksheetWrite(ctx, plan);
    const names = ctx.emitted.map(e => e.evt);
    assertDeepEqual(names, ['module:added', 'module:activated', 'worksheet:writeColumns']);
    const wsId = ctx.emitted[0].payload.instanceId;
    assertDeepEqual(res, { instanceId: wsId, sheetId: 'sheet_1', columnIds: ['n1'], created: true });
    assertEqual(ctx.phases.data.length, 3);
    assertEqual(ctx.moduleStates[wsId].sheets[0].name, 'Import');
  });

  test('neues Arbeitsblatt, Schreiben abgelehnt: Blatt wieder entfernt, Versprechen abgelehnt', async () => {
    const ctx = fakeContext({ activateNew: true, newReply: { ok: false, reason: 'unknown_column' } });
    const plan = worksheetWrite().newWorksheet({ name: 'Import' }).column({ name: 'A', values: [1] }).build();
    const err = await caught(() => commitWorksheetWrite(ctx, plan));
    assertEqual(err?.reason, 'unknown_column');
    const wsId = ctx.emitted[0].payload.instanceId;
    assert(ctx.emitted.some(e => e.evt === 'module:removed' && e.payload.instanceId === wsId), 'module:removed fehlt');
    assert(!ctx.phases.data.some(i => i.instanceId === wsId), 'Phase enthält das Blatt noch');
    assertEqual(ctx.moduleStates[wsId], undefined);
  });

  test('neues Arbeitsblatt ohne Aktivierung: open_timeout, Blatt entfernt', async () => {
    const ctx = fakeContext();
    const plan = worksheetWrite().newWorksheet({ name: 'Import' }).column({ name: 'A', values: [1] }).build();
    const err = await caught(() => commitWorksheetWrite(ctx, plan, { timeoutMs: 10 }));
    assert(err instanceof WriteError, 'kein WriteError');
    assertEqual(err.reason, 'open_timeout');
    assertEqual(err.message, 'modules.worksheet.openTimeout');
    const wsId = ctx.emitted[0].payload.instanceId;
    assert(ctx.emitted.some(e => e.evt === 'module:removed' && e.payload.instanceId === wsId), 'module:removed fehlt');
    assert(!ctx.phases.data.some(i => i.instanceId === wsId), 'Phase enthält das Blatt noch');
    assert(!ctx.emitted.some(e => e.evt === 'worksheet:writeColumns'), 'trotz Frist geschrieben');
  });
});

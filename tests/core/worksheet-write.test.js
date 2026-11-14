/**
 * Tests for core/worksheet-write.js — Stapel der Agentenfläche bauen, über
 * `ctx.instances.interact` schreiben, Schreibregel je Schritt.
 */
import { suite, test, assertEqual, assertDeepEqual, assert } from '../test-utils.js';
import {
  worksheetWrite, commitWorksheetWrite, applyWriteColumn, WriteError,
} from '../../js/core/worksheet-write.js';
import { validateBatch } from '../../js/core/agent/agent-validate.js';
import { buildWorld } from '../../js/core/agent/agent-catalog.js';
import { AGENT_REGISTRY } from '../../js/core/agent/agent-registry.generated.js';
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

/** Store-Attrappe: ein Worksheet `ws1` (Blätter „A“, „B“) und der Aufrufer `tool` in `data`. */
function fakeStore() {
  const phases = { data: [{ instanceId: 'ws1', moduleId: 'worksheet', order: 0 }, { instanceId: 'tool', moduleId: 'random-generator', order: 1 }] };
  return {
    get(path) {
      if (path === 'phases') return phases;
      if (path.startsWith('phases.')) return phases[path.slice(7)];
      return undefined;
    },
    getModuleState(id) { return id === 'ws1' ? wsState() : null; },
  };
}

const WS_REF = { $from: 'ws', path: 'instanceId' };

suite('core/worksheet-write — worksheetWrite', () => {
  test('new worksheet builds add+rename+writeColumns stack', () => {
    const plan = worksheetWrite()
      .newWorksheet({ name: 'A' })
      .column({ name: 'P', type: 'currency', values: [1, 2], format: { decimals: 2 } })
      .column({ name: 'Q', values: [3], discrete: true })
      .build({ stateManager: fakeStore(), instanceId: 'tool' });
    assertEqual(plan.created, true);
    assertEqual(plan.sheetId, 'sheet_1');
    assertDeepEqual(plan.stack, [
      { op: 'module.add', id: 'ws', module: 'worksheet', phase: 'data' },
      { op: 'instance.call', module: 'worksheet', instance: WS_REF, method: 'renameSheet', args: ['sheet_1', 'A 1'] },
      { op: 'instance.call', id: 'write', module: 'worksheet', instance: WS_REF, method: 'writeColumns', args: ['sheet_1', [
        { to: 'start', name: 'P', type: 'currency', values: [1, 2], format: { decimals: 2 } },
        { to: 'start', name: 'Q', type: 'numeric', values: [3], discrete: true },
      ]] },
    ]);
    assertDeepEqual(JSON.parse(JSON.stringify(plan)), plan);
  });

  test('existing worksheet builds single writeColumns call', () => {
    const plan = worksheetWrite().worksheet('ws1').sheet('sheet_2')
      .column({ name: 'A', values: [1] })
      .build();
    assertEqual(plan.created, false);
    assertEqual(plan.sheetId, 'sheet_2');
    assertDeepEqual(plan.stack, [
      { op: 'instance.call', id: 'write', module: 'worksheet', instance: 'ws1', method: 'writeColumns', args: ['sheet_2', [
        { to: 'append', name: 'A', type: 'numeric', values: [1] },
      ]] },
    ]);
  });

  test('overwrite maps to column id', () => {
    const plan = worksheetWrite().worksheet('ws1').sheet('sheet_1')
      .overwrite('c9', { type: 'text', values: ['x'] })
      .column({ name: 'A', values: [1] })
      .build();
    assertDeepEqual(plan.stack[0].args[1].map(c => c.to), ['c9', 'append']);
    assertEqual(plan.stack[0].args[1][0].type, 'text');
  });

  test('neues Arbeitsblatt ohne Namen: kein renameSheet', () => {
    const plan = worksheetWrite().newWorksheet().column({ name: 'A', values: [1] }).build();
    assertDeepEqual(plan.stack.map(a => a.method ?? a.op), ['module.add', 'writeColumns']);
  });

  test('build() kopiert reaktive Proxys (Format, Werte) als reines JSON', () => {
    const format = new Proxy({ decimals: 2 }, {});
    const values = new Proxy([1, 2], {});
    const plan = worksheetWrite().newWorksheet({ name: 'N' }).column({ name: 'A', type: 'currency', values, format }).build();
    const [column] = plan.stack[2].args[1];
    assertDeepEqual(column.format, { decimals: 2 });
    assertDeepEqual(column.values, [1, 2]);
    assertDeepEqual(JSON.parse(JSON.stringify(plan)), plan);
  });

  test('build() wirft missing_target, missing_sheet, unknown_type und empty_plan', async () => {
    let err = await caught(() => worksheetWrite().column({ name: 'A', values: [] }).build());
    assert(err instanceof WriteError, 'kein WriteError');
    assertEqual(err.reason, 'missing_target');
    err = await caught(() => worksheetWrite().worksheet('w').column({ name: 'A', values: [] }).build());
    assertEqual(err?.reason, 'missing_sheet');
    err = await caught(() => worksheetWrite().newWorksheet({ name: 'N' }).column({ name: 'A', type: 'foo', values: [] }).build());
    assertEqual(err?.reason, 'unknown_type');
    err = await caught(() => worksheetWrite().newWorksheet({ name: 'N' }).build());
    assertEqual(err?.reason, 'empty_plan');
  });

  test('every builder stack passes the real validator', () => {
    const stateManager = fakeStore();
    const moduleRegistry = {
      getAll: () => [{ id: 'worksheet', phase: 'data' }, { id: 'random-generator', phase: 'data' }],
      get: (id) => moduleRegistry.getAll().find(d => d.id === id),
      getActiveCycle: () => 'dmaic',
    };
    const i18n = { t: (k) => k, exists: () => false, getLanguage: () => 'de' };
    const world = buildWorld({ moduleRegistry, stateManager, i18n, registry: AGENT_REGISTRY });
    const ctx = { stateManager, instanceId: 'tool' };
    const plans = {
      'neu × column': worksheetWrite().newWorksheet({ name: 'N' }).column({ name: 'A', values: [1] }),
      'neu × overwrite': worksheetWrite().newWorksheet({ name: 'N' }).overwrite('c1', { values: [1] }),
      'vorhanden × column': worksheetWrite().worksheet('ws1').sheet('sheet_1').column({ name: 'A', values: [1] }),
      'vorhanden × overwrite': worksheetWrite().worksheet('ws1').sheet('sheet_1').overwrite('c1', { values: [1] }),
    };
    for (const [label, builder] of Object.entries(plans)) {
      const checked = validateBatch(builder.build(ctx).stack, world);
      assert(checked.ok === true, `${label}: ${JSON.stringify(checked)}`);
    }
    // Gegenprobe: dieselbe Prüfung lehnt eine falsche Aktion ab.
    const bad = worksheetWrite().worksheet('ws1').sheet('sheet_1').column({ name: 'A', values: [1] }).build(ctx);
    bad.stack[0].method = 'writeColumnz';
    assertEqual(validateBatch(bad.stack, world).ok, false);
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
 * Context-Attrappe: `instances.interact` hält den Stapel fest und antwortet
 * mit `answer`; `i18n.t` liefert den Schlüssel.
 */
function fakeContext(answer) {
  const stacks = [];
  return {
    stacks,
    i18n: { t: k => k },
    instances: { interact: async (stack) => { stacks.push(stack); return answer; } },
  };
}

/** `console.warn` für die Dauer von `fn` stummschalten und Aufrufe zählen. */
async function quietWarn(fn) {
  const orig = console.warn;
  const warned = [];
  console.warn = (...a) => { warned.push(a); };
  try { return { value: await fn(), warned }; } finally { console.warn = orig; }
}

suite('core/worksheet-write — commitWorksheetWrite', () => {
  test('commit returns ids from write result', async () => {
    const ctx = fakeContext({ ok: true, contract: 1, results: [
      { ok: true, id: 'ws', result: { instanceId: 'w9', module: 'worksheet', phase: 'data' } },
      { ok: true, id: null, result: { instanceId: 'w9', method: 'renameSheet', value: null } },
      { ok: true, id: 'write', result: { instanceId: 'w9', method: 'writeColumns', value: ['c1', 'c2'] } },
    ] });
    const plan = worksheetWrite().newWorksheet({ name: 'N' }).column({ name: 'A', values: [1] }).column({ name: 'B', values: [2] }).build();
    const out = await commitWorksheetWrite(ctx, plan);
    assertDeepEqual(out, { instanceId: 'w9', sheetId: 'sheet_1', columnIds: ['c1', 'c2'], created: true });
    assertEqual(ctx.stacks.length, 1);
    assertEqual(ctx.stacks[0], plan.stack);
  });

  test('vorhandener Worksheet: instanceId aus dem Ergebnis von write', async () => {
    const ctx = fakeContext({ ok: true, contract: 1, results: [
      { ok: true, id: 'write', result: { instanceId: 'ws1', method: 'writeColumns', value: ['c7'] } },
    ] });
    const plan = worksheetWrite().worksheet('ws1').sheet('sheet_2').column({ name: 'A', values: [1] }).build();
    assertDeepEqual(await commitWorksheetWrite(ctx, plan), { instanceId: 'ws1', sheetId: 'sheet_2', columnIds: ['c7'], created: false });
  });

  test('commit maps unknown column to WriteError unknown_column', async () => {
    const ctx = fakeContext({ ok: false, contract: 1, rolledBack: true, results: [
      { ok: false, id: 'write', error: 'call_failed', message: 'Call to "writeColumns" failed: unknown_column: c9' },
    ] });
    const plan = worksheetWrite().worksheet('ws1').sheet('sheet_1').overwrite('c9', { values: [1] }).build();
    const { value: err, warned } = await quietWarn(() => caught(() => commitWorksheetWrite(ctx, plan)));
    assert(err instanceof WriteError, 'kein WriteError');
    assertEqual(err.reason, 'unknown_column');
    assertEqual(warned.length, 1);
  });

  test('Fehlerzuordnung: unknown_sheet, Prüffehler, Laufzeitfehler, abgeschlossenes Projekt', async () => {
    const plan = worksheetWrite().worksheet('ws1').sheet('sheet_9').column({ name: 'A', values: [1] }).build();
    const cases = [
      [{ ok: false, results: [{ ok: false, error: 'call_failed', message: 'x: unknown_sheet: sheet_9' }] }, 'unknown_sheet'],
      [{ ok: false, error: 'validation_failed', index: 0, cause: { error: 'unknown_instance' } }, 'unknown_instance'],
      [{ ok: false, error: 'validation_failed', index: 0, cause: { error: 'instance_module_mismatch' } }, 'unknown_instance'],
      [{ ok: false, results: [{ ok: false, error: 'instance_module_mismatch', message: 'm' }] }, 'unknown_instance'],
      [{ ok: false, error: 'validation_failed', index: 0, cause: { error: 'project_completed' } }, 'write_failed'],
      [{ ok: false, results: [{ ok: false, error: 'call_failed', message: 'columns[0].values must be an array' }] }, 'write_failed'],
      [{ ok: false, error: 'surface_failed', message: 'boom' }, 'write_failed'],
    ];
    for (const [answer, reason] of cases) {
      const { value: err } = await quietWarn(() => caught(() => commitWorksheetWrite(fakeContext(answer), plan)));
      assertEqual(err?.reason, reason, JSON.stringify(answer));
    }
  });

  test('commit message comes from i18n, not from the agent message', async () => {
    const plan = worksheetWrite().worksheet('ws1').sheet('sheet_1').column({ name: 'A', values: [1] }).build();
    const answers = [
      [{ ok: false, results: [{ ok: false, error: 'call_failed', message: 'Call failed: unknown_column: c9' }] }, 'modules.worksheet.appendTargetUnknown'],
      [{ ok: false, results: [{ ok: false, error: 'call_failed', message: 'Call failed: kaputt' }] }, 'modules.worksheet.writeFailed'],
    ];
    for (const [answer, key] of answers) {
      const { value: err } = await quietWarn(() => caught(() => commitWorksheetWrite(fakeContext(answer), plan)));
      assertEqual(err.message, key);
    }
  });
});

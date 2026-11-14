/**
 * Tests for core/worksheet-write.js — Stapel der Agentenfläche bauen, über
 * `ctx.instances.interact` schreiben, Schreibregel je Schritt.
 */
import { suite, test, assertEqual, assertDeepEqual, assert } from '../test-utils.js';
import {
  worksheetWrite, commitWorksheetWrite, completeStack, WriteError,
} from '../../js/core/worksheet-write.js';
import { validateBatch } from '../../js/core/agent/agent-validate.js';
import { buildWorld } from '../../js/core/agent/agent-catalog.js';
import { AGENT_REGISTRY } from '../../js/core/agent/agent-registry.generated.js';

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
  test('new worksheet builds add+rename+writeColumns stack', async () => {
    const plan = worksheetWrite()
      .newWorksheet({ name: 'A' })
      .column({ name: 'P', type: 'currency', values: [1, 2], format: { decimals: 2 } })
      .column({ name: 'Q', values: [3], discrete: true })
      .build();
    assertEqual(plan.created, true);
    assertEqual(plan.sheetId, 'sheet_1');
    const planBefore = JSON.parse(JSON.stringify(plan));
    // Der Stapel, den commit an interact gibt: Phase des Aufrufers, Blattname eindeutig („A“ gibt es in ws1).
    const ctx = fakeContext({ ok: true, results: [
      { ok: true, id: 'ws', result: { instanceId: 'w9' } },
      { ok: true, id: null, result: { value: null } },
      { ok: true, id: 'write', result: { instanceId: 'w9', value: ['c1', 'c2'] } },
    ] });
    ctx.stateManager = fakeStore();
    ctx.instanceId = 'tool';
    await commitWorksheetWrite(ctx, plan);
    assertDeepEqual(plan, planBefore, 'Plan des Aufrufers verändert');
    assertDeepEqual(ctx.stacks[0], [
      { op: 'module.add', id: 'ws', module: 'worksheet', phase: 'data' },
      { op: 'instance.call', module: 'worksheet', instance: WS_REF, method: 'renameSheet', args: ['sheet_1', 'A 1'] },
      { op: 'instance.call', id: 'write', module: 'worksheet', instance: WS_REF, method: 'writeColumns', args: ['sheet_1', [
        { to: 'start', name: 'P', type: 'currency', values: [1, 2], format: { decimals: 2 } },
        { to: 'start', name: 'Q', type: 'numeric', values: [3], discrete: true },
      ]] },
    ]);
    assertDeepEqual(plan.stack[0], { op: 'module.add', id: 'ws', module: 'worksheet' });
    assertDeepEqual(plan.stack[1].args, ['sheet_1', 'A']);
    assertDeepEqual(JSON.parse(JSON.stringify(plan)), plan);
  });

  test('ohne Phase im Projekt landet ein neuer Worksheet in data, freier Name bleibt', () => {
    const plan = worksheetWrite().newWorksheet({ name: 'Frei' }).column({ name: 'A', values: [1] }).build();
    const stack = completeStack({ stateManager: fakeStore(), instanceId: 'unbekannt' }, plan);
    assertEqual(stack[0].phase, 'data');
    assertDeepEqual(stack[1].args, ['sheet_1', 'Frei']);
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
    const plans = /** @type {Record<string, any>} */ ({
      'neu × column': worksheetWrite().newWorksheet({ name: 'N' }).column({ name: 'A', values: [1] }),
      'neu × overwrite': worksheetWrite().newWorksheet({ name: 'N' }).overwrite('c1', { values: [1] }),
      'vorhanden × column': worksheetWrite().worksheet('ws1').sheet('sheet_1').column({ name: 'A', values: [1] }),
      'vorhanden × overwrite': worksheetWrite().worksheet('ws1').sheet('sheet_1').overwrite('c1', { values: [1] }),
    });
    for (const [label, builder] of Object.entries(plans)) {
      const checked = validateBatch(completeStack(ctx, builder.build()), world);
      assert(checked.ok === true, `${label}: ${JSON.stringify(checked)}`);
    }
    // Gegenprobe: dieselbe Prüfung lehnt eine falsche Aktion ab.
    const bad = completeStack(ctx, worksheetWrite().worksheet('ws1').sheet('sheet_1').column({ name: 'A', values: [1] }).build());
    bad[0] = { ...bad[0], method: 'writeColumnz' };
    assertEqual(validateBatch(bad, world).ok, false);
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
    stateManager: fakeStore(),
    instanceId: 'tool',
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
    assertEqual(ctx.stacks[0].length, plan.stack.length);
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

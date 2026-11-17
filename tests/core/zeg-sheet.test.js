/**
 * Tests for core/zeg-sheet/zeg-sheet.js — wiring with fake stateManager/eventBus.
 *
 * The ZEG sync reads the worksheet through the facade (`readWorksheet`, here
 * the stored-state reader of the test helper) and writes only through
 * `ctx.interact`. The `interact` double logs every stack and applies it to
 * the stored worksheet state like the real worksheet would; the stateManager
 * double throws on `setModuleState` for a worksheet instance.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import {
  findZegSheet, ensureZegSheet, syncSheetToHistory, writeHistoryToSheet, installZegSheetSync,
} from '../../js/core/zeg-sheet/zeg-sheet.js';
import { DATE_REF } from '../../js/core/zeg-sheet/zeg-sheet-model.js';
import { registerWorksheetReader } from '../../js/core/worksheet-columns.js';
import { readWorksheetState } from '../../js/modules/worksheet/worksheet-read.js';
import { useStoredWorksheetReader } from '../helpers/worksheet-reader.js';

const flush = () => new Promise(r => setTimeout(r, 0));

/** Resolve `{ $from, path }` references against the results so far. */
function resolveRefs(value, byId) {
  if (Array.isArray(value)) return value.map(v => resolveRefs(v, byId));
  if (value && typeof value === 'object') {
    if (typeof value.$from === 'string') {
      return value.path.split('.').reduce((o, k) => o?.[k], byId.get(value.$from));
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveRefs(v, byId)]));
  }
  return value;
}

/**
 * A stored worksheet that applies the worksheet calls of a stack. Writes go
 * straight to `modules`, past the stateManager double (which refuses them).
 */
function makeWorksheetSurface(fx) {
  let added = 0;
  let appended = 0;
  const sheetOf = (instanceId, sheetId) => {
    const sheet = fx.modules.get(instanceId)?.sheets.find(s => s.id === sheetId);
    if (!sheet) throw new Error(`unknown sheet ${sheetId}`);
    return sheet.state;
  };
  const colOf = (st, id) => {
    const col = st.columns.find(c => c.id === id);
    if (!col) throw new Error(`unknown_column: ${id}`);
    return col;
  };
  const methods = {
    renameSheet(id, sheetId, name) {
      fx.modules.get(id).sheets.find(s => s.id === sheetId).name = name;
    },
    read(id, options) { return readWorksheetState(fx.modules.get(id), options); },
    writeColumns(id, sheetId, entries) {
      const st = sheetOf(id, sheetId);
      return entries.map(e => {
        let col;
        if (e.to === 'append') {
          col = { id: `n${++appended}`, name: e.name, type: e.type, format: e.format, meta: null, values: [], formulas: null };
          st.columns.push(col);
        } else col = colOf(st, e.to);
        col.values = [...e.values];
        col.formulas = null;
        st.rowCount = Math.max(st.rowCount, e.values.length);
        return col.id;
      });
    },
    setColumnMeta(id, sheetId, colId, meta) { colOf(sheetOf(id, sheetId), colId).meta = meta; },
    removeColumn(id, sheetId, colId) {
      const st = sheetOf(id, sheetId);
      st.columns = st.columns.filter(c => c.id !== colOf(st, colId).id);
    },
    moveColumn(id, sheetId, colId, index) {
      const st = sheetOf(id, sheetId);
      const col = colOf(st, colId);
      st.columns.splice(st.columns.indexOf(col), 1);
      st.columns.splice(index, 0, col);
    },
    removeRows(id, sheetId, start, count) {
      const st = sheetOf(id, sheetId);
      for (const c of st.columns) {
        c.values.splice(start, count);
        c.formulas?.splice(start, count);
      }
      st.rowCount -= count;
    },
    setFormula(id, sheetId, colId, row, formula) {
      const col = colOf(sheetOf(id, sheetId), colId);
      col.formulas ??= [];
      col.formulas[row] = formula;
    },
  };
  return async (stack) => {
    fx.stacks.push(structuredClone(stack));
    if (fx.hold) await fx.hold;
    if (fx.completed) return { ok: false, error: 'project_completed', results: [] };
    const byId = new Map();
    const results = [];
    for (const raw of stack) {
      const action = resolveRefs(raw, byId);
      let result;
      if (action.op === 'module.add') {
        const instanceId = `ws-${++added}`;
        const items = fx.state.phases[action.phase];
        items.push({ instanceId, moduleId: action.module, order: items.length, state: {} });
        fx.modules.set(instanceId, {
          sheets: [{ id: 'sheet_1', name: 'Tabelle', state: {
            rowCount: 4,
            columns: ['s1', 's2'].map(id => ({ id, name: id, type: 'numeric', values: [], formulas: null, meta: null })),
          } }],
          activeSheetId: 'sheet_1',
          sheetCounter: 1,
        });
        fx.loaded = true;
        result = { instanceId, module: action.module, phase: action.phase };
      } else {
        fx.loaded = true;
        const value = methods[action.method](action.instance, ...action.args);
        result = { instanceId: action.instance, method: action.method, value: value ?? null };
      }
      if (action.id) byId.set(action.id, result);
      results.push({ ok: true, id: action.id ?? null, result });
    }
    return { ok: true, results };
  };
}

// Mirrors the real StateManager: get/getModuleState hand out live references,
// set stores the value as is. setModuleState throws for a worksheet: the sync
// must write through interact only.
function makeCtx({ cycle = 'dmaic', history = {}, completed = false } = {}) {
  const state = { phases: { data: [], define: [] }, phaseAchievement: {}, phaseAchievementHistory: history };
  const modules = new Map();
  const events = [];
  const handlers = {};
  const getPath = (path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), state);
  const isWorksheet = (id) => Object.values(state.phases).flat().some(i => i.instanceId === id && i.moduleId === 'worksheet');
  const stateManager = {
    get: (p) => getPath(p),
    set: (p, v) => {
      if (fx.completed) return;
      const keys = p.split('.');
      const last = keys.pop();
      let o = state;
      for (const k of keys) o = (o[k] ??= {});
      o[last] = v;
    },
    getModuleState: (id) => modules.get(id) ?? null,
    setModuleState: (id, s) => {
      if (isWorksheet(id)) throw new Error(`zeg-sheet must not write worksheet state directly (${id})`);
      if (!fx.completed) modules.set(id, structuredClone(s));
    },
    listInstances: (moduleId) => Object.values(state.phases).flat()
      .filter(i => i.moduleId === moduleId).map(i => ({ instanceId: i.instanceId, moduleId, title: '' })),
    getProjectCycle: () => cycle,
    getActiveProjectId: () => 'p1',
    isCompleted: () => fx.completed,
  };
  useStoredWorksheetReader(stateManager);
  const eventBus = {
    emit: (name, payload) => { events.push([name, payload]); (handlers[name] || []).forEach(h => h(payload)); },
    on: (name, h) => { (handlers[name] ??= []).push(h); },
    off: (name, h) => { handlers[name] = (handlers[name] || []).filter(x => x !== h); },
  };
  const i18n = { t: (k) => ({ 'dashboard.zegSheet.name': 'Zielerreichungsgrad', 'dashboard.zegSheet.date': 'Datum', 'modules.worksheet.defaultSheetName': 'Tabelle' }[k] ?? k.split('.').pop()) };
  const fx = { state, modules, events, stacks: [], completed, hold: null, loaded: true };
  fx.ctx = { stateManager, eventBus, i18n, interact: makeWorksheetSurface(fx) };
  return fx;
}

const zegSheetState = (modules, ref) => modules.get(ref.instanceId).sheets.find(s => s.id === ref.sheetId).state;
const colOf = (st, ref) => st.columns.find(c => c.meta?.managedRef === ref);
const methodsOf = (stack) => stack.map(a => a.op === 'module.add' ? 'module.add' : a.method);

suite('core/zeg-sheet ensureZegSheet', () => {
  test('creates a worksheet in data via interact, filled from the history, once', async () => {
    const t = new Date(2026, 6, 10, 9).getTime();
    const fx = makeCtx({ history: { define: [{ t, v: 90 }] } });
    const ref = await ensureZegSheet(fx.ctx);
    assertEqual(fx.stacks.length, 2);
    const [add] = fx.stacks[0];
    assertEqual(add.op, 'module.add');
    assertEqual(add.module, 'worksheet');
    assertEqual(add.phase, 'data');
    assertDeepEqual(methodsOf(fx.stacks[0]), ['module.add', 'renameSheet', 'read']);
    assertEqual(fx.stacks[1][0].method, 'writeColumns');
    assertEqual(fx.state.phases.data.length, 1);
    assertEqual(fx.state.phases.data[0].moduleId, 'worksheet');
    assertEqual(fx.state.phases.data[0].customName, 'Zielerreichungsgrad');
    assertEqual(fx.modules.get(ref.instanceId).sheets[0].name, 'Zielerreichungsgrad');
    const st = zegSheetState(fx.modules, ref);
    assertDeepEqual(colOf(st, DATE_REF).values, ['2026-07-10']);
    assertDeepEqual(colOf(st, 'define').values, [90]);
    // The start columns and rows of the fresh sheet are gone.
    assertEqual(st.columns.some(c => c.id === 's1' || c.id === 's2'), false);
    assertEqual(st.rowCount, 1);

    const again = await ensureZegSheet(fx.ctx);
    assertEqual(again.instanceId, ref.instanceId);
    assertEqual(fx.state.phases.data.length, 1);
    assertEqual(fx.stacks.length, 2, 'a second call on a consistent sheet sends no stack');
  });

  test('DMADV columns follow the cycle', async () => {
    const { modules, ctx } = makeCtx({ cycle: 'dmadv' });
    const ref = await ensureZegSheet(ctx);
    const refs = zegSheetState(modules, ref).columns.map(c => c.meta.managedRef);
    assertDeepEqual(refs, [DATE_REF, 'define', 'measure', 'analyze', 'design', 'verify']);
  });

  test('two calls at once create one sheet', async () => {
    const fx = makeCtx();
    const [a, b] = await Promise.all([ensureZegSheet(fx.ctx), ensureZegSheet(fx.ctx)]);
    assertEqual(a.instanceId, b.instanceId);
    assertEqual(fx.state.phases.data.length, 1);
  });

  test('a worksheet the facade cannot read yet is read through interact before creating', async () => {
    const fx = makeCtx();
    const ref = await ensureZegSheet(fx.ctx);
    const stacks = fx.stacks.length;
    // Reload: the worksheet code is not loaded, readSync answers not_loaded.
    fx.loaded = false;
    registerWorksheetReader(fx.ctx.stateManager, (id, o) => {
      if (!fx.loaded) throw Object.assign(new Error('not_loaded'), { code: 'not_loaded' });
      return readWorksheetState(fx.modules.get(id), o);
    });
    const again = await ensureZegSheet(fx.ctx);
    assertEqual(again.instanceId, ref.instanceId);
    assertEqual(fx.state.phases.data.length, 1);
    assertDeepEqual(methodsOf(fx.stacks[stacks]), ['read']);
    assertEqual(fx.stacks.length, stacks + 1);
  });

  test('findZegSheet returns null without a ZEG worksheet', () => {
    const { ctx } = makeCtx();
    assertEqual(findZegSheet(ctx.stateManager), null);
  });

  test('read-only project: throws instead of creating nothing silently', async () => {
    const fx = makeCtx({ completed: true });
    let threw = false;
    try { await ensureZegSheet(fx.ctx); } catch { threw = true; }
    assertTrue(threw);
    assertEqual(fx.stacks.length, 0);
  });
});

suite('core/zeg-sheet sync', () => {
  test('sheet edit rewrites history, achievement and emits source zeg-sheet', async () => {
    const t = new Date(2026, 6, 10, 9).getTime();
    const { state, modules, events, ctx } = makeCtx({ history: { define: [{ t, v: 90 }, { t: new Date(2026, 11, 10).getTime(), v: 0 }] } });
    const ref = await ensureZegSheet(ctx);
    colOf(zegSheetState(modules, ref), 'define').values[1] = null;          // clear the accidental 0
    const changed = syncSheetToHistory(ctx, ref.instanceId);
    assertDeepEqual(changed, ['define']);
    assertDeepEqual(state.phaseAchievementHistory.define, [{ t, v: 90 }]);
    assertEqual(state.phaseAchievement.define, 90);
    assertTrue(events.some(([n, p]) => n === 'phase:achievement-changed' && p.phase === 'define' && p.value === 90 && p.source === 'zeg-sheet'));
  });

  test('unchanged sheet is a no-op (no events)', async () => {
    const { events, ctx } = makeCtx({ history: { define: [{ t: Date.now(), v: 10 }] } });
    const ref = await ensureZegSheet(ctx);
    const before = events.length;
    assertDeepEqual(syncSheetToHistory(ctx, ref.instanceId), []);
    assertEqual(events.length, before);
  });

  test('other worksheet instances are ignored', async () => {
    const { ctx } = makeCtx();
    await ensureZegSheet(ctx);
    assertDeepEqual(syncSheetToHistory(ctx, 'someone-else'), []);
  });

  test('a cleared phase sets its achievement to 0', async () => {
    const { state, modules, ctx } = makeCtx({ history: { measure: [{ t: Date.now(), v: 40 }] } });
    const ref = await ensureZegSheet(ctx);
    colOf(zegSheetState(modules, ref), 'measure').values[0] = null;
    syncSheetToHistory(ctx, ref.instanceId);
    assertEqual(state.phaseAchievement.measure, 0);
  });

  test('installed sync: pencil event rewrites sheet via interact, own events are ignored', async () => {
    const fx = makeCtx();
    const ref = await ensureZegSheet(fx.ctx);
    installZegSheetSync(fx.ctx);
    fx.state.phaseAchievementHistory = { analyze: [{ t: Date.now(), v: 77 }] };
    fx.ctx.eventBus.emit('phase:achievement-changed', { phase: 'analyze', value: 77 });
    await flush();
    assertEqual(colOf(zegSheetState(fx.modules, ref), 'analyze').values[0], 77);
    const stacks = fx.stacks.length;
    fx.ctx.eventBus.emit('phase:achievement-changed', { phase: 'analyze', value: 77, source: 'zeg-sheet' });
    await flush();
    assertEqual(fx.stacks.length, stacks);
  });

  test('installed sync: worksheet:dataChanged writes back, never sends a stack', async () => {
    const fx = makeCtx();
    const ref = await ensureZegSheet(fx.ctx);
    installZegSheetSync(fx.ctx);
    const stacks = fx.stacks.length;
    colOf(zegSheetState(fx.modules, ref), 'define').values[0] = 25;
    fx.ctx.eventBus.emit('worksheet:dataChanged', { instanceId: ref.instanceId });
    await flush();
    assertEqual(fx.state.phaseAchievementHistory.define.length, 1);
    assertEqual(fx.state.phaseAchievement.define, 25);
    assertEqual(fx.stacks.length, stacks);
  });

  test('consistent project: opening (dataChanged after preload) sends no stack and changes nothing', async () => {
    const fx = makeCtx({ history: { define: [{ t: new Date(2026, 6, 10, 12).getTime(), v: 30 }] } });
    const ref = await ensureZegSheet(fx.ctx);
    installZegSheetSync(fx.ctx);
    const history = JSON.stringify(fx.state.phaseAchievementHistory);
    const stacks = fx.stacks.length;
    const events = fx.events.length;
    fx.ctx.eventBus.emit('worksheet:dataChanged', { instanceId: ref.instanceId });
    await ensureZegSheet(fx.ctx);                     // the edit link on the dashboard
    await flush();
    assertEqual(fx.stacks.length, stacks);
    assertEqual(JSON.stringify(fx.state.phaseAchievementHistory), history);
    assertEqual(fx.events.length, events + 1, 'only the emitted dataChanged itself');
  });

  test('installed sync: cycle switch rebuilds the phase columns', async () => {
    const fx = makeCtx();
    const ref = await ensureZegSheet(fx.ctx);
    installZegSheetSync(fx.ctx);
    fx.ctx.stateManager.getProjectCycle = () => 'dmadv';
    fx.ctx.eventBus.emit('cycle:changed', { cycle: 'dmadv' });
    await flush();
    const refs = zegSheetState(fx.modules, ref).columns.map(c => c.meta.managedRef);
    assertDeepEqual(refs, [DATE_REF, 'define', 'measure', 'analyze', 'design', 'verify']);
  });

  test('installed sync: handlers do not wait for the stack (no deadlock inside an agent op)', async () => {
    const fx = makeCtx();
    await ensureZegSheet(fx.ctx);
    installZegSheetSync(fx.ctx);
    let release;
    fx.hold = new Promise(r => { release = r; });   // the surface is busy with another op
    fx.state.phaseAchievementHistory = { define: [{ t: Date.now(), v: 12 }] };
    const stacks = fx.stacks.length;
    // emit returns although the kernel stack waits behind the running op.
    fx.ctx.eventBus.emit('phase:achievement-changed', { phase: 'define', value: 12 });
    fx.ctx.eventBus.emit('cycle:changed', {});
    assertTrue(fx.stacks.length > stacks);
    release();
    await flush();
  });

  test('installed sync: a failed stack is logged, not thrown', async () => {
    const fx = makeCtx();
    await ensureZegSheet(fx.ctx);
    installZegSheetSync(fx.ctx);
    const warn = console.warn;
    const warned = [];
    console.warn = (...a) => { warned.push(a); };
    try {
      fx.ctx.interact = async () => ({ ok: false, error: 'call_failed', results: [] });
      fx.state.phaseAchievementHistory = { define: [{ t: Date.now(), v: 12 }] };
      fx.ctx.eventBus.emit('phase:achievement-changed', { phase: 'define', value: 12 });
      await flush();
    } finally { console.warn = warn; }
    assertEqual(warned.length, 1);
    assertTrue(String(warned[0][0]).startsWith('[zeg-sheet]'));
  });

  test('a user formula survives a rewrite (formulas spread back onto their column)', async () => {
    const fx = makeCtx({ history: { define: [{ t: new Date(2026, 6, 10, 12).getTime(), v: 30 }] } });
    const ref = await ensureZegSheet(fx.ctx);
    const st = zegSheetState(fx.modules, ref);
    st.columns.push({ id: 'u1', name: 'Doppelt', type: 'numeric', values: [60], formulas: ['=C2*2'], format: {}, meta: null });
    fx.state.phaseAchievementHistory = { define: [...fx.state.phaseAchievementHistory.define, { t: new Date(2026, 6, 12, 12).getTime(), v: 50 }] };
    assertEqual(await writeHistoryToSheet(fx.ctx), true);
    const u1 = zegSheetState(fx.modules, ref).columns.find(c => c.id === 'u1');
    assertEqual(u1.formulas[0], '=C2*2');
  });

  test('stored meta in another key order: no stack', async () => {
    const fx = makeCtx({ history: { define: [{ t: new Date(2026, 6, 10, 12).getTime(), v: 30 }] } });
    const ref = await ensureZegSheet(fx.ctx);
    for (const c of zegSheetState(fx.modules, ref).columns) {
      c.meta = { managedRef: c.meta.managedRef, managedBy: c.meta.managedBy };
    }
    const stacks = fx.stacks.length;
    assertEqual(await writeHistoryToSheet(fx.ctx), true);
    assertEqual(fx.stacks.length, stacks);
  });

  test('writeHistoryToSheet without a change in the history sends no stack', async () => {
    const fx = makeCtx({ history: { define: [{ t: Date.now(), v: 10 }] } });
    await ensureZegSheet(fx.ctx);
    const stacks = fx.stacks.length;
    assertEqual(await writeHistoryToSheet(fx.ctx), true);
    assertEqual(fx.stacks.length, stacks);
  });

  test('read-only project: writeHistoryToSheet sends nothing', async () => {
    const fx = makeCtx({ history: { define: [{ t: Date.now(), v: 10 }] } });
    const ref = await ensureZegSheet(fx.ctx);
    const before = JSON.stringify(zegSheetState(fx.modules, ref));
    const stacks = fx.stacks.length;
    fx.completed = true;
    fx.state.phaseAchievementHistory = { define: [{ t: Date.now(), v: 99 }] };
    assertEqual(await writeHistoryToSheet(fx.ctx), false);
    assertEqual(fx.stacks.length, stacks);
    assertEqual(JSON.stringify(zegSheetState(fx.modules, ref)), before);
  });

  test('writeHistoryToSheet without a sheet does nothing', async () => {
    const { ctx } = makeCtx();
    assertEqual(await writeHistoryToSheet(ctx), false);
  });
});

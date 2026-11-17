/**
 * Tests for core/zeg-sheet/zeg-sheet.js — wiring with fake stateManager/eventBus.
 * Reads go through the worksheet facade (stored-state reader of the test
 * helper); writes go only through `workspace.interactAsKernel` (F1.14d). The
 * fake kernel surface (`tests/helpers/kernel-surface.js`) runs the stack
 * against the real worksheet model (`WorksheetModel`, target form) on the
 * stored state, all or nothing, like the agent surface does for a worksheet
 * that is not mounted.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import {
  findZegSheet, ensureZegSheet, syncSheetToHistory, writeHistoryToSheet, installZegSheetSync,
} from '../../js/core/zeg-sheet/zeg-sheet.js';
import { DATE_REF, buildSheetState } from '../../js/core/zeg-sheet/zeg-sheet-model.js';
import { registerWorksheetReader } from '../../js/core/worksheet-columns.js';
import { WorksheetModel } from '../../js/modules/worksheet/domain/model.js';
import { readWorksheetState } from '../helpers/legacy-worksheet-read.js';
import { fakeKernelSurface } from '../helpers/kernel-surface.js';

// Mirrors the real StateManager: get/getModuleState hand out live references,
// set stores the value as is, setModuleState stores a clone.
function makeCtx({ cycle = 'dmaic', history = {}, completed = false } = {}) {
  const state = { phases: { data: [], define: [] }, phaseAchievement: {}, phaseAchievementHistory: history };
  const modules = new Map();
  const events = [];
  const handlers = {};
  const getPath = (path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), state);
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
    setModuleState: (id, s) => { fx.saves++; if (!fx.completed) modules.set(id, structuredClone(s)); },
    listInstances: (moduleId) => Object.values(state.phases).flat()
      .filter(i => i.moduleId === moduleId).map(i => ({ instanceId: i.instanceId, moduleId, title: '' })),
    getProjectCycle: () => cycle,
    getActiveProjectId: () => 'p1',
    isCompleted: () => fx.completed,
  };
  const eventBus = {
    emit: (name, payload) => { events.push([name, payload]); (handlers[name] || []).forEach(h => h(payload)); },
    on: (name, h) => { (handlers[name] ??= []).push(h); },
    off: (name, h) => { handlers[name] = (handlers[name] || []).filter(x => x !== h); },
  };
  const i18n = { t: (k) => ({ 'dashboard.zegSheet.name': 'Zielerreichungsgrad', 'dashboard.zegSheet.date': 'Datum', 'worksheet.defaultSheetName': 'Tabelle' }[k] ?? k.split('.').pop()) };

  // Fassade: wie `readSync`; solange `fx.loaded` falsch ist, wie ein noch nicht geladener Code.
  registerWorksheetReader(stateManager, (id, options) => {
    if (!fx.loaded) throw Object.assign(new Error('not_loaded'), { code: 'not_loaded' });
    if (!stateManager.listInstances('worksheet').some(i => i.instanceId === id)) {
      throw Object.assign(new Error('unknown_instance'), { code: 'unknown_instance' });
    }
    return readWorksheetState(modules.get(id) ?? null, options);
  });
  const instances = {
    list: ({ modules: ids } = {}) => Object.values(state.phases).flat()
      .filter(i => !ids || ids.includes(i.moduleId)).map(i => ({ instanceId: i.instanceId, moduleId: i.moduleId })),
    read: async () => { fx.reads++; fx.loaded = true; return {}; },
  };
  // Die Agentenfläche für einen Kerndienst: ganz oder gar nicht, Model-Kommandos ohne Mount.
  const workspace = fakeKernelSurface({ state, modules, isCompleted: () => fx.completed });
  const fx = {
    state, modules, events, stacks: workspace.stacks, completed, saves: 0, reads: 0, loaded: true,
    ctx: { stateManager, eventBus, i18n, instances, workspace },
  };
  return fx;
}

/** The ZEG sheet as read through the facade's stored-state reader. */
function zegSheet(fx, ref) {
  const head = readWorksheetState(fx.modules.get(ref.instanceId), { sheetId: ref.sheetId });
  return readWorksheetState(fx.modules.get(ref.instanceId), { sheetId: ref.sheetId, columns: head.columns.map(c => c.id), fields: ['formulas'] });
}
const colOf = (sheet, ref) => sheet.columns.find(c => c.meta?.managedRef === ref);

/** Overwrite one cell of the stored ZEG sheet, as an edit in the sheet would. */
function editCell(fx, ref, managedRef, row, value) {
  const model = WorksheetModel.fromJSON(fx.modules.get(ref.instanceId));
  const col = zegSheet(fx, ref).columns.find(c => c.meta?.managedRef === managedRef);
  model.setCells({ sheetId: ref.sheetId, columnId: col.id, startRow: row, values: [value] });
  fx.modules.set(ref.instanceId, structuredClone(model.toJSON()));
}

/** A worksheet stored in the target form holding a ZEG sheet built from `rows`. */
function seedTargetFormZegSheet(fx, rows, phaseIds = ['define', 'measure', 'analyze', 'improve', 'control']) {
  const sheet = buildSheetState(null, rows, phaseIds, { date: 'Datum', phases: {} });
  const model = WorksheetModel.fromJSON({ sheets: [{ id: 'sheet_1', name: 'Zielerreichungsgrad', state: sheet }], activeSheetId: 'sheet_1', sheetCounter: 1 });
  fx.state.phases.data.push({ instanceId: 'ws-z', moduleId: 'worksheet', order: 0, state: {} });
  fx.modules.set('ws-z', structuredClone(model.toJSON()));
  return { instanceId: 'ws-z', sheetId: 'sheet_1' };
}

suite('core/zeg-sheet ensureZegSheet', () => {
  test('creates a worksheet in data over interact, filled from the history, once', async () => {
    const t = new Date(2026, 6, 10, 9).getTime();
    const fx = makeCtx({ history: { define: [{ t, v: 90 }] } });
    const ref = await ensureZegSheet(fx.ctx);
    assertEqual(fx.state.phases.data.length, 1);
    assertEqual(fx.state.phases.data[0].moduleId, 'worksheet');
    assertEqual(fx.state.phases.data[0].customName, 'Zielerreichungsgrad');
    assertEqual(fx.stacks.length, 1);
    assertEqual(fx.stacks[0].source, 'zeg-sheet');
    const [add] = fx.stacks[0].stack;
    assertDeepEqual([add.op, add.module, add.phase], ['module.add', 'worksheet', 'data']);
    assertTrue(fx.modules.get(ref.instanceId)._schema !== undefined, 'Zielform, vom Arbeitsblatt geschrieben');
    const sheet = zegSheet(fx, ref);
    assertEqual(sheet.rowCount, 1);
    assertDeepEqual(colOf(sheet, DATE_REF).values, ['2026-07-10']);
    assertDeepEqual(colOf(sheet, 'define').values, [90]);
    assertEqual(sheet.columns.length, 6, 'Datum und fünf Phasen, keine leeren Startspalten');
    assertEqual(readWorksheetState(fx.modules.get(ref.instanceId), { fields: ['sheets'] }).sheets[0].name, 'Zielerreichungsgrad');
    const again = await ensureZegSheet(fx.ctx);
    assertEqual(again.instanceId, ref.instanceId);
    assertEqual(fx.state.phases.data.length, 1);
    assertEqual(fx.stacks.length, 1, 'consistent sheet: no second stack');
  });

  test('DMADV columns follow the cycle', async () => {
    const fx = makeCtx({ cycle: 'dmadv' });
    const ref = await ensureZegSheet(fx.ctx);
    const refs = zegSheet(fx, ref).columns.map(c => c.meta.managedRef);
    assertDeepEqual(refs, [DATE_REF, 'define', 'measure', 'analyze', 'design', 'verify']);
  });

  test('findZegSheet returns null without a ZEG worksheet', () => {
    const { ctx } = makeCtx();
    assertEqual(findZegSheet(ctx.stateManager), null);
  });

  test('read-only project: throws instead of creating nothing silently', async () => {
    const { ctx } = makeCtx({ completed: true });
    let threw = false;
    try { await ensureZegSheet(ctx); } catch { threw = true; }
    assertTrue(threw);
  });

  test('a ZEG sheet stored in the target form is found: no second sheet (13b gap)', async () => {
    const fx = makeCtx({ history: { define: [{ t: new Date(2026, 6, 10, 12).getTime(), v: 30 }] } });
    const ref = seedTargetFormZegSheet(fx, [{ date: '2026-07-10', values: { define: 30 } }]);
    const got = await ensureZegSheet(fx.ctx);
    assertDeepEqual(got, ref);
    assertEqual(fx.state.phases.data.length, 1);
  });

  test('worksheet code not loaded yet: loads it, reuses the ZEG sheet, no second one', async () => {
    const fx = makeCtx();
    const ref = await ensureZegSheet(fx.ctx);
    fx.loaded = false;
    assertEqual(findZegSheet(fx.ctx.stateManager), null);
    assertEqual((await ensureZegSheet(fx.ctx)).instanceId, ref.instanceId);
    assertTrue(fx.reads > 0, 'instances.read loaded the code');
    assertEqual(fx.state.phases.data.length, 1);
  });
});

suite('core/zeg-sheet sync', () => {
  test('sheet edit rewrites history, achievement and emits source zeg-sheet', async () => {
    const t = new Date(2026, 6, 10, 9).getTime();
    const fx = makeCtx({ history: { define: [{ t, v: 90 }, { t: new Date(2026, 11, 10).getTime(), v: 0 }] } });
    const ref = await ensureZegSheet(fx.ctx);
    editCell(fx, ref, 'define', 1, null);          // clear the accidental 0
    const changed = syncSheetToHistory(fx.ctx, ref.instanceId);
    assertDeepEqual(changed, ['define']);
    assertDeepEqual(fx.state.phaseAchievementHistory.define, [{ t, v: 90 }]);
    assertEqual(fx.state.phaseAchievement.define, 90);
    assertTrue(fx.events.some(([n, p]) => n === 'phase:achievement-changed' && p.phase === 'define' && p.value === 90 && p.source === 'zeg-sheet'));
  });

  test('unchanged sheet is a no-op (no events)', async () => {
    const fx = makeCtx({ history: { define: [{ t: Date.now(), v: 10 }] } });
    const ref = await ensureZegSheet(fx.ctx);
    const before = fx.events.length;
    assertDeepEqual(syncSheetToHistory(fx.ctx, ref.instanceId), []);
    assertEqual(fx.events.length, before);
  });

  test('other worksheet instances are ignored', async () => {
    const fx = makeCtx();
    await ensureZegSheet(fx.ctx);
    assertDeepEqual(syncSheetToHistory(fx.ctx, 'someone-else'), []);
  });

  test('a cleared phase sets its achievement to 0', async () => {
    const fx = makeCtx({ history: { measure: [{ t: Date.now(), v: 40 }] } });
    const ref = await ensureZegSheet(fx.ctx);
    editCell(fx, ref, 'measure', 0, null);
    syncSheetToHistory(fx.ctx, ref.instanceId);
    assertEqual(fx.state.phaseAchievement.measure, 0);
  });

  test('pencil edit on a target-form sheet that is not mounted: written over interact, no setModuleState', async () => {
    const fx = makeCtx({ history: { define: [{ t: new Date(2026, 6, 10, 12).getTime(), v: 30 }] } });
    const ref = seedTargetFormZegSheet(fx, [{ date: '2026-07-10', values: { define: 30 } }]);
    fx.state.phaseAchievementHistory = { define: [...fx.state.phaseAchievementHistory.define, { t: new Date(2026, 6, 12, 12).getTime(), v: 55 }] };
    const saves = fx.saves;
    assertEqual(await writeHistoryToSheet(fx.ctx), true);
    assertEqual(fx.saves, saves, 'kein direktes setModuleState');
    assertEqual(fx.stacks.length, 1);
    assertEqual(fx.stacks[0].source, 'zeg-sheet');
    assertDeepEqual(colOf(zegSheet(fx, ref), 'define').values, [30, 55]);
    assertDeepEqual(colOf(zegSheet(fx, ref), DATE_REF).values, ['2026-07-10', '2026-07-12']);
  });

  test('installed sync: pencil event rewrites sheet, own events are ignored', async () => {
    const fx = makeCtx();
    const ref = await ensureZegSheet(fx.ctx);
    installZegSheetSync(fx.ctx);
    fx.state.phaseAchievementHistory = { analyze: [{ t: Date.now(), v: 77 }] };
    const stacks = fx.stacks.length;
    fx.ctx.eventBus.emit('phase:achievement-changed', { phase: 'analyze', value: 77 });
    await settleSync();
    assertEqual(colOf(zegSheet(fx, ref), 'analyze').values[0], 77);
    assertEqual(fx.stacks.length, stacks + 1);
    fx.ctx.eventBus.emit('phase:achievement-changed', { phase: 'analyze', value: 77, source: 'zeg-sheet' });
    await settleSync();
    assertEqual(fx.stacks.length, stacks + 1);
  });

  test('installed sync: worksheet:dataChanged writes back', async () => {
    const fx = makeCtx();
    const ref = await ensureZegSheet(fx.ctx);
    installZegSheetSync(fx.ctx);
    editCell(fx, ref, 'define', 0, 25);
    fx.ctx.eventBus.emit('worksheet:dataChanged', { instanceId: ref.instanceId });
    assertEqual(fx.state.phaseAchievementHistory.define.length, 1);
    assertEqual(fx.state.phaseAchievement.define, 25);
  });

  test('installed sync: dataChanged with reason preload (worksheet code just loaded) does not touch the history', async () => {
    const fx = makeCtx({ history: { define: [{ t: Date.now(), v: 10 }] } });
    const ref = await ensureZegSheet(fx.ctx);
    installZegSheetSync(fx.ctx);
    // Sheet and history drifted apart (e.g. an older import); opening the project must not overwrite the history.
    editCell(fx, ref, 'define', 0, 25);
    const before = JSON.stringify(fx.state.phaseAchievementHistory);
    const count = fx.events.length;
    fx.ctx.eventBus.emit('worksheet:dataChanged', { instanceId: ref.instanceId, reason: 'preload' });
    assertEqual(JSON.stringify(fx.state.phaseAchievementHistory), before);
    assertEqual(fx.events.length, count + 1, 'only the emitted dataChanged itself');
    // An actual edit (no reason) still writes back.
    fx.ctx.eventBus.emit('worksheet:dataChanged', { instanceId: ref.instanceId });
    assertEqual(fx.state.phaseAchievement.define, 25);
  });

  test('installed sync: cycle switch rebuilds the phase columns', async () => {
    const fx = makeCtx();
    const ref = await ensureZegSheet(fx.ctx);
    installZegSheetSync(fx.ctx);
    fx.ctx.stateManager.getProjectCycle = () => 'dmadv';
    fx.ctx.eventBus.emit('cycle:changed', { cycle: 'dmadv' });
    await settleSync();
    const refs = zegSheet(fx, ref).columns.map(c => c.meta.managedRef);
    assertDeepEqual(refs, [DATE_REF, 'define', 'measure', 'analyze', 'design', 'verify']);
  });

  test('read-only project: writeHistoryToSheet sends no stack', async () => {
    const fx = makeCtx({ history: { define: [{ t: Date.now(), v: 10 }] } });
    const ref = await ensureZegSheet(fx.ctx);
    const before = JSON.stringify(zegSheet(fx, ref));
    const stacks = fx.stacks.length;
    fx.completed = true;
    fx.state.phaseAchievementHistory = { define: [{ t: Date.now(), v: 99 }] };
    await writeHistoryToSheet(fx.ctx);
    assertEqual(fx.stacks.length, stacks);
    assertEqual(JSON.stringify(zegSheet(fx, ref)), before);
  });

  test('consistent project: opening (dataChanged after preload) and the edit link write nothing', async () => {
    const fx = makeCtx({ history: { define: [{ t: new Date(2026, 6, 10, 12).getTime(), v: 30 }] } });
    const ref = await ensureZegSheet(fx.ctx);
    installZegSheetSync(fx.ctx);
    const stacks = fx.stacks.length;
    const history = JSON.stringify(fx.state.phaseAchievementHistory);
    const events = fx.events.length;
    fx.ctx.eventBus.emit('worksheet:dataChanged', { instanceId: ref.instanceId });
    await ensureZegSheet(fx.ctx);
    assertEqual(fx.stacks.length, stacks, 'no stack');
    assertEqual(JSON.stringify(fx.state.phaseAchievementHistory), history);
    assertEqual(fx.events.length, events + 1, 'only the emitted dataChanged itself');
  });

  test('writeHistoryToSheet without a change in the history sends no stack', async () => {
    const fx = makeCtx({ history: { define: [{ t: Date.now(), v: 10 }] } });
    await ensureZegSheet(fx.ctx);
    const stacks = fx.stacks.length;
    assertEqual(await writeHistoryToSheet(fx.ctx), true);
    assertEqual(fx.stacks.length, stacks);
  });

  test('a user formula survives a rewrite', async () => {
    const fx = makeCtx({ history: { define: [{ t: new Date(2026, 6, 10, 12).getTime(), v: 30 }] } });
    const ref = await ensureZegSheet(fx.ctx);
    const model = WorksheetModel.fromJSON(fx.modules.get(ref.instanceId));
    const [id] = model.writeColumns({ sheetId: ref.sheetId, columns: [{ to: 'append', name: 'Doppelt', values: [null] }] });
    model.setFormula({ sheetId: ref.sheetId, columnId: id, row: 0, formula: '=C2[1]*2' });
    fx.modules.set(ref.instanceId, structuredClone(model.toJSON()));
    fx.state.phaseAchievementHistory = { define: [...fx.state.phaseAchievementHistory.define, { t: new Date(2026, 6, 12, 12).getTime(), v: 50 }] };
    assertEqual(await writeHistoryToSheet(fx.ctx), true);
    const doubled = zegSheet(fx, ref).columns.find(c => c.id === id);
    assertEqual(doubled.values[0], 60);
    assertTrue((zegSheet(fx, ref).formulas ?? []).some(f => f.columnId === id && f.row === 0 && f.formula === '=C2[1]*2'));
  });

  test('a hard-locked user column with a formula does not make the rewrite fail (P11)', async () => {
    const fx = makeCtx({ history: { define: [{ t: new Date(2026, 6, 10, 12).getTime(), v: 30 }] } });
    const ref = await ensureZegSheet(fx.ctx);
    const model = WorksheetModel.fromJSON(fx.modules.get(ref.instanceId));
    const [id] = model.writeColumns({ sheetId: ref.sheetId, columns: [{ to: 'append', name: 'Doppelt', values: [null] }] });
    model.setFormula({ sheetId: ref.sheetId, columnId: id, row: 0, formula: '=C2[1]*2' });
    model.setColumnMeta({ sheetId: ref.sheetId, columnId: id, meta: { lock: 'hard' } });
    fx.modules.set(ref.instanceId, structuredClone(model.toJSON()));
    fx.state.phaseAchievementHistory = { define: [...fx.state.phaseAchievementHistory.define, { t: new Date(2026, 6, 12, 12).getTime(), v: 50 }] };
    assertEqual(await writeHistoryToSheet(fx.ctx), true);
    assertDeepEqual(colOf(zegSheet(fx, ref), 'define').values, [30, 50]);
    assertTrue((zegSheet(fx, ref).formulas ?? []).some(f => f.columnId === id && f.formula === '=C2[1]*2'));
  });

  test('cycle switch drops a day: a hard-locked user cell stays on its date (R18)', async () => {
    const fx = makeCtx({ history: {
      define: [{ t: new Date(2026, 6, 1, 12).getTime(), v: 10 }, { t: new Date(2026, 6, 3, 12).getTime(), v: 30 }],
      improve: [{ t: new Date(2026, 6, 2, 12).getTime(), v: 50 }],
    } });
    const ref = await ensureZegSheet(fx.ctx);
    const model = WorksheetModel.fromJSON(fx.modules.get(ref.instanceId));
    const [id] = model.writeColumns({ sheetId: ref.sheetId, columns: [{ to: 'append', name: 'Notiz', type: 'text', values: ['a', null, 'c'] }] });
    model.setColumnMeta({ sheetId: ref.sheetId, columnId: id, meta: { lock: 'hard' } });
    fx.modules.set(ref.instanceId, structuredClone(model.toJSON()));
    installZegSheetSync(fx.ctx);
    fx.ctx.stateManager.getProjectCycle = () => 'dmadv';
    fx.ctx.eventBus.emit('cycle:changed', { cycle: 'dmadv' });
    await settleSync();
    const sheet = zegSheet(fx, ref);
    assertDeepEqual(colOf(sheet, DATE_REF).values, ['2026-07-01', '2026-07-03']);
    assertDeepEqual(sheet.columns.find(c => c.id === id).values, ['a', 'c']);
  });

  test('writeHistoryToSheet without a sheet does nothing', async () => {
    const { ctx, stacks } = makeCtx();
    assertEqual(await writeHistoryToSheet(ctx), false);
    assertEqual(stacks.length, 0);
  });
});

/** Let the queued, asynchronous writes of the installed sync finish. */
async function settleSync() {
  for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 0));
}

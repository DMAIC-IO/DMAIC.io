/**
 * Tests for core/zeg-sheet/zeg-sheet.js — wiring with fake stateManager/eventBus.
 * Reads go through the worksheet facade (stored-state reader of the test
 * helper); the write is direct until F1.14d (plan F1.14a, Ruling Task 5b).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import {
  findZegSheet, ensureZegSheet, syncSheetToHistory, writeHistoryToSheet, installZegSheetSync,
} from '../../js/core/zeg-sheet/zeg-sheet.js';
import { DATE_REF } from '../../js/core/zeg-sheet/zeg-sheet-model.js';
import { registerWorksheetReader } from '../../js/core/worksheet-columns.js';
import { useStoredWorksheetReader } from '../helpers/worksheet-reader.js';

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
  useStoredWorksheetReader(stateManager);
  const fx = { state, modules, events, completed, saves: 0, ctx: { stateManager, eventBus, i18n } };
  return fx;
}

const zegSheetState = (modules, ref) => modules.get(ref.instanceId).sheets.find(s => s.id === ref.sheetId).state;
const colOf = (st, ref) => st.columns.find(c => c.meta?.managedRef === ref);

suite('core/zeg-sheet ensureZegSheet', () => {
  test('creates a worksheet in data, filled from the history, once', () => {
    const t = new Date(2026, 6, 10, 9).getTime();
    const { state, modules, events, ctx } = makeCtx({ history: { define: [{ t, v: 90 }] } });
    const ref = ensureZegSheet(ctx);
    assertEqual(state.phases.data.length, 1);
    assertEqual(state.phases.data[0].moduleId, 'worksheet');
    assertEqual(state.phases.data[0].customName, 'Zielerreichungsgrad');
    const st = zegSheetState(modules, ref);
    assertDeepEqual(colOf(st, DATE_REF).values, ['2026-07-10']);
    assertDeepEqual(colOf(st, 'define').values, [90]);
    assertTrue(events.some(([n, p]) => n === 'module:added' && p.instanceId === ref.instanceId && p.phase === 'data'));
    const again = ensureZegSheet(ctx);
    assertEqual(again.instanceId, ref.instanceId);
    assertEqual(state.phases.data.length, 1);
  });

  test('DMADV columns follow the cycle', () => {
    const { modules, ctx } = makeCtx({ cycle: 'dmadv' });
    const ref = ensureZegSheet(ctx);
    const refs = zegSheetState(modules, ref).columns.map(c => c.meta.managedRef);
    assertDeepEqual(refs, [DATE_REF, 'define', 'measure', 'analyze', 'design', 'verify']);
  });

  test('findZegSheet returns null without a ZEG worksheet', () => {
    const { ctx } = makeCtx();
    assertEqual(findZegSheet(ctx.stateManager), null);
  });

  test('read-only project: throws instead of creating nothing silently', () => {
    const { ctx } = makeCtx({ completed: true });
    let threw = false;
    try { ensureZegSheet(ctx); } catch { threw = true; }
    assertTrue(threw);
  });
});

suite('core/zeg-sheet sync', () => {
  test('sheet edit rewrites history, achievement and emits source zeg-sheet', () => {
    const t = new Date(2026, 6, 10, 9).getTime();
    const { state, modules, events, ctx } = makeCtx({ history: { define: [{ t, v: 90 }, { t: new Date(2026, 11, 10).getTime(), v: 0 }] } });
    const ref = ensureZegSheet(ctx);
    const ws = modules.get(ref.instanceId);
    const st = ws.sheets[0].state;
    colOf(st, 'define').values[1] = null;          // clear the accidental 0
    modules.set(ref.instanceId, ws);
    const changed = syncSheetToHistory(ctx, ref.instanceId);
    assertDeepEqual(changed, ['define']);
    assertDeepEqual(state.phaseAchievementHistory.define, [{ t, v: 90 }]);
    assertEqual(state.phaseAchievement.define, 90);
    assertTrue(events.some(([n, p]) => n === 'phase:achievement-changed' && p.phase === 'define' && p.value === 90 && p.source === 'zeg-sheet'));
  });

  test('unchanged sheet is a no-op (no events)', () => {
    const { events, ctx } = makeCtx({ history: { define: [{ t: Date.now(), v: 10 }] } });
    const ref = ensureZegSheet(ctx);
    const before = events.length;
    assertDeepEqual(syncSheetToHistory(ctx, ref.instanceId), []);
    assertEqual(events.length, before);
  });

  test('other worksheet instances are ignored', () => {
    const { ctx } = makeCtx();
    ensureZegSheet(ctx);
    assertDeepEqual(syncSheetToHistory(ctx, 'someone-else'), []);
  });

  test('a cleared phase sets its achievement to 0', () => {
    const { state, modules, ctx } = makeCtx({ history: { measure: [{ t: Date.now(), v: 40 }] } });
    const ref = ensureZegSheet(ctx);
    const ws = modules.get(ref.instanceId);
    colOf(ws.sheets[0].state, 'measure').values[0] = null;
    modules.set(ref.instanceId, ws);
    syncSheetToHistory(ctx, ref.instanceId);
    assertEqual(state.phaseAchievement.measure, 0);
  });

  test('installed sync: pencil event rewrites sheet, own events are ignored', () => {
    const { state, modules, events, ctx } = makeCtx();
    const ref = ensureZegSheet(ctx);
    installZegSheetSync(ctx);
    state.phaseAchievementHistory = { analyze: [{ t: Date.now(), v: 77 }] };
    ctx.eventBus.emit('phase:achievement-changed', { phase: 'analyze', value: 77 });
    assertEqual(colOf(zegSheetState(modules, ref), 'analyze').values[0], 77);
    assertTrue(events.some(([n, p]) => n === 'state:remote-changed' && p.instanceIds[0] === ref.instanceId));
    const writes = events.filter(([n]) => n === 'state:remote-changed').length;
    ctx.eventBus.emit('phase:achievement-changed', { phase: 'analyze', value: 77, source: 'zeg-sheet' });
    assertEqual(events.filter(([n]) => n === 'state:remote-changed').length, writes);
  });

  test('installed sync: worksheet:dataChanged writes back', () => {
    const { state, modules, ctx } = makeCtx();
    const ref = ensureZegSheet(ctx);
    installZegSheetSync(ctx);
    const ws = modules.get(ref.instanceId);
    colOf(ws.sheets[0].state, 'define').values[0] = 25;
    modules.set(ref.instanceId, ws);
    ctx.eventBus.emit('worksheet:dataChanged', { instanceId: ref.instanceId });
    assertEqual(state.phaseAchievementHistory.define.length, 1);
    assertEqual(state.phaseAchievement.define, 25);
  });

  test('installed sync: dataChanged with reason preload (worksheet code just loaded) does not touch the history', () => {
    const { state, modules, ctx, events } = makeCtx({ history: { define: [{ t: Date.now(), v: 10 }] } });
    const ref = ensureZegSheet(ctx);
    installZegSheetSync(ctx);
    // Sheet and history drifted apart (e.g. an older import); opening the project must not overwrite the history.
    const ws = modules.get(ref.instanceId);
    colOf(ws.sheets[0].state, 'define').values[0] = 25;
    modules.set(ref.instanceId, ws);
    const before = JSON.stringify(state.phaseAchievementHistory);
    const count = events.length;
    ctx.eventBus.emit('worksheet:dataChanged', { instanceId: ref.instanceId, reason: 'preload' });
    assertEqual(JSON.stringify(state.phaseAchievementHistory), before);
    assertEqual(events.length, count + 1, 'only the emitted dataChanged itself');
    // An actual edit (no reason) still writes back.
    ctx.eventBus.emit('worksheet:dataChanged', { instanceId: ref.instanceId });
    assertEqual(state.phaseAchievement.define, 25);
  });

  test('installed sync: cycle switch rebuilds the phase columns', () => {
    const fx = makeCtx();
    const ref = ensureZegSheet(fx.ctx);
    installZegSheetSync(fx.ctx);
    fx.ctx.stateManager.getProjectCycle = () => 'dmadv';
    fx.ctx.eventBus.emit('cycle:changed', { cycle: 'dmadv' });
    const refs = zegSheetState(fx.modules, ref).columns.map(c => c.meta.managedRef);
    assertDeepEqual(refs, [DATE_REF, 'define', 'measure', 'analyze', 'design', 'verify']);
  });

  test('read-only project: writeHistoryToSheet leaves the cached sheet untouched', () => {
    const fx = makeCtx({ history: { define: [{ t: Date.now(), v: 10 }] } });
    const ref = ensureZegSheet(fx.ctx);
    const before = JSON.stringify(zegSheetState(fx.modules, ref));
    fx.completed = true;
    fx.state.phaseAchievementHistory = { define: [{ t: Date.now(), v: 99 }] };
    writeHistoryToSheet(fx.ctx);
    assertEqual(JSON.stringify(zegSheetState(fx.modules, ref)), before);
  });

  test('consistent project: opening (dataChanged after preload) and the edit link write nothing', () => {
    const fx = makeCtx({ history: { define: [{ t: new Date(2026, 6, 10, 12).getTime(), v: 30 }] } });
    const ref = ensureZegSheet(fx.ctx);
    installZegSheetSync(fx.ctx);
    const saves = fx.saves;
    const history = JSON.stringify(fx.state.phaseAchievementHistory);
    const events = fx.events.length;
    fx.ctx.eventBus.emit('worksheet:dataChanged', { instanceId: ref.instanceId });
    ensureZegSheet(fx.ctx);
    assertEqual(fx.saves, saves, 'no setModuleState');
    assertEqual(JSON.stringify(fx.state.phaseAchievementHistory), history);
    assertEqual(fx.events.length, events + 1, 'only the emitted dataChanged itself');
  });

  test('writeHistoryToSheet without a change in the history does not write', () => {
    const fx = makeCtx({ history: { define: [{ t: Date.now(), v: 10 }] } });
    ensureZegSheet(fx.ctx);
    const saves = fx.saves;
    const events = fx.events.length;
    assertEqual(writeHistoryToSheet(fx.ctx), true);
    assertEqual(fx.saves, saves);
    assertEqual(fx.events.length, events);
  });

  test('stored meta in another key order: no write', () => {
    const fx = makeCtx({ history: { define: [{ t: new Date(2026, 6, 10, 12).getTime(), v: 30 }] } });
    const ref = ensureZegSheet(fx.ctx);
    for (const c of zegSheetState(fx.modules, ref).columns) {
      c.meta = { managedRef: c.meta.managedRef, managedBy: c.meta.managedBy };
    }
    const saves = fx.saves;
    writeHistoryToSheet(fx.ctx);
    assertEqual(fx.saves, saves);
  });

  test('a user formula survives a rewrite', () => {
    const fx = makeCtx({ history: { define: [{ t: new Date(2026, 6, 10, 12).getTime(), v: 30 }] } });
    const ref = ensureZegSheet(fx.ctx);
    zegSheetState(fx.modules, ref).columns.push({ id: 'u1', name: 'Doppelt', type: 'numeric', values: [60], formulas: ['=C2*2'], format: {}, meta: null });
    fx.state.phaseAchievementHistory = { define: [...fx.state.phaseAchievementHistory.define, { t: new Date(2026, 6, 12, 12).getTime(), v: 50 }] };
    const saves = fx.saves;
    assertEqual(writeHistoryToSheet(fx.ctx), true);
    assertEqual(fx.saves, saves + 1);
    assertEqual(zegSheetState(fx.modules, ref).columns.find(c => c.id === 'u1').formulas[0], '=C2*2');
  });

  test('worksheet code not loaded yet: the edit link reuses the ZEG sheet, no second one', () => {
    const fx = makeCtx();
    const ref = ensureZegSheet(fx.ctx);
    registerWorksheetReader(fx.ctx.stateManager, () => { throw Object.assign(new Error('not_loaded'), { code: 'not_loaded' }); });
    assertEqual(findZegSheet(fx.ctx.stateManager), null);
    assertEqual(ensureZegSheet(fx.ctx).instanceId, ref.instanceId);
    assertEqual(fx.state.phases.data.length, 1);
  });

  test('writeHistoryToSheet without a sheet does nothing', () => {
    const { ctx } = makeCtx();
    assertEqual(writeHistoryToSheet(ctx), false);
  });
});

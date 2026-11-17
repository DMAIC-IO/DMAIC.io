/**
 * planZegStack gegen ein echtes Arbeitsblatt: der geplante Stapel läuft
 * über die echte Agentenfläche (`interactAsModule` mit Kern-Aufrufer, wie
 * `Workspace#interactAsKernel`) mit dem echten Eintrag `worksheet` (aus dem
 * Schema des Models) gegen das Model des Arbeitsblatts.
 * Danach zeigt das Blatt den Zielstand: ein zweites Planen ist leer.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import worksheetMod from '../../js/modules/worksheet/viewmodel/viewmodel.js';
import { createAgentRuntime } from '../../js/core/agent/agent-runtime.js';
import { AGENT_REGISTRY } from '../../js/core/agent/agent-registry.generated.js';
import { buildSheetState, planZegStack, isZegColumn } from '../../js/core/zeg-sheet/zeg-sheet-model.js';

const WS_ID = 'ws-zeg';
const LABELS = { date: 'Datum', phases: { define: 'Define', measure: 'Measure', analyze: 'Analyze', control: 'Control' } };
const D0 = { date: '2026-07-01', values: { define: 5 } };
const D1 = { date: '2026-07-10', values: { define: 20, measure: 10 } };
const D2 = { date: '2026-07-12', values: { define: 40, measure: null } };
const D3 = { date: '2026-07-14', values: { define: 60, measure: 30 } };
const I18N = { getLanguage: () => 'de', exists: () => false, t: (k) => k, tf: () => (k) => k };

/**
 * Ein Arbeitsblatt mit dem Blattzustand `state` (Altform eines Blatts:
 * Spalten mit `values`/`formulas`, `rowCount`) und eine Agentenfläche,
 * deren Host genau dieses Model liefert.
 */
async function setup(state) {
  const sheetId = 'sheet_1';
  const model = worksheetMod.loadDetached(
    { sheets: [{ id: sheetId, name: 'ZEG', state }], activeSheetId: sheetId, sheetCounter: 1 },
    { instanceId: WS_ID, eventBus: null, stateManager: null },
  );
  const phases = { data: [{ instanceId: WS_ID, moduleId: 'worksheet', order: 0 }] };
  const stateManager = {
    getActiveProjectId: () => 'p-1',
    getProjectCycle: () => 'dmaic',
    get: (path) => (path === 'phases' ? phases : path.startsWith('phases.') ? phases[path.slice(7)] : undefined),
    set() {},
    getModuleState: () => null,
    setModuleState() {},
    removeModuleState() {},
    getModuleRevision: () => 1,
    getStructureRevision: () => 1,
    saveNow: () => {},
    flushNow: async () => {},
  };
  const defs = [{ id: 'worksheet', phase: 'data' }];
  const runtime = createAgentRuntime({
    stateManager,
    moduleRegistry: {
      getAll: () => defs, get: (id) => defs.find(d => d.id === id), getActiveCycle: () => 'dmaic',
      loadModule: async () => worksheetMod,
    },
    i18n: I18N,
    registry: { worksheet: AGENT_REGISTRY.worksheet },
    getHelp: async () => null,
    appVersion: 'test',
    consent: { ensure: async () => ({ ok: true }) },
    host: {
      isCompleted: () => false,
      getCurrentView: () => ({ instanceId: WS_ID, module: 'worksheet', phase: 'data' }),
      openInstance: async (id) => ({ instanceId: id, module: 'worksheet', phase: 'data' }),
      getViewmodel: async () => ({ model }),
      addInstance: async () => { throw new Error('not in this test'); },
      removeInstance: async () => false,
      restoreInstance: async () => {},
      applyLiveState: () => {},
      historyBegin: () => {},
      historyEnd: () => {},
      settle: async () => {},
      isMounted: () => true,
      isDisplayed: () => true,
      notifyBackgroundChange: () => {},
    },
  });
  /** Das Blatt in der Form, die planZegStack liest. */
  const current = () => {
    const sheet = model.sheetById(sheetId);
    const n = sheet.data.rowCount;
    return {
      rowCount: n,
      columns: sheet.columns.map((c, i) => {
        const byRow = sheet.formulas[c.id] ?? {};
        return {
          id: c.id, name: c.name, type: c.type, format: { ...c.format }, meta: c.meta ? { ...c.meta } : null,
          values: [...sheet.data.columns[i]],
          formulas: Array.from({ length: n }, (_, r) => byRow[String(r)] ?? null),
        };
      }),
    };
  };
  return {
    model,
    sheetId,
    /** Wie `Workspace#interactAsKernel(stack, 'zeg-sheet')`. */
    interact: (stack) => runtime.interactAsModule(stack, { instanceId: null, moduleId: 'zeg-sheet' }),
    current,
    async unmount() {},
  };
}

/** Spalten ohne die frisch vergebenen Ids, zum Vergleich mit dem Ziel. */
const shape = (st) => st.columns.map(c => [
  isZegColumn(c) ? c.meta.managedRef : c.id, c.name, c.type,
  Array.from({ length: st.rowCount }, (_, i) => c.values[i] ?? null),
  Array.from({ length: st.rowCount }, (_, i) => c.formulas?.[i] ?? null),
]);

suite('core/zeg-sheet planZegStack gegen ein echtes Arbeitsblatt', () => {
  test('neue Phase vor Nutzerspalte, weggefallene Phase, Formel in verschobener Zeile', async () => {
    const prev = buildSheetState(null, [D1, D2], ['define', 'measure', 'control'], LABELS);
    prev.columns.push({ id: 'u1', name: 'Doppelt', shortName: 'C5', type: 'numeric', values: [null, 80], formulas: [null, '=40*2'], format: { decimals: 0 }, meta: null, role: 'continuous', roleManual: false });
    const w = await setup(prev);
    try {
      const next = buildSheetState(w.current(), [D0, D1, D2], ['define', 'measure', 'analyze'], LABELS);
      const stack = planZegStack(WS_ID, w.sheetId, w.current(), next);
      const out = await w.interact(stack);
      assertEqual(out.ok, true, JSON.stringify(out));
      assertDeepEqual(shape(w.current()), shape(next));
      assertDeepEqual(w.current().columns.map(c => c.meta?.managedRef ?? null), ['date', 'define', 'measure', 'analyze', null]);
      // Die Zeile mit der Formel ist um eins nach unten gerückt.
      assertEqual(w.current().columns[4].formulas[2], '=40*2');
      const again = buildSheetState(w.current(), [D0, D1, D2], ['define', 'measure', 'analyze'], LABELS);
      assertDeepEqual(planZegStack(WS_ID, w.sheetId, w.current(), again), []);
    } finally { await w.unmount(); }
  });

  test('weniger Zeilen: das Blatt schrumpft auf next.rowCount', async () => {
    const prev = buildSheetState(null, [D1, D2, D3], ['define', 'measure'], LABELS);
    const w = await setup(prev);
    try {
      const next = buildSheetState(w.current(), [D2], ['define', 'measure'], LABELS);
      const out = await w.interact(planZegStack(WS_ID, w.sheetId, w.current(), next));
      assertEqual(out.ok, true, JSON.stringify(out));
      assertEqual(w.model.sheetById(w.sheetId).data.rowCount, 1);
      assertDeepEqual(shape(w.current()), shape(next));
      assertDeepEqual(planZegStack(WS_ID, w.sheetId, w.current(),
        buildSheetState(w.current(), [D2], ['define', 'measure'], LABELS)), []);
    } finally { await w.unmount(); }
  });
});

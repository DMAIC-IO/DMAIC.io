/**
 * Worksheet im Browser: der Empfänger von `worksheet:writeColumns` mit
 * eingehängtem Grid (echtes Modul, Fake-Dienste, schlankes Template).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import worksheetMod from '../../js/modules/worksheet/worksheet.js';
import { applyWriteColumn, commitWorksheetWrite, worksheetWrite } from '../../js/core/worksheet-write.js';
import { validRolesForType } from '../../js/core/datagrid/datagrid-roles.js';

// ─── Empfänger worksheet:writeColumns (eingehängtes Grid) ────────

const WS_TPL_KEY = 'js/modules/worksheet/worksheet.html';
const flush = () => new Promise((r) => setTimeout(r, 0));

function ensureWorksheetTemplate() {
  if (!Alpine.version) Alpine.start();
  if (document.querySelector(`template[data-tpl="${WS_TPL_KEY}"]`)) return;
  // Schlankes Gerüst mit den Ankern, die init() einhängt
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', WS_TPL_KEY);
  tpl.innerHTML = '<section x-data="worksheet">'
    + '<div class="datagrid" data-ref="grid-wrap"><div data-ref="dropzone"></div></div>'
    + '<div data-ref="fe-holder"></div>'
    + '</section>';
  document.body.append(tpl);
}

/** Einen Worksheet `ws-w` mit einem Blatt aus fünf leeren Spalten einhängen. */
async function mountWorksheet() {
  ensureWorksheetTemplate();
  const states = {};
  const handlers = [];
  const emitted = [];
  const bus = {
    on: (n, fn) => handlers.push([n, fn]),
    off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (n, p) => { emitted.push([n, p]); for (const [a, f] of [...handlers]) if (a === n) f(p); },
  };
  const context = {
    instanceId: 'ws-w',
    stateManager: {
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'dmaic',
      get: (k) => ({ phases: { data: [] }, 'phases.data': [{ instanceId: 'ws-w', moduleId: 'worksheet' }] })[k],
    },
    i18n: { t: (k) => k, tf: () => (k) => k, getLanguage: () => 'de' },
    eventBus: bus,
    chartManager: { create: async () => ({}), update: () => {}, destroy: () => {} },
    notify: () => {},
    dialog: { confirm: async () => true, form: () => ({ close() {} }) },
    theme: 'light',
    language: 'de',
  };
  const container = document.createElement('div');
  document.body.append(container);
  const instance = Object.create(worksheetMod);
  await instance.init(container, context);
  await flush();
  const vm = Alpine.$data(container.querySelector('[x-data]'));
  vm._grid.setState({
    columns: [0, 1, 2, 3, 4].map((i) => ({ id: `e${i}`, name: '', type: 'numeric', values: [null, null, null], format: { decimals: 6 } })),
    rowCount: 3,
  });
  vm._grid.history.clear();
  const sheetId = vm.model.activeSheetId;
  return {
    vm, bus, emitted, sheetId, context, instance,
    async unmount() { await instance.destroy(); container.remove(); },
  };
}

suite('Worksheet — Verlaufshaken', () => {
  test('historyBegin/historyEnd bündeln Grid-Aktionen zu einem Rückgängig-Schritt', async () => {
    const w = await mountWorksheet();
    try {
      const before = w.vm._grid.columns.length;
      w.instance.historyBegin();
      w.vm._grid.addColumn();
      w.vm._grid.setCellValue('e0', 0, 4);
      w.instance.historyEnd();
      assertEqual(w.vm._grid.history.peek()?.type, 'group');
      w.vm._grid.undo();
      assertEqual(w.vm._grid.columns.length, before);
      assertEqual(w.vm._grid.getColumn('e0').values[0], null);
      assertEqual(w.vm._grid.canUndo(), false);
    } finally { await w.unmount(); }
  });
});

suite('Worksheet — Empfänger worksheet:writeColumns', () => {
  test('Datum, Währung und Anhang: Typen kommen an, genau ein Undo-Eintrag', async () => {
    const w = await mountWorksheet();
    try {
      let answer = null;
      const changedBefore = w.emitted.filter(([n]) => n === 'worksheet:dataChanged').length;
      w.bus.emit('worksheet:writeColumns', {
        instanceId: 'ws-w',
        sheetId: w.sheetId,
        ops: [
          { to: { kind: 'slot', slot: 0 }, name: 'Tag', type: 'date', values: ['2026-01-01', '2026-01-02'] },
          { to: { kind: 'slot', slot: 1 }, name: 'Preis', type: 'currency', values: [1.5, 2.25], format: { decimals: 2 } },
          { to: { kind: 'append' }, name: 'Menge', type: 'numeric', values: [1, 2, 3, 4] },
        ],
        reply: (r) => { answer = r; },
      });
      assertEqual(answer?.ok, true);
      const cols = w.vm._grid.columns;
      assertEqual(cols.length, 6);
      assertEqual(cols[0].type, 'date');
      assertEqual(cols[0].name, 'Tag');
      assertEqual(cols[1].type, 'currency');
      assertDeepEqual(cols[1].format, { decimals: 2 });
      assertEqual(cols[5].type, 'numeric');
      assertEqual(cols[5].name, 'Menge');
      assertDeepEqual(answer.columnIds, [cols[0].id, cols[1].id, cols[5].id]);
      assertEqual(w.vm._grid.rowCount, 4);
      assertEqual(w.vm._grid.history._stack.length, 1, 'genau ein Undo-Eintrag');
      assertEqual(w.emitted.filter(([n]) => n === 'worksheet:dataChanged').length - changedBefore, 1, 'genau ein dataChanged');
    } finally { await w.unmount(); }
  });

  test('ein Plan mit unbekannter Spalte schreibt nichts', async () => {
    const w = await mountWorksheet();
    try {
      const before = JSON.stringify(w.vm._grid.columns.map(c => [c.id, c.name, c.type, [...c.values]]));
      let answer = null;
      w.bus.emit('worksheet:writeColumns', {
        instanceId: 'ws-w',
        sheetId: w.sheetId,
        ops: [
          { to: { kind: 'slot', slot: 0 }, name: 'A', type: 'numeric', values: [9, 9] },
          { to: { kind: 'column', colId: 'gibt-es-nicht' }, name: 'B', type: 'numeric', values: [1] },
        ],
        reply: (r) => { answer = r; },
      });
      assertDeepEqual(answer, { ok: false, reason: 'unknown_column' });
      assertEqual(w.vm._grid.columns.length, 5);
      assertEqual(JSON.stringify(w.vm._grid.columns.map(c => [c.id, c.name, c.type, [...c.values]])), before);
    } finally { await w.unmount(); }
  });

  test('ein unbekanntes Blatt wird abgelehnt', async () => {
    const w = await mountWorksheet();
    try {
      let answer = null;
      w.bus.emit('worksheet:writeColumns', {
        instanceId: 'ws-w', sheetId: 'weg', ops: [{ to: { kind: 'append' }, name: 'A', type: 'numeric', values: [1] }],
        reply: (r) => { answer = r; },
      });
      assertDeepEqual(answer, { ok: false, reason: 'unknown_sheet' });
      assertEqual(w.vm._grid.columns.length, 5);
    } finally { await w.unmount(); }
  });
  test('Datum in einen Startslot: Rolle passt zum Typ', async () => {
    const w = await mountWorksheet();
    try {
      assertEqual(w.vm._grid.columns[0].role, 'continuous');
      let answer = null;
      w.bus.emit('worksheet:writeColumns', {
        instanceId: 'ws-w', sheetId: w.sheetId,
        ops: [{ to: { kind: 'slot', slot: 0 }, name: 'Tag', type: 'date', values: ['2026-01-01', '2026-01-02'] }],
        reply: (r) => { answer = r; },
      });
      assertEqual(answer?.ok, true);
      const c = w.vm._grid.columns[0];
      assertEqual(c.type, 'date');
      assertEqual(c.role, 'date');
      assertEqual(validRolesForType('date').includes(c.role), true);
    } finally { await w.unmount(); }
  });

  test('angehängte Textspalte: eingehängt und Store vergeben dieselbe Rolle', async () => {
    const values = ['a', 'b', 'a', 'b', 'a', 'b'];
    const op = { to: { kind: 'append' }, name: 'Gruppe', type: 'text', values };
    const w = await mountWorksheet();
    try {
      let answer = null;
      w.bus.emit('worksheet:writeColumns', { instanceId: 'ws-w', sheetId: w.sheetId, ops: [op], reply: (r) => { answer = r; } });
      assertEqual(answer?.ok, true);
      const live = w.vm._grid.columns.at(-1);
      const stored = applyWriteColumn(
        { sheets: [{ id: 's', name: 'S', state: { columns: [], rowCount: 0 } }] },
        { ...op, sheetId: 's' },
      ).state.sheets[0].state.columns[0];
      assertEqual(stored.role, 'categorical');
      assertEqual(live.role, stored.role);
    } finally { await w.unmount(); }
  });

  test('wirft der Empfänger beim Schreiben: commit scheitert mit write_failed', async () => {
    const w = await mountWorksheet();
    const errors = console.error;
    console.error = () => {};
    try {
      w.vm.writeColumns = () => { throw new Error('kaputt'); };
      const changedBefore = w.emitted.filter(([n]) => n === 'worksheet:dataChanged').length;
      const plan = worksheetWrite().worksheet('ws-w').sheet(w.sheetId).column({ name: 'A', values: [1, 2] }).build();
      // Stellvertreter der Agentenschicht: führt den Aufruf am eingehängten
      // Worksheet aus und meldet einen Wurf wie `call_failed`.
      const instances = {
        interact: async (stack) => {
          const [call] = stack;
          try {
            const value = w.vm[call.method](...call.args);
            return { ok: true, results: [{ ok: true, id: call.id, result: { instanceId: 'ws-w', method: call.method, value } }] };
          } catch (e) {
            return { ok: false, rolledBack: true, results: [{ ok: false, id: call.id, error: 'call_failed', message: e.message }] };
          }
        },
      };
      let err = null;
      let res = null;
      const warn = console.warn;
      console.warn = () => {};
      try { res = await commitWorksheetWrite({ ...w.context, instances }, plan); } catch (e) { err = e; } finally { console.warn = warn; }
      assertEqual(res, null, 'Erfolg gemeldet');
      assertEqual(err?.reason, 'write_failed');
      assertEqual(w.emitted.filter(([n]) => n === 'worksheet:dataChanged').length, changedBefore, 'dataChanged trotz Fehler');
    } finally { console.error = errors; await w.unmount(); }
  });
});

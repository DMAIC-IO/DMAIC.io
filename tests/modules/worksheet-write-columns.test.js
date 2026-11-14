/**
 * Worksheet im Browser: die Agentenaktion `writeColumns` am eingehängten
 * Arbeitsblatt (echtes Modul, Fake-Dienste, schlankes Template).
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import worksheetMod from '../../js/modules/worksheet/worksheet.js';

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

/** Leere, unbenannte Spalte `id` mit `rows` Zeilen. */
const emptyCol = (id, rows = 3) => ({ id, name: '', type: 'numeric', values: new Array(rows).fill(null), format: { decimals: 6 } });

/**
 * Einen Worksheet `ws-c` einhängen; das aktive Blatt hat fünf leere
 * Spalten `e0`…`e4` mit drei Zeilen.
 */
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
    instanceId: 'ws-c',
    stateManager: {
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'dmaic',
      get: (k) => ({ phases: { data: [] }, 'phases.data': [{ instanceId: 'ws-c', moduleId: 'worksheet' }] })[k],
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
  vm._grid.setState({ columns: [0, 1, 2, 3, 4].map((i) => emptyCol(`e${i}`)), rowCount: 3 });
  vm._grid.history.clear();
  const sheetId = vm.model.activeSheetId;
  return {
    vm, bus, emitted, sheetId, context, instance, states,
    /** Spalten des aktiven Blatts als vergleichbares JSON. */
    snapshot: () => JSON.stringify(vm._grid.columns.map(c => [c.id, c.name, c.type, c.format, [...c.values], [...(c.formulas ?? [])]])),
    async unmount() { await instance.destroy(); container.remove(); },
  };
}

/** Ein zweites, inaktives Blatt `s-in` mit zwei Spalten anlegen. */
function addInactiveSheet(w) {
  w.vm.model.sheets.push({
    id: 's-in',
    name: 'Inaktiv',
    state: {
      columns: [
        { id: 'i0', name: 'Alt', shortName: 'C1', type: 'numeric', values: [1, 2], formulas: [null, null], format: { decimals: 6 }, role: 'continuous', roleManual: false },
        { id: 'i1', name: '', shortName: 'C2', type: 'numeric', values: [null, null], formulas: [null, null], format: { decimals: 6 }, role: 'continuous', roleManual: false },
      ],
      rowCount: 2, colWidths: {}, sortCol: null, sortDir: null, selection: null,
    },
  });
}

function throwsWith(fn, prefix) {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  assert(err, `kein Wurf, erwartet ${prefix}`);
  assert(String(err.message).startsWith(prefix), `Meldung "${err?.message}" beginnt nicht mit "${prefix}"`);
}

suite('Worksheet — Agentenaktion writeColumns', () => {
  test('append adds columns with given type and format', async () => {
    const w = await mountWorksheet();
    try {
      const ids = w.vm.writeColumns(w.sheetId, [
        { to: 'append', name: 'Preis', type: 'currency', values: [1.5, 2.25], format: { decimals: 2 } },
        { to: 'append', name: 'Tag', type: 'date', values: ['2026-01-01'] },
      ]);
      const cols = w.vm._grid.columns;
      assertEqual(cols.length, 7);
      assertEqual(cols[5].id, ids[0]);
      assertEqual(cols[5].name, 'Preis');
      assertEqual(cols[5].type, 'currency');
      assertDeepEqual(cols[5].format, { decimals: 2 });
      assertEqual(cols[5].shortName, 'C6');
      assertEqual(cols[5].roleManual, false);
      assertEqual(cols[6].type, 'date');
      assertEqual(cols[6].role, 'date');
      assertEqual(w.vm._grid.rowCount, 3, 'rowCount bleibt das Maximum');
      assertEqual(cols[6].values.length, 3);
      // gespeichert und gemeldet
      const stored = w.states['ws-c'].sheets.find(s => s.id === w.sheetId).state;
      assertEqual(stored.columns.length, 7);
      assertEqual(w.emitted.filter(([n]) => n === 'worksheet:dataChanged').length > 0, true);
    } finally { await w.unmount(); }
  });

  test('start fills empty C1 then appends', async () => {
    const w = await mountWorksheet();
    try {
      // C2–C5 belegt: benannt bzw. mit Werten
      w.vm._grid.setState({
        columns: [emptyCol('e0'), { ...emptyCol('e1'), name: 'B' }, { ...emptyCol('e2'), values: [1, null, null] },
          { ...emptyCol('e3'), name: 'D' }, { ...emptyCol('e4'), name: 'E' }],
        rowCount: 3,
      });
      w.vm._grid.history.clear();
      const ids = w.vm.writeColumns(w.sheetId, [
        { to: 'start', name: 'Erste', values: [1, 2, 3, 4] },
        { to: 'start', name: 'Zweite', values: [5] },
      ]);
      const cols = w.vm._grid.columns;
      assertEqual(ids[0], 'e0');
      assertEqual(cols[0].name, 'Erste');
      assertDeepEqual([...cols[0].values], [1, 2, 3, 4]);
      assertEqual(cols.length, 6);
      assertEqual(ids[1], cols[5].id);
      assertEqual(cols[5].name, 'Zweite');
      assertEqual(w.vm._grid.rowCount, 4);
      for (const c of cols) assertEqual(c.values.length, 4, `Spalte ${c.id} aufgefüllt`);
    } finally { await w.unmount(); }
  });

  test('overwrite replaces values and clears formulas, keeps name', async () => {
    const w = await mountWorksheet();
    try {
      w.vm._grid.setState({
        columns: [
          { ...emptyCol('a'), name: 'Basis', values: [1, 2, 3], formulas: [null, '=C2[2]', null] },
          { ...emptyCol('b'), name: 'Doppelt', values: [2, 4, 6], formulas: ['=C1[1]*2', '=C1[2]*2', null] },
        ],
        rowCount: 3,
      });
      w.vm._grid.history.clear();
      const ids = w.vm.writeColumns(w.sheetId, [{ to: 'a', name: 'Neu', values: [10, 20] }]);
      assertDeepEqual(ids, ['a']);
      const a = w.vm._grid.getColumn('a');
      assertEqual(a.name, 'Basis', 'Name bleibt');
      assertDeepEqual([...a.values], [10, 20, null]);
      assertDeepEqual([...a.formulas], [null, null, null]);
      // Formeln anderer Spalten neu gerechnet
      assertDeepEqual([...w.vm._grid.getColumn('b').values].slice(0, 2), [20, 40]);
    } finally { await w.unmount(); }
  });

  test('discrete numeric gets decimals 0', async () => {
    const w = await mountWorksheet();
    try {
      const [id] = w.vm.writeColumns(w.sheetId, [{ to: 'append', name: 'Zahl', values: [1, 2, 3], discrete: true }]);
      const col = w.vm._grid.getColumn(id);
      assertEqual(col.type, 'numeric');
      assertDeepEqual(col.format, { decimals: 0 });
    } finally { await w.unmount(); }
  });

  test('unknown column throws and writes nothing', async () => {
    const w = await mountWorksheet();
    try {
      const before = w.snapshot();
      throwsWith(() => w.vm.writeColumns(w.sheetId, [
        { to: 'start', name: 'A', values: [9, 9] },
        { to: 'gibt-es-nicht', values: [1] },
      ]), 'unknown_column: gibt-es-nicht');
      throwsWith(() => w.vm.writeColumns(w.sheetId, [
        { to: 'append', name: 'A', values: [9] },
        { to: 'append', type: 'quatsch', values: [1] },
      ]), 'unknown_type: quatsch');
      throwsWith(() => w.vm.writeColumns('weg', [{ to: 'append', values: [1] }]), 'unknown_sheet: weg');
      assertEqual(w.snapshot(), before);
      assertEqual(w.vm._grid.history.canUndo(), false, 'kein Undo-Eintrag');
    } finally { await w.unmount(); }
  });

  test('inactive sheet is written without switching active sheet', async () => {
    const w = await mountWorksheet();
    try {
      addInactiveSheet(w);
      const activeBefore = w.snapshot();
      const ids = w.vm.writeColumns('s-in', [
        { to: 'i0', values: [7, 8, 9] },
        { to: 'start', name: 'Gefüllt', type: 'text', values: ['x'] },
        { to: 'append', name: 'Neu', values: [1] },
      ]);
      assertEqual(w.vm.model.activeSheetId, w.sheetId, 'aktives Blatt bleibt');
      assertEqual(w.snapshot(), activeBefore, 'aktives Blatt unverändert');
      const st = w.vm.model.sheets.find(s => s.id === 's-in').state;
      assertEqual(st.rowCount, 3);
      assertEqual(st.columns.length, 3);
      assertDeepEqual(ids, ['i0', 'i1', st.columns[2].id]);
      assertEqual(st.columns[0].name, 'Alt');
      assertDeepEqual([...st.columns[0].values], [7, 8, 9]);
      assertEqual(st.columns[1].name, 'Gefüllt');
      assertEqual(st.columns[1].type, 'text');
      assertEqual(st.columns[2].shortName, 'C3');
      const stored = w.states['ws-c'].sheets.find(s => s.id === 's-in').state;
      assertEqual(stored.columns.length, 3, 'gespeichert');
    } finally { await w.unmount(); }
  });

  test('one undo entry reverts the whole write', async () => {
    const w = await mountWorksheet();
    try {
      // aktives Blatt: Startspalte, Überschreiben und Anhängen
      const before = w.snapshot();
      w.vm.writeColumns(w.sheetId, [
        { to: 'start', name: 'A', values: [1, 2, 3, 4, 5] },
        { to: 'e3', type: 'text', values: ['t'] },
        { to: 'append', name: 'B', values: [1] },
        { to: 'append', name: 'C', values: [2] },
      ]);
      const after = w.snapshot();
      assertEqual(w.vm._grid.history._stack.length, 1, 'genau ein Undo-Eintrag');
      assertEqual(w.vm.undo(), true);
      assertEqual(w.snapshot(), before, 'Undo nimmt alles zurück');
      assertEqual(w.vm._grid.rowCount, 3);
      assertEqual(w.vm.canUndo, false);
      assertEqual(w.vm.redo(), true);
      assertEqual(w.snapshot(), after, 'Redo stellt alles wieder her');

      // inaktives Blatt: ein Undo am aktiven Grid nimmt den ganzen Import zurück
      addInactiveSheet(w);
      const inBefore = JSON.stringify(w.vm.model.sheets.find(s => s.id === 's-in').state);
      w.vm.writeColumns('s-in', [
        { to: 'append', name: 'X', values: [1, 2, 3, 4] },
        { to: 'i0', values: [0] },
      ]);
      const inAfter = JSON.stringify(w.vm.model.sheets.find(s => s.id === 's-in').state);
      assertEqual(w.vm._grid.history._stack.length, 2);
      assertEqual(w.vm.undo(), true);
      assertEqual(JSON.stringify(w.vm.model.sheets.find(s => s.id === 's-in').state), inBefore);
      assertEqual(w.vm.model.activeSheetId, w.sheetId, 'aktives Blatt bleibt');
      assertEqual(w.snapshot(), after, 'aktives Blatt unberührt');
      const stored = w.states['ws-c'].sheets.find(s => s.id === 's-in').state;
      assertEqual(stored.columns.length, 2, 'Undo gespeichert');
      assertEqual(w.vm.redo(), true);
      assertEqual(JSON.stringify(w.vm.model.sheets.find(s => s.id === 's-in').state), inAfter);
    } finally { await w.unmount(); }
  });

  test('joins an open history group', async () => {
    const w = await mountWorksheet();
    try {
      w.instance.historyBegin();
      w.vm._grid.setCellValue('e1', 0, 5);
      w.vm.writeColumns(w.sheetId, [{ to: 'append', name: 'A', values: [1] }]);
      w.vm.writeColumns(w.sheetId, [{ to: 'append', name: 'B', values: [2] }]);
      w.instance.historyEnd();
      assertEqual(w.vm._grid.history._stack.length, 1);
      assertEqual(w.vm._grid.history.peek()?.type, 'group');
      w.vm._grid.undo();
      assertEqual(w.vm._grid.columns.length, 5);
      assertEqual(w.vm._grid.getColumn('e1').values[0], null);
    } finally { await w.unmount(); }
  });

  test('returns column ids in order', async () => {
    const w = await mountWorksheet();
    try {
      const ids = w.vm.writeColumns(w.sheetId, [
        { to: 'append', name: 'Z', values: [1] },
        { to: 'e2', values: [2] },
        { to: 'start', name: 'S', values: [3] },
      ]);
      const cols = w.vm._grid.columns;
      assertDeepEqual(ids, [cols[5].id, 'e2', 'e0']);
    } finally { await w.unmount(); }
  });

  test('Rollen: Datum in einen Startslot, angehängte Textspalte', async () => {
    const w = await mountWorksheet();
    try {
      assertEqual(w.vm._grid.columns[0].role, 'continuous');
      w.vm.writeColumns(w.sheetId, [
        { to: 'start', name: 'Tag', type: 'date', values: ['2026-01-01', '2026-01-02'] },
        { to: 'append', name: 'Gruppe', type: 'text', values: ['a', 'b', 'a', 'b', 'a', 'b'] },
      ]);
      const cols = w.vm._grid.columns;
      assertEqual(cols[0].type, 'date');
      assertEqual(cols[0].role, 'date');
      assertEqual(cols.at(-1).role, 'categorical');
      const stored = w.states['ws-c'].sheets.find(s => s.id === w.sheetId).state.columns.at(-1);
      assertEqual(stored.role, 'categorical');
    } finally { await w.unmount(); }
  });
});

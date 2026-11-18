/**
 * Lesefläche des Arbeitsblatts (F1.14a P3). Dieselben Fälle laufen gegen
 * die Altform (`readWorksheetState`, Test-Helfer) und gegen die
 * Zielform, Stand der Version 1.0: über das Model (`readWorksheetModel`) und
 * ohne Model aus dem gespeicherten Stand (`readWorksheetStored`). Die
 * Erwartungen sind dieselben.
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../test-utils.js';
import { inferRole } from '../../js/core/datagrid/datagrid-roles.js';
import { readWorksheetState, worksheetSnapshot } from '../helpers/legacy-worksheet-read.js';
import { worksheetSheetsSnapshot, readWorksheetModel, readWorksheetStored } from '../../js/modules/worksheet/domain/read.js';
import { WorksheetModel } from '../../js/modules/worksheet/domain/model.js';
import { createInstances } from '../../js/core/instances.js';
import { NO_SOURCE } from '../../js/core/source-reader.js';

/** Ein Spaltenkopf der Zielform. */
const head = (id, over = {}) => ({
  id, name: '', shortName: '', type: 'numeric', unit: null, role: 'continuous', roleManual: false, format: {}, meta: null, ...over,
});

/** Der Fall der Altform: `{ sheets: [{ id, name, state }] }`. */
const savedOld = () => ({
  sheets: [
    {
      id: 'sheet_1', name: 'Blatt 1',
      state: {
        rowCount: 3,
        columns: [
          { id: 'a', name: 'A', type: 'numeric', values: [1, 2, null], format: { decimals: 2, currencySymbol: '€' } },
          { id: 'b', name: 'B', type: 'text', values: ['x', 'y', 'z'], roleManual: true, role: 'categorical' },
          { id: 'c', name: 'C', type: 'numeric', values: [null, 2, null], formulas: [null, '=A1*2', null], meta: { lock: 'hard' } },
        ],
      },
    },
    { id: 'sheet_2', name: 'Blatt 2', state: null },
  ],
});

/** Derselbe Fall als Stand der Version 1.0. */
const saved10 = () => ({
  _schema: { version: '1.0' },
  sheets: [
    {
      id: 'sheet_1', name: 'Blatt 1',
      columns: [
        head('a', { name: 'A', shortName: 'C1', role: inferRole(savedOld().sheets[0].state.columns[0]), format: { decimals: 2, currencySymbol: '€' } }),
        head('b', { name: 'B', shortName: 'C2', type: 'text', roleManual: true, role: 'categorical' }),
        head('c', { name: 'C', shortName: 'C3', meta: { lock: 'hard' } }),
      ],
      formulas: { c: { 1: '=A1*2' } },
      data: { rowCount: 3, columns: [[1, 2, null], ['x', 'y', 'z'], [null, 2, null]] },
    },
    { id: 'sheet_2', name: 'Blatt 2', columns: [], formulas: {}, data: { rowCount: 0, columns: [] } },
  ],
  sheetCounter: 2,
  activeSheetId: 'sheet_1',
  gridView: {},
});

/**
 * Die drei Leser über demselben Fall: `make` liefert den Stand der Form,
 * `read(stand, options)` liest ihn.
 */
const READERS = [
  { name: 'Altform', make: savedOld, read: readWorksheetState },
  { name: 'Zielform, Model', make: () => WorksheetModel.fromJSON(saved10()), read: readWorksheetModel },
  { name: 'Zielform, gespeichert', make: saved10, read: readWorksheetStored },
];

for (const R of READERS) {
  suite(`Lesefläche (${R.name})`, () => {
    test('ohne Optionen: Verzeichnis, rowCount, Deskriptor, keine values', () => {
      const r = R.read(R.make());
      assertDeepEqual(r.sheets, [{ id: 'sheet_1', name: 'Blatt 1' }, { id: 'sheet_2', name: 'Blatt 2' }]);
      assertEqual(r.sheetId, 'sheet_1');
      assertEqual(r.rowCount, 3);
      assertEqual(r.rows.$bulk, true);
      assertEqual(r.rows.kind, 'table');
      assertEqual(r.rows.rowCount, 3);
      assert(r.columns.every(c => !('values' in c)), 'keine values');
    });

    test('Kopf hat valueCount (nur null zählt nicht), auch ohne columns-Option', () => {
      const r = R.read(R.make());
      assertDeepEqual(r.columns.map(c => c.valueCount), [2, 3, 1]);
      assert(r.columns.every(c => !('values' in c)), 'keine values');
      const w = R.read(R.make(), { columns: ['a'] });
      assertEqual(w.columns[0].valueCount, 2);
    });

    test('valueCount: [1, null, \'\', \'x\'] ergibt 3', () => {
      const big = bigOf(R, 4, [1, null, '', 'x']);
      assertEqual(R.read(big).columns[0].valueCount, 3);
    });

    test('Parität: Rolle, roleConfirmed, nur FORMAT_KEYS', () => {
      const r = R.read(R.make());
      const [a, b] = r.columns;
      assertDeepEqual(a.format, { decimals: 2 });
      assertEqual(a.roleConfirmed, false);
      assertEqual(a.role, inferRole(savedOld().sheets[0].state.columns[0]));
      assertEqual(b.role, 'categorical');
      assertEqual(b.roleConfirmed, true);
      assertEqual(a.unit, null);
    });

    test('columns: Reihenfolge, values, meta', () => {
      const r = R.read(R.make(), { columns: ['c', 'a'] });
      assertDeepEqual(r.columns.map(c => c.id), ['c', 'a']);
      assertDeepEqual(r.columns[1].values, [1, 2, null]);
      assertDeepEqual(r.columns[0].meta, { lock: 'hard' });
    });

    test('columns + fields rows/formulas beziehen sich nur auf die Auswahl', () => {
      const a = R.read(R.make(), { columns: ['a'], fields: ['rows', 'formulas'] });
      assertDeepEqual(a.rows, [[1], [2], [null]]);
      assertDeepEqual(a.formulas, []);
      const c = R.read(R.make(), { columns: ['c'], fields: ['formulas'] });
      assertDeepEqual(c.formulas, [{ columnId: 'c', row: 1, formula: '=A1*2' }]);
    });

    test('unbekannte Spalte wirft unknown_column', () => {
      let err = null;
      try { R.read(R.make(), { columns: ['x'] }); } catch (e) { err = e; }
      assert(err, 'wirft');
      assertEqual(err.code, 'unknown_column');
      assert(err.message.startsWith('unknown_column: x'), err.message);
    });

    test('columns kein Array wirft', () => {
      let err = null;
      try { R.read(R.make(), { columns: 'a' }); } catch (e) { err = e; }
      assert(err && err.message.includes('columns must be an array of column ids'), 'Meldung');
    });

    test('unbekannte sheetId wirft wie heute', () => {
      let err = null;
      try { R.read(R.make(), { sheetId: 'weg' }); } catch (e) { err = e; }
      assert(err && err.message.includes('weg') && err.message.includes('sheet_1'), err?.message);
    });

    test('Blatt ohne Spalten: columns [], rowCount 0', () => {
      const r = R.read(R.make(), { sheetId: 'sheet_2' });
      assertDeepEqual(r.columns, []);
      assertEqual(r.rowCount, 0);
      assertEqual(r.sheetId, 'sheet_2');
    });

    test('ohne fields rows baut keine Zeilen (nur der Zähler valueCount liest je Zelle einmal)', () => {
      const n = 1000;
      let reads = 0;
      const counted = new Proxy(Array.from({ length: n }, (_, i) => i), {
        get(t, k, r) { if (typeof k === 'string' && /^\d+$/.test(k)) reads++; return Reflect.get(t, k, r); },
      });
      const big = bigOf(R, n, counted);
      reads = 0;
      const r = R.read(big);
      assertEqual(r.rowCount, n);
      assertEqual(reads, n); // nur die Zählung von valueCount
      reads = 0;
      R.read(big, { fields: ['rows'] });
      assertEqual(reads, 2 * n); // Zählung + Zeilen
    });
  });
}

/**
 * Ein Stand mit einer Spalte `a` aus `values` (n Zeilen) in der Form des Lesers.
 * Beim Model wird die Spalte nach dem Laden eingesetzt (das Laden prüft jede Zelle).
 */
function bigOf(R, n, values) {
  if (R.name === 'Altform') {
    return { sheets: [{ id: 's', name: 'S', state: { rowCount: n, columns: [{ id: 'a', name: 'a', type: 'numeric', role: 'continuous', values }] } }] };
  }
  const json = {
    _schema: { version: '1.0' },
    sheets: [{ id: 's', name: 'S', columns: [head('a', { shortName: 'C1' })], formulas: {}, data: { rowCount: n, columns: [new Array(n).fill(null)] } }],
    sheetCounter: 1, activeSheetId: 's', gridView: {},
  };
  if (R.name === 'Zielform, gespeichert') { json.sheets[0].data.columns[0] = values; return json; }
  const m = WorksheetModel.fromJSON(json);
  m.sheets[0].data.columns[0] = values;
  return m;
}

suite('readWorksheetState (Altform, Übergang bis Task 13)', () => {
  test('null: leere Lesefläche', () => {
    const r = readWorksheetState(null);
    assertDeepEqual(r.sheets, []);
    assertEqual(r.sheetId, null);
    assertEqual(r.rowCount, 0);
  });

  test('Blatt ohne Stand: columns [], rowCount 0', () => {
    const r = readWorksheetState(savedOld(), { sheetId: 'sheet_2' });
    assertDeepEqual(r.columns, []);
    assertEqual(r.rowCount, 0);
  });

  test('ohne rowCount im Stand: Zeilenzahl aus der längsten Spalte', () => {
    const old = { sheets: [{ id: 's', name: 'S', state: { columns: [
      { id: 'a', name: 'A', type: 'numeric', values: [1, 2] },
      { id: 'b', name: 'B', type: 'numeric', values: [3, 4, 5] },
      { id: 'c', name: 'C', type: 'numeric' },
    ] } }] };
    const out = readWorksheetState(old, { columns: ['a', 'b', 'c'] });
    assertEqual(out.rowCount, 3);
    assertDeepEqual(out.columns.map(c => c.values), [[1, 2, null], [3, 4, 5], [null, null, null]]);
    const noCols = readWorksheetState({ sheets: [{ id: 's', name: 'S', state: { columns: [] } }] });
    assertEqual(noCols.rowCount, 0);
  });

  test('ein gesetztes rowCount gilt, auch wenn Spalten länger sind', () => {
    const st = { sheets: [{ id: 's', name: 'S', state: { rowCount: 1, columns: [{ id: 'a', name: 'A', type: 'numeric', values: [1, 2] }] } }] };
    assertEqual(readWorksheetState(st).rowCount, 1);
  });
});

/** Elemente aller Arrays, die `structuredClone` während `fn` kopiert (tief gezählt). */
function clonedElements(fn) {
  const real = globalThis.structuredClone;
  let count = 0;
  const walk = (v, seen) => {
    if (v === null || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) count += v.length;
    for (const x of Object.values(v)) walk(x, seen);
  };
  globalThis.structuredClone = (v, o) => { walk(v, new Set()); return real(v, o); };
  try { return { out: fn(), count }; } finally { globalThis.structuredClone = real; }
}

suite('Lesefläche — Kosten (F1.14a, Leistung)', () => {
  const n = 1000;
  const bigOld = () => ({ sheets: [{ id: 's', name: 'S', state: { rowCount: n, columns: [
    { id: 'a', name: 'a', type: 'numeric', role: 'continuous', values: Array.from({ length: n }, (_, i) => i), formulas: new Array(n).fill(null) },
    { id: 'b', name: 'b', type: 'numeric', role: 'continuous', values: Array.from({ length: n }, (_, i) => -i), formulas: [null, '=a1'] },
  ] } }] });
  const big10 = () => ({
    _schema: { version: '1.0' },
    sheets: [{
      id: 's', name: 'S',
      columns: [head('a', { name: 'a', shortName: 'C1' }), head('b', { name: 'b', shortName: 'C2' })],
      formulas: { b: { 1: '=a1' } },
      data: { rowCount: n, columns: [Array.from({ length: n }, (_, i) => i), Array.from({ length: n }, (_, i) => -i)] },
    }],
    sheetCounter: 1, activeSheetId: 's', gridView: {},
  });
  const cases = [
    { name: 'Altform', make: bigOld, read: readWorksheetState, col: (st) => st.sheets[0].state.columns[0].values },
    { name: 'Model', make: () => WorksheetModel.fromJSON(big10()), read: readWorksheetModel, col: (m) => m.sheets[0].data.columns[0] },
    { name: 'gespeichert', make: big10, read: readWorksheetStored, col: (st) => st.sheets[0].data.columns[0] },
  ];

  for (const C of cases) {
    test(`${C.name} — columns: die Zellwerte werden genau einmal kopiert`, () => {
      const st = C.make();
      const res = clonedElements(() => C.read(st, { columns: ['a', 'b'] }));
      // Die Projektion klont nur Köpfe, nicht die values (je n Einträge).
      assert(res.count < n, `structuredClone kopierte ${res.count} Array-Elemente`);
      assertEqual(res.out.columns[0].values.length, n);
      assertEqual(res.out.columns[1].values[5], -5);
      // Eigene Kopie: der Leser hält keine lebende Spalte.
      assert(res.out.columns[0].values !== C.col(st), 'values ist eine Kopie');
      res.out.columns[0].values[0] = 99;
      assertEqual(C.col(st)[0], 0);
    });

    test(`${C.name} — ohne fields formulas: der Umfang stimmt`, () => {
      const r = C.read(C.make());
      assertEqual(r.formulas.rowCount, 1);
      const withF = C.read(C.make(), { fields: ['formulas'] });
      assertDeepEqual(withF.formulas, [{ columnId: 'b', row: 1, formula: '=a1' }]);
    });
  }

  test('Abzug ohne fields formulas: keine Formel-Einträge gebaut', () => {
    const snap = worksheetSnapshot(bigOld());
    assertEqual(snap.formulas.length, 1);
    assertEqual(Object.keys(snap.formulas).length, 0, 'keine Einträge materialisiert');
    const snap10 = worksheetSheetsSnapshot(big10().sheets);
    assertEqual(snap10.formulas.length, 1);
    assertEqual(Object.keys(snap10.formulas).length, 0, 'keine Einträge materialisiert');
  });
});

// ─── Lesen ohne Mount über instances ────────────────────

/** Das Arbeitsblatt als Zielform-Modul, `loadDetached` gezählt. */
function worksheetModule() {
  const calls = { loadDetached: 0 };
  const m = {
    calls,
    Model: WorksheetModel,
    loadDetached(json) { calls.loadDetached++; return WorksheetModel.fromJSON(json); },
    readDetached(model, _data, options) { return readWorksheetModel(model, options); },
    readStored: readWorksheetStored,
  };
  return m;
}

/** `instances` mit einer Arbeitsblatt-Instanz `w1`, nicht eingehängt. */
function instancesWith(state) {
  const cache = new Map([['w1', state]]);
  const writes = [];
  const sm = {
    writes,
    get: (path) => (path === 'phases' ? { data: [{ instanceId: 'w1', moduleId: 'worksheet', order: 0 }] } : undefined),
    getModuleState: (id) => cache.get(id) ?? null,
    setModuleState(id, st) { writes.push([id, st]); cache.set(id, st); },
    isCompleted: () => false,
  };
  const mod = worksheetModule();
  const svc = createInstances({
    stateManager: sm,
    moduleRegistry: { loadModule: async () => mod, getLoaded: () => mod },
    workspace: { getLiveViewmodel: () => null, isPending: () => false, whenInstanceReady: async () => true },
    eventBus: { emit() {}, on() {}, off() {} },
    createSource: () => NO_SOURCE,
  });
  return { svc, sm, mod };
}

suite('Arbeitsblatt ohne Mount: Lesen mit columns', () => {
  test('100 000 × 20 gespeichert: kein Model, nur die eine Spalte kopiert', () => {
    const rows = 100000;
    let touched = 0;
    const guard = (arr) => new Proxy(arr, {
      get(t, k, r) { if (typeof k === 'string' && /^\d+$/.test(k)) touched++; return Reflect.get(t, k, r); },
    });
    const columns = [];
    const data = [];
    for (let c = 0; c < 20; c++) {
      const id = c === 7 ? 'x' : `k${c}`;
      columns.push(head(id, { shortName: `C${c + 1}` }));
      const values = new Array(rows).fill(c);
      data.push(id === 'x' ? values : guard(values));
    }
    const state = {
      _schema: { version: '1.0' },
      sheets: [{ id: 'sheet_1', name: 'S', columns, formulas: {}, data: { rowCount: rows, columns: data } }],
      sheetCounter: 1, activeSheetId: 'sheet_1', gridView: {},
    };
    const { svc, sm, mod } = instancesWith(state);
    const out = svc.readSync('w1', { columns: ['x'] });
    assertEqual(mod.calls.loadDetached, 0, 'kein Model gebaut');
    assertEqual(touched, 0, 'die übrigen 19 Spalten nicht gelesen');
    assertEqual(out.columns.length, 1);
    assertEqual(out.columns[0].id, 'x');
    assertEqual(out.columns[0].values.length, rows);
    assertEqual(out.columns[0].values[rows - 1], 7);
    assert(out.columns[0].values !== data[7], 'eigene Kopie');
    assertEqual(sm.writes.length, 0, 'nichts zurückgeschrieben');
  });

  test('Stand der Version 0: einmal migriert und zurückgeschrieben, danach ohne Model', () => {
    const { svc, sm, mod } = instancesWith(savedOld());
    const first = svc.readSync('w1', { columns: ['a'] });
    assertDeepEqual(first.columns[0].values, [1, 2, null]);
    assertEqual(mod.calls.loadDetached, 1);
    assertEqual(sm.writes.length, 1);
    assertEqual(sm.writes[0][1]._schema.version, '1.0');
    const second = svc.readSync('w1', { columns: ['a'] });
    assertDeepEqual(second.columns[0].values, [1, 2, null]);
    assertEqual(mod.calls.loadDetached, 1, 'kein zweites Laden');
    assertEqual(sm.writes.length, 1, 'kein zweites Schreiben');
  });
});

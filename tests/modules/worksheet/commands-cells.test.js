/**
 * Arbeitsblatt (Zielform): Kommandos für Zellen und Formeln mit Umkehrung
 * (`domain/commands-cells.js`). Jedes Kommando → seine Umkehrung ergibt den
 * Ausgangsstand (`toJSON` gleich), die Wiederholung den Stand danach.
 */
import { suite, test, assert, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { WorksheetModel } from '../../../js/modules/worksheet/domain/model.js';
import { setCommandObserver, setHistoryMode, collectInverses } from '../../../js/core/model.js';
import { recalcFormulas } from '../../../js/core/datagrid/table/formulas.js';
import { schemaAgentEntry } from '../../../js/core/agent/agent-schema.js';

/**
 * Ein Spaltenkopf in der Zielform.
 * @param {string} id @param {object} [over] @returns {object}
 */
function col(id, over = {}) {
  return {
    id, name: '', shortName: id, type: 'numeric', unit: null, role: 'continuous', roleManual: false, format: {}, meta: null, ...over,
  };
}

/**
 * Ein Model mit Blatt `s1` (Spalten `heads`, Zellen `cells`, Formeln) und
 * einem zweiten, inaktiven Blatt `s2`. Formelwerte werden einmal gerechnet;
 * Verlaufsmodus `inverse`, der Beobachter hält die letzte Umkehrliste.
 * @param {{ heads?: object[], cells?: any[][], formulas?: object, rowCount?: number }} [opts]
 */
function setup({ heads, cells, formulas = {}, rowCount } = {}) {
  const h = heads ?? [col('a', { shortName: 'C1' }), col('b', { shortName: 'C2' }), col('c', { shortName: 'C3' })];
  const rows = rowCount ?? (cells?.[0]?.length ?? 3);
  const data = cells ?? h.map(() => new Array(rows).fill(null));
  const json = {
    _schema: { version: '1.0' },
    sheets: [
      { id: 's1', name: 'Eins', columns: h, formulas, data: { rowCount: rows, columns: data } },
      { id: 's2', name: 'Zwei', columns: [col('i0', { name: 'Alt', shortName: 'C1' }), col('i1', { shortName: 'C2' })], formulas: {}, data: { rowCount: 2, columns: [[1, 2], [null, null]] } },
    ],
    sheetCounter: 2,
    activeSheetId: 's1',
    gridView: {},
  };
  const m = WorksheetModel.fromJSON(json);
  const s = m.sheets[0];
  recalcFormulas(s.columns, s.data, s.formulas);
  setHistoryMode(m, 'inverse');
  const seen = { inverses: null };
  setCommandObserver(m, (_name, _args, _result, inv) => { if (inv) seen.inverses = inv; });
  return { m, seen, json: () => canon(m.toJSON()) };
}

/**
 * JSON mit sortierten Objektschlüsseln: die Reihenfolge der Schlüssel einer
 * `map` (Formeln je Spalte) trägt keine Bedeutung.
 * @param {any} v @returns {string}
 */
function canon(v) {
  return JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
}

/**
 * Kommando ausführen, dann Rückgängig (Umkehrungen rückwärts), dann
 * Wiederholen; prüft beide Stände.
 * @param {ReturnType<typeof setup>} w @param {object} cmd @returns {any} Ergebnis des Kommandos
 */
function roundTrip(w, cmd) {
  const before = w.json();
  w.seen.inverses = null;
  const result = w.m.execute(cmd);
  const after = w.json();
  const undo = w.seen.inverses;
  assert(Array.isArray(undo) && undo.length > 0, `${cmd.type}: keine Umkehrung gesammelt`);
  const redo = collectInverses(w.m, () => { for (const c of [...undo].reverse()) w.m.execute(c); });
  assertEqual(w.json(), before, `${cmd.type}: Rückgängig ergibt den Ausgangsstand`);
  collectInverses(w.m, () => { for (const c of [...redo].reverse()) w.m.execute(c); });
  assertEqual(w.json(), after, `${cmd.type}: Wiederholen ergibt den Stand danach`);
  return result;
}

/** Wirft `fn` mit einer Meldung, die mit `prefix` beginnt? */
function throwsWith(fn, prefix) {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  assert(err, `kein Wurf, erwartet ${prefix}`);
  assert(String(err.message).startsWith(prefix), `Meldung "${err?.message}" beginnt nicht mit "${prefix}"`);
}

/** Wirft, und der Stand ist unverändert. */
function rejects(w, fn, prefix) {
  const before = w.json();
  const rev = w.m.$tableRev;
  throwsWith(fn, prefix);
  assertEqual(w.json(), before, 'nichts geschrieben');
  assertEqual(w.m.$tableRev, rev, 'kein markTableChanged');
}

const sheet = (w, id = 's1') => w.m.sheets.find((s) => s.id === id);
const values = (w, c, id = 's1') => [...sheet(w, id).data.columns[c]];

suite('worksheet: setCells', () => {
  test('schreibt ab startRow, liefert die Anzahl, Umkehrung', () => {
    const w = setup();
    const n = roundTrip(w, { type: 'setCells', sheetId: 's1', columnId: 'b', startRow: 1, values: ['4', 5] });
    assertEqual(n, 2);
    assertDeepEqual(values(w, 1), [null, 4, 5]);
  });

  test('markTableChanged genau einmal', () => {
    const w = setup();
    const rev = w.m.$tableRev;
    w.m.setCells({ sheetId: 's1', columnId: 'a', startRow: 0, values: [1, 2, 3] });
    assertEqual(w.m.$tableRev, rev + 1);
  });

  test('Text in eine Zahlenspalte macht sie zur Textspalte (wie setCellValue), Umkehrung stellt Typ und Rolle her', () => {
    const w = setup({ cells: [[1, 2, null], [null, null, null], [null, null, null]] });
    roundTrip(w, { type: 'setCells', sheetId: 's1', columnId: 'a', startRow: 2, values: ['abc'] });
    const head = sheet(w).columns[0];
    assertEqual(head.type, 'text');
    assertDeepEqual(values(w, 0), ['1', '2', 'abc']);
  });

  test('Prozent Zelle für Zelle getippt: die automatische Rolle categorical weicht, sobald die Werte widersprechen', () => {
    const vals = ['0.4%', '3.8%', '7.3%', '8.8%', '8.6%', '7.7%', '6.9%', '6.2%', '5.6%',
      '4.7%', '4.1%', '3.8%', '3.3%', '3.0%', '2.7%', '2.3%', '2.2%', '2.0%', '1.8%'];
    const w = setup({ rowCount: vals.length });
    w.m.setCells({ sheetId: 's1', columnId: 'b', startRow: 0, values: [vals[0]] });
    assertEqual(sheet(w).columns[1].type, 'percent');
    assertEqual(sheet(w).columns[1].role, 'categorical');
    vals.slice(1).forEach((v, i) => w.m.setCells({ sheetId: 's1', columnId: 'b', startRow: i + 1, values: [v] }));
    assertEqual(sheet(w).columns[1].role, 'continuous');
  });

  test('eine manuelle Rolle categorical bleibt beim Tippen', () => {
    const w = setup({ heads: [col('a', { shortName: 'C1', role: 'categorical', roleManual: true })], rowCount: 10 });
    w.m.setCells({ sheetId: 's1', columnId: 'a', startRow: 0, values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });
    assertEqual(sheet(w).columns[0].role, 'categorical');
  });

  test('Währung in eine Zahlenspalte: Typ currency mit zwei Dezimalen', () => {
    const w = setup();
    roundTrip(w, { type: 'setCells', sheetId: 's1', columnId: 'a', startRow: 0, values: ['3 €'] });
    const head = sheet(w).columns[0];
    assertEqual(head.type, 'currency');
    assertEqual(head.format.decimals, 2);
    assertEqual(values(w, 0)[0], 3);
  });

  test('Zahl in eine Datumsspalte mit Datumswerten: Text statt Zahl (die Daten blieben sonst nicht stehen)', () => {
    const w = setup({ heads: [col('d', { shortName: 'C1', type: 'date', role: 'date' })], cells: [['2026-01-01', null]] });
    roundTrip(w, { type: 'setCells', sheetId: 's1', columnId: 'd', startRow: 1, values: ['5'] });
    assertEqual(sheet(w).columns[0].type, 'text');
    assertDeepEqual(values(w, 0), ['2026-01-01', '5']);
  });

  test('1e400 (unendlich) in eine Zahlenspalte: Text statt Infinity, Umkehrung geht', () => {
    const w = setup({ cells: [[1, null, null], [null, null, null], [null, null, null]] });
    roundTrip(w, { type: 'setCells', sheetId: 's1', columnId: 'a', startRow: 1, values: ['1e400'] });
    assertEqual(sheet(w).columns[0].type, 'text');
    assertDeepEqual(values(w, 0), ['1', '1e400', null]);
  });

  test('1e400 € in eine Zahlenspalte: Text statt unendlicher Währung', () => {
    const w = setup();
    roundTrip(w, { type: 'setCells', sheetId: 's1', columnId: 'a', startRow: 0, values: ['1e400 €'] });
    assertEqual(sheet(w).columns[0].type, 'text');
    assertEqual(values(w, 0)[0], '1e400 €');
  });

  test('über das Blattende: das Blatt wächst, Umkehrung kürzt wieder', () => {
    const w = setup();
    roundTrip(w, { type: 'setCells', sheetId: 's1', columnId: 'c', startRow: 2, values: [7, 8, 9] });
    assertEqual(sheet(w).data.rowCount, 5);
    assertDeepEqual(values(w, 2), [null, null, 7, 8, 9]);
    assertDeepEqual(values(w, 0), [null, null, null, null, null]);
  });

  test('ein einfacher Wert über einer Formelzelle löscht die Formel; Umkehrung holt sie zurück', () => {
    const w = setup({ cells: [[2, null, null], [null, null, null], [null, null, null]], formulas: { b: { 0: '=C1[1]*2' } } });
    assertEqual(values(w, 1)[0], 4);
    roundTrip(w, { type: 'setCells', sheetId: 's1', columnId: 'b', startRow: 0, values: [9] });
    assertDeepEqual(sheet(w).formulas, {});
    assertEqual(values(w, 1)[0], 9);
  });

  test('nach setCells auf eine Quellspalte steht der neue Formelwert in der Tabelle', () => {
    const w = setup({ cells: [[2, null, null], [null, null, null], [null, null, null]], formulas: { b: { 0: '=C1[1]*2' } } });
    w.m.setCells({ sheetId: 's1', columnId: 'a', startRow: 0, values: [10] });
    assertEqual(values(w, 1)[0], 20);
  });

  test('gesperrte Spalte: column "<id>" is locked (hard|soft)', () => {
    const w = setup({ heads: [col('a', { shortName: 'C1', meta: { lock: 'hard' } }), col('b', { shortName: 'C2', meta: { lock: 'soft' } })] });
    rejects(w, () => w.m.setCells({ sheetId: 's1', columnId: 'a', startRow: 0, values: [1] }), 'column "a" is locked (hard)');
    rejects(w, () => w.m.setCells({ sheetId: 's1', columnId: 'b', startRow: 0, values: [1] }), 'column "b" is locked (soft)');
  });

  test('unbekanntes Blatt und unbekannte Spalte', () => {
    const w = setup();
    rejects(w, () => w.m.setCells({ sheetId: 'weg', columnId: 'a', startRow: 0, values: [1] }), 'unknown_sheet: weg');
    rejects(w, () => w.m.setCells({ sheetId: 's1', columnId: 'x', startRow: 0, values: [1] }), 'unknown columnId "x"');
  });

  test('inaktives Blatt wird geschrieben, das aktive bleibt', () => {
    const w = setup();
    roundTrip(w, { type: 'setCells', sheetId: 's2', columnId: 'i1', startRow: 0, values: [5] });
    assertEqual(w.m.activeSheetId, 's1');
    assertDeepEqual(values(w, 1, 's2'), [5, null]);
  });
});

suite('worksheet: setFormula', () => {
  test('schreibt, rechnet, liefert Wert und Fehler; Umkehrung entfernt die Formel', () => {
    const w = setup({ cells: [[3, null, null], [null, null, null], [null, null, null]] });
    const r = roundTrip(w, { type: 'setFormula', sheetId: 's1', columnId: 'b', row: 1, formula: ' =C1[1]+1 ' });
    assertDeepEqual(r, { value: 4, error: null });
    assertDeepEqual(sheet(w).formulas, { b: { 1: '=C1[1]+1' } });
    assertEqual(values(w, 1)[1], 4);
  });

  test('ersetzt eine Formel; Umkehrung stellt die alte her', () => {
    const w = setup({ cells: [[3, null, null], [null, null, null], [null, null, null]], formulas: { b: { 0: '=C1[1]' } } });
    roundTrip(w, { type: 'setFormula', sheetId: 's1', columnId: 'b', row: 0, formula: '=C1[1]*3' });
    assertEqual(values(w, 1)[0], 9);
  });

  test('row = Zeilenzahl hängt eine Zeile an', () => {
    const w = setup();
    roundTrip(w, { type: 'setFormula', sheetId: 's1', columnId: 'a', row: 3, formula: '=1+1' });
    assertEqual(sheet(w).data.rowCount, 4);
    assertEqual(values(w, 0)[3], 2);
  });

  test('Rechenfehler: Formel bleibt, Zelle leer, Fehlercode zurück', () => {
    const w = setup();
    const r = w.m.setFormula({ sheetId: 's1', columnId: 'a', row: 0, formula: '=1/0' });
    assertEqual(r.value, null);
    assertTrue(typeof r.error === 'string' && r.error.startsWith('#'));
    assertDeepEqual(sheet(w).formulas, { a: { 0: '=1/0' } });
  });

  test('ungültige Formel, Zeile und Sperre', () => {
    const w = setup({ heads: [col('a', { shortName: 'C1' }), col('b', { shortName: 'C2', meta: { lock: 'hard' } })] });
    rejects(w, () => w.m.setFormula({ sheetId: 's1', columnId: 'a', row: 0, formula: 'x' }), 'invalid formula "x"; allowed: a text starting with "="');
    rejects(w, () => w.m.setFormula({ sheetId: 's1', columnId: 'a', row: 4, formula: '=1' }), 'invalid row 4; allowed: 0..3');
    rejects(w, () => w.m.setFormula({ sheetId: 's1', columnId: 'b', row: 0, formula: '=1' }), 'column "b" is locked (hard)');
    rejects(w, () => w.m.setFormula({ sheetId: 'weg', columnId: 'a', row: 0, formula: '=1' }), 'unknown_sheet: weg');
  });
});

/** Fünf leere Spalten e0…e4 mit drei Zeilen (wie worksheet-write-columns.test.js). */
function fiveEmpty(over = {}) {
  return setup({
    heads: [0, 1, 2, 3, 4].map((i) => col(`e${i}`, { shortName: `C${i + 1}`, format: { decimals: 6 }, ...(over[`e${i}`] ?? {}) })),
    cells: [0, 1, 2, 3, 4].map((i) => over[`v${i}`] ?? [null, null, null]),
    formulas: over.formulas ?? {},
  });
}

suite('worksheet: writeColumns', () => {
  test('append adds columns with given type and format', () => {
    const w = fiveEmpty();
    const ids = roundTrip(w, { type: 'writeColumns', sheetId: 's1', columns: [
      { to: 'append', name: 'Preis', type: 'currency', values: [1.5, 2.25], format: { decimals: 2 } },
      { to: 'append', name: 'Tag', type: 'date', values: ['2026-01-01'] },
    ] });
    const cols = sheet(w).columns;
    assertEqual(cols.length, 7);
    assertEqual(cols[5].id, ids[0]);
    assertEqual(cols[5].name, 'Preis');
    assertEqual(cols[5].type, 'currency');
    assertDeepEqual(cols[5].format, { decimals: 2 });
    assertEqual(cols[5].shortName, 'C6');
    assertEqual(cols[5].roleManual, false);
    assertEqual(cols[6].type, 'date');
    assertEqual(cols[6].role, 'date');
    assertEqual(sheet(w).data.rowCount, 3, 'rowCount bleibt das Maximum');
    assertEqual(sheet(w).data.columns[6].length, 3);
  });

  test('start fills empty C1 then appends', () => {
    const w = fiveEmpty({ e1: { name: 'B' }, v2: [1, null, null], e3: { name: 'D' }, e4: { name: 'E' } });
    const ids = roundTrip(w, { type: 'writeColumns', sheetId: 's1', columns: [
      { to: 'start', name: 'Erste', values: [1, 2, 3, 4] },
      { to: 'start', name: 'Zweite', values: [5] },
    ] });
    const cols = sheet(w).columns;
    assertEqual(ids[0], 'e0');
    assertEqual(cols[0].name, 'Erste');
    assertDeepEqual(values(w, 0), [1, 2, 3, 4]);
    assertEqual(cols.length, 6);
    assertEqual(ids[1], cols[5].id);
    assertEqual(cols[5].name, 'Zweite');
    assertEqual(sheet(w).data.rowCount, 4);
    for (const c of sheet(w).data.columns) assertEqual(c.length, 4, 'aufgefüllt');
  });

  test('overwrite replaces values and clears formulas, keeps name', () => {
    const w = setup({
      heads: [col('a', { name: 'Basis', shortName: 'C1' }), col('b', { name: 'Doppelt', shortName: 'C2' })],
      cells: [[1, 2, 3], [2, 4, 6]],
      formulas: { a: { 1: '=C2[2]' }, b: { 0: '=C1[1]*2', 1: '=C1[2]*2' } },
    });
    // Die Formeln bilden einen Kreis (a[2] → b[2] → a[2]): jedes Rechnen ändert
    // die Werte, darum hier ohne Rundreise (die steht im nächsten Fall).
    const ids = w.m.writeColumns({ sheetId: 's1', columns: [{ to: 'a', name: 'Neu', values: [10, 20] }] });
    assertDeepEqual(ids, ['a']);
    assertEqual(sheet(w).columns[0].name, 'Basis', 'Name bleibt');
    assertDeepEqual(values(w, 0), [10, 20, null]);
    assertEqual(sheet(w).formulas.a, undefined);
    assertDeepEqual(values(w, 1).slice(0, 2), [20, 40], 'Formeln anderer Spalten neu gerechnet');
  });

  test('overwrite: Umkehrung stellt Werte, Formeln und Typ her', () => {
    const w = setup({
      heads: [col('a', { name: 'Basis', shortName: 'C1' }), col('b', { name: 'Doppelt', shortName: 'C2' })],
      cells: [[1, 2, 3], [2, 4, 6]],
      formulas: { a: { 2: '=C1[1]+C1[2]' }, b: { 0: '=C1[1]*2', 1: '=C1[2]*2' } },
    });
    roundTrip(w, { type: 'writeColumns', sheetId: 's1', columns: [{ to: 'a', type: 'text', values: ['x', 'y', 'z', 'w'] }] });
    assertEqual(sheet(w).columns[0].type, 'text');
    assertEqual(sheet(w).data.rowCount, 4);
    assertEqual(sheet(w).formulas.a, undefined);
  });

  test('discrete numeric gets decimals 0', () => {
    const w = fiveEmpty();
    const [id] = w.m.writeColumns({ sheetId: 's1', columns: [{ to: 'append', name: 'Zahl', values: [1, 2, 3], discrete: true }] });
    const head = sheet(w).columns.find((c) => c.id === id);
    assertEqual(head.type, 'numeric');
    assertDeepEqual(head.format, { decimals: 0 });
  });

  test('unknown column throws and writes nothing', () => {
    const w = fiveEmpty();
    rejects(w, () => w.m.writeColumns({ sheetId: 's1', columns: [
      { to: 'start', name: 'A', values: [9, 9] },
      { to: 'gibt-es-nicht', values: [1] },
    ] }), 'unknown_column: gibt-es-nicht');
    rejects(w, () => w.m.writeColumns({ sheetId: 's1', columns: [
      { to: 'append', name: 'A', values: [9] },
      { to: 'append', type: 'quatsch', values: [1] },
    ] }), 'unknown_type: quatsch');
    rejects(w, () => w.m.writeColumns({ sheetId: 'weg', columns: [{ to: 'append', values: [1] }] }), 'unknown_sheet: weg');
  });

  test('inactive sheet is written without switching active sheet', () => {
    const w = fiveEmpty();
    const activeBefore = JSON.stringify(sheet(w));
    const ids = roundTrip(w, { type: 'writeColumns', sheetId: 's2', columns: [
      { to: 'i0', values: [7, 8, 9] },
      { to: 'start', name: 'Gefüllt', type: 'text', values: ['x'] },
      { to: 'append', name: 'Neu', values: [1] },
    ] });
    assertEqual(w.m.activeSheetId, 's1', 'aktives Blatt bleibt');
    assertEqual(JSON.stringify(sheet(w)), activeBefore, 'aktives Blatt unverändert');
    const st = sheet(w, 's2');
    assertEqual(st.data.rowCount, 3);
    assertEqual(st.columns.length, 3);
    assertDeepEqual(ids, ['i0', 'i1', st.columns[2].id]);
    assertEqual(st.columns[0].name, 'Alt');
    assertDeepEqual(values(w, 0, 's2'), [7, 8, 9]);
    assertEqual(st.columns[1].name, 'Gefüllt');
    assertEqual(st.columns[1].type, 'text');
    assertEqual(st.columns[2].shortName, 'C3');
  });

  test('one inverse reverts the whole write', () => {
    const w = fiveEmpty();
    roundTrip(w, { type: 'writeColumns', sheetId: 's1', columns: [
      { to: 'start', name: 'A', values: [1, 2, 3, 4, 5] },
      { to: 'e3', type: 'text', values: ['t'] },
      { to: 'append', name: 'B', values: [1] },
      { to: 'append', name: 'C', values: [2] },
    ] });
    assertEqual(w.seen.inverses.length, 1, 'eine Umkehrung');
  });

  test('returns column ids in order', () => {
    const w = fiveEmpty();
    const ids = w.m.writeColumns({ sheetId: 's1', columns: [
      { to: 'append', name: 'Z', values: [1] },
      { to: 'e2', values: [2] },
      { to: 'start', name: 'S', values: [3] },
    ] });
    assertDeepEqual(ids, [sheet(w).columns[5].id, 'e2', 'e0']);
  });

  test('Rollen: Datum in einen Startslot, angehängte Textspalte', () => {
    const w = fiveEmpty();
    w.m.writeColumns({ sheetId: 's1', columns: [
      { to: 'start', name: 'Tag', type: 'date', values: ['2026-01-01', '2026-01-02'] },
      { to: 'append', name: 'Gruppe', type: 'text', values: ['a', 'b', 'a', 'b', 'a', 'b'] },
    ] });
    const cols = sheet(w).columns;
    assertEqual(cols[0].type, 'date');
    assertEqual(cols[0].role, 'date');
    assertEqual(cols.at(-1).role, 'categorical');
  });

  test('unit landet in der Spalte, falscher Typ wirft', () => {
    const w = fiveEmpty();
    const ids = w.m.writeColumns({ sheetId: 's1', columns: [
      { to: 'append', name: 'L', values: [1], unit: 'mm' },
      { to: 'e1', values: [2], unit: 'kg' },
    ] });
    assertEqual(sheet(w).columns.find((c) => c.id === ids[0]).unit, 'mm');
    assertEqual(sheet(w).columns[1].unit, 'kg');
    rejects(w, () => w.m.writeColumns({ sheetId: 's1', columns: [{ to: 'append', values: [1], unit: 3 }] }), 'columns[0].unit');
  });

  test('ganz oder gar nicht: eine unbekannte zweite Spalte ändert nichts', () => {
    const w = fiveEmpty();
    rejects(w, () => w.m.writeColumns({ sheetId: 's1', columns: [
      { to: 'e0', values: [1, 2, 3, 4] },
      { to: 'nein', values: [1] },
    ] }), 'unknown_column: nein');
  });

  test('R11: NaN, ±Infinity und undefined werden null', () => {
    const w = fiveEmpty();
    const [id] = roundTrip(w, { type: 'writeColumns', sheetId: 's1', columns: [{ to: 'append', name: 'Log', values: [-Infinity, NaN, undefined, 1] }] });
    assertDeepEqual(values(w, sheet(w).columns.findIndex((c) => c.id === id)), [null, null, null, 1]);
  });

  test('ungültiger Zellwert wird abgelehnt', () => {
    const w = fiveEmpty();
    rejects(w, () => w.m.writeColumns({ sheetId: 's1', columns: [{ to: 'append', values: [1, {}] }] }), 'columns[0].values[1]');
    rejects(w, () => w.m.writeColumns({ sheetId: 's1', columns: [{ to: 'append', values: [() => 1] }] }), 'columns[0].values[0]');
  });
});

suite('worksheet: importCsv', () => {
  test('ersetzt den Inhalt, liefert Spalten und Zeilen; Umkehrung stellt alles her', () => {
    const w = setup({ cells: [[1, 2, 3], [null, null, null], [null, null, null]], formulas: { b: { 0: '=C1[1]' } } });
    const r = roundTrip(w, { type: 'importCsv', sheetId: 's1', csvText: 'X;Y\n1;a\n2;b\n3;c\n4;d' });
    assertDeepEqual(r, { columns: 2, rows: 4 });
    const s = sheet(w);
    assertDeepEqual(s.columns.map((c) => c.name), ['X', 'Y']);
    assertDeepEqual(s.columns.map((c) => c.shortName), ['C1', 'C2']);
    assertTrue(!['a', 'b'].includes(s.columns[0].id), 'neue ids');
    assertEqual(s.columns[1].type, 'text');
    assertDeepEqual(s.formulas, {});
    assertEqual(s.data.rowCount, 4);
    assertDeepEqual(values(w, 0), [1, 2, 3, 4]);
  });

  test('leerer Text: nichts geändert, { columns: 0, rows: 0 }', () => {
    const w = setup();
    const before = w.json();
    assertDeepEqual(w.m.importCsv({ sheetId: 's1', csvText: '' }), { columns: 0, rows: 0 });
    assertEqual(w.json(), before);
  });
});

suite('worksheet: pasteBlock (Verhalten aus importFromClipboard)', () => {
  test('über das Blattende hinaus: Zeilen und Spalten wachsen (wie heute), Umkehrung', () => {
    const w = setup({ heads: [col('a', { shortName: 'C1' }), col('b', { shortName: 'C2' })], cells: [[10, 20, 30], [1, 1, 2]] });
    const r = roundTrip(w, { type: 'pasteBlock', sheetId: 's1', columnId: 'b', startRow: 2, rows: [['5', '6'], ['7', '8']] });
    assertDeepEqual(r, { columns: 2, rows: 2 });
    const s = sheet(w);
    assertEqual(s.columns.length, 3);
    assertEqual(s.columns[2].shortName, 'C3');
    assertEqual(s.data.rowCount, 4);
    assertDeepEqual(values(w, 1), [1, 1, 5, 7]);
    assertDeepEqual(values(w, 2), [null, null, 6, 8]);
    assertDeepEqual(values(w, 0), [10, 20, 30, null]);
  });

  test('gesperrte Spalte im Block: übersprungen wie bei fillRange, freie Zellen geschrieben, Umkehrung', () => {
    const w = setup({ heads: [col('a', { shortName: 'C1' }), col('b', { shortName: 'C2', meta: { lock: 'hard' } }), col('c', { shortName: 'C3' })], cells: [[10, 20, 30], [1, 1, 2], [null, null, null]] });
    const r = roundTrip(w, { type: 'pasteBlock', sheetId: 's1', columnId: 'a', startRow: 1, rows: [['5', '6', '7'], ['8', '9', '10']] });
    assertDeepEqual(r, { columns: 2, rows: 2 }, 'zählt nur geschriebene Spalten');
    const inv = w.seen.inverses[0];
    assertDeepEqual(inv.cols.map((e) => e.index).sort(), [0, 2], 'Umkehrung nur für geschriebene Spalten');
    assertDeepEqual(values(w, 0), [10, 5, 8]);
    assertDeepEqual(values(w, 1), [1, 1, 2], 'gesperrte Spalte unverändert');
    assertDeepEqual(values(w, 2), [null, 7, 10]);
  });

  test('gesperrte Spalte im Block: Undo stellt alles her', () => {
    const w = setup({ heads: [col('a', { shortName: 'C1' }), col('b', { shortName: 'C2', meta: { lock: 'hard' } })], cells: [[10, 20, 30], [1, 1, 2]] });
    const before = canon(sheet(w));
    w.m.pasteBlock({ sheetId: 's1', columnId: 'a', startRow: 2, rows: [['5', '6', '7'], ['8', '9', '10']] });
    assertEqual(sheet(w).columns.length, 3, 'Spalte angehängt');
    assertEqual(sheet(w).data.rowCount, 4, 'Zeile angehängt');
    assertDeepEqual(values(w, 0), [10, 20, 5, 8]);
    assertDeepEqual(values(w, 1), [1, 1, 2, null], 'gesperrte Spalte nur verlängert');
    assertDeepEqual(values(w, 2), [null, null, 7, 10]);
    for (const inv of w.seen.inverses) w.m.execute(inv);
    assertDeepEqual(canon(sheet(w)), before);
  });

  test('nur gesperrte Zielspalten: Fehler, nichts geschrieben', () => {
    const w = setup({ heads: [col('a', { shortName: 'C1' }), col('b', { shortName: 'C2', meta: { lock: 'hard' } })], cells: [[10, 20, 30], [1, 1, 2]] });
    rejects(w, () => w.m.pasteBlock({ sheetId: 's1', columnId: 'b', startRow: 0, rows: [['5'], ['8']] }), 'column "b" is locked (hard)');
  });

  test('Kopfzeile benennt unbenannte Spalten (eindeutig), Typerkennung je Spalte', () => {
    const w = setup({ heads: [col('a', { name: 'Länge', shortName: 'C1' }), col('b', { shortName: 'C2' }), col('c', { name: 'Gewicht', shortName: 'C3' })] });
    roundTrip(w, { type: 'pasteBlock', sheetId: 's1', columnId: 'a', startRow: 0, rows: [['L', 'Gewicht', 'Ort'], ['1,5', '2', 'x'], ['2,5', '3', 'y']] });
    const s = sheet(w);
    assertEqual(s.columns[0].name, 'Länge', 'benannte Spalte behält ihren Namen');
    assertEqual(s.columns[1].name, 'Gewicht (2)');
    assertEqual(s.columns[2].name, 'Gewicht');
    assertDeepEqual(values(w, 0), [1.5, 2.5, null]);
    assertEqual(s.columns[2].type, 'text');
    assertDeepEqual(values(w, 2), ['x', 'y', null]);
  });

  test('Formeln in den eingefügten Zellen fallen weg', () => {
    const w = setup({ cells: [[1, 2, 3], [null, null, null], [null, null, null]], formulas: { b: { 0: '=C1[1]', 2: '=C1[3]' } } });
    roundTrip(w, { type: 'pasteBlock', sheetId: 's1', columnId: 'b', startRow: 0, rows: [['7'], ['8']] });
    assertDeepEqual(sheet(w).formulas, { b: { 2: '=C1[3]' } });
    assertDeepEqual(values(w, 1), [7, 8, 3]);
  });

  const one = () => setup({ heads: [col('a', { shortName: 'C1' })], cells: [[null, null, null]] });

  test('eine Kopfzeile aus Namen wird weiter als Spaltenname genommen', () => {
    const w = one();
    w.m.pasteBlock({ sheetId: 's1', columnId: 'a', startRow: 0, rows: [['Durchmesser'], ['1,5'], ['2,5']] });
    assertEqual(sheet(w).columns[0].name, 'Durchmesser');
    assertDeepEqual(values(w, 0).slice(0, 2), [1.5, 2.5]);
  });

  test('eine erste Zeile aus Text und Zahl ist Daten, keine Kopfzeile', () => {
    const w = one();
    w.m.pasteBlock({ sheetId: 's1', columnId: 'a', startRow: 0, rows: [['A', '1'], ['B', '2']] });
    assertEqual(sheet(w).columns[0].name, '');
    assertDeepEqual(values(w, 0).slice(0, 2), ['A', 'B']);
  });

  test('header: false nimmt alle Zeilen als Daten', () => {
    const w = one();
    const r = w.m.pasteBlock({ sheetId: 's1', columnId: 'a', startRow: 0, rows: [['Teil', 'Wert'], ['A', '1']], header: false });
    assertEqual(r.rows, 2);
    assertEqual(sheet(w).columns[0].name, '');
    assertDeepEqual(values(w, 0).slice(0, 2), ['Teil', 'A']);
  });

  test('header: true nimmt die erste Zeile als Kopf, auch ohne Zahl darunter', () => {
    const w = one();
    w.m.pasteBlock({ sheetId: 's1', columnId: 'a', startRow: 0, rows: [['N'], ['x']], header: true });
    assertEqual(sheet(w).columns[0].name, 'N');
    assertEqual(values(w, 0)[0], 'x');
  });

  test('startRow hinter dem Blattende und unbekannte Spalte werden abgelehnt', () => {
    const w = setup();
    rejects(w, () => w.m.pasteBlock({ sheetId: 's1', columnId: 'a', startRow: 4, rows: [['1']] }), 'invalid startRow 4; allowed: 0..3');
    rejects(w, () => w.m.pasteBlock({ sheetId: 's1', columnId: 'x', startRow: 0, rows: [['1']] }), 'unknown columnId "x"');
  });
});

suite('worksheet: fillRange (Verhalten aus _applyFill)', () => {
  test('lotrecht vorwärts setzt eine Reihe fort und lässt das Blatt wachsen', () => {
    const w = setup({ cells: [[1, 2, null], [null, null, null], [null, null, null]] });
    const n = roundTrip(w, { type: 'fillRange', sheetId: 's1', source: { c0: 0, r0: 0, c1: 0, r1: 1 }, target: { c0: 0, r0: 0, c1: 0, r1: 4 }, ctrl: false });
    assertEqual(n, 3);
    assertEqual(sheet(w).data.rowCount, 5);
    assertDeepEqual(values(w, 0), [1, 2, 3, 4, 5]);
  });

  test('lotrecht rückwärts', () => {
    const w = setup({ cells: [[null, 5, 5], [null, null, null], [null, null, null]] });
    roundTrip(w, { type: 'fillRange', sheetId: 's1', source: { c0: 0, r0: 1, c1: 0, r1: 2 }, target: { c0: 0, r0: 0, c1: 0, r1: 2 }, ctrl: false });
    assertDeepEqual(values(w, 0), [5, 5, 5]);
  });

  test('waagerecht vorwärts, gesperrte Zielspalte bleibt', () => {
    const w = setup({
      heads: [col('a', { shortName: 'C1' }), col('b', { shortName: 'C2', meta: { lock: 'soft' } }), col('c', { shortName: 'C3' })],
      cells: [[4, null, null], [null, null, null], [null, null, null]],
    });
    roundTrip(w, { type: 'fillRange', sheetId: 's1', source: { c0: 0, r0: 0, c1: 0, r1: 0 }, target: { c0: 0, r0: 0, c1: 2, r1: 0 }, ctrl: false });
    assertDeepEqual(values(w, 1), [null, null, null]);
    assertEqual(values(w, 2)[0], 4);
  });

  test('Formeln wandern mit verschobenem Bezug', () => {
    const w = setup({ cells: [[1, 2, 3], [null, null, null], [null, null, null]], formulas: { b: { 0: '=C1[1]*10' } } });
    roundTrip(w, { type: 'fillRange', sheetId: 's1', source: { c0: 1, r0: 0, c1: 1, r1: 0 }, target: { c0: 1, r0: 0, c1: 1, r1: 2 }, ctrl: false });
    assertDeepEqual(sheet(w).formulas.b, { 0: '=C1[1]*10', 1: '=C1[2]*10', 2: '=C1[3]*10' });
    assertDeepEqual(values(w, 1), [10, 20, 30]);
  });

  test('gesperrte Quellspalte lotrecht: übersprungen, nichts zu tun → 0', () => {
    const w = setup({ heads: [col('a', { shortName: 'C1', meta: { lock: 'hard' } })], cells: [[1, 2, null]] });
    const before = w.json();
    assertEqual(w.m.fillRange({ sheetId: 's1', source: { c0: 0, r0: 0, c1: 0, r1: 1 }, target: { c0: 0, r0: 0, c1: 0, r1: 2 }, ctrl: false }), 0);
    assertEqual(w.json(), before);
  });

  test('waagerecht aus Text 1e400 in eine Zahlenspalte: null statt Infinity, Umkehrung geht', () => {
    const w = setup({
      heads: [col('a', { shortName: 'C1', type: 'text', role: 'freeText' }), col('b', { shortName: 'C2' })],
      cells: [['1e400', null, null], [5, null, null]],
    });
    roundTrip(w, { type: 'fillRange', sheetId: 's1', source: { c0: 0, r0: 0, c1: 0, r1: 0 }, target: { c0: 0, r0: 0, c1: 1, r1: 0 }, ctrl: false });
    assertEqual(values(w, 1)[0], null);
  });

  test('Ziel nach beiden Seiten einer Achse → abgelehnt', () => {
    const w = setup({ cells: [[1, 2, 3], [null, null, null], [null, null, null]] });
    rejects(w, () => w.m.fillRange({ sheetId: 's1', source: { c0: 0, r0: 1, c1: 0, r1: 2 }, target: { c0: 0, r0: 0, c1: 0, r1: 4 }, ctrl: false }), 'invalid target');
    rejects(w, () => w.m.fillRange({ sheetId: 's1', source: { c0: 1, r0: 0, c1: 1, r1: 0 }, target: { c0: 0, r0: 0, c1: 2, r1: 0 }, ctrl: false }), 'invalid target');
  });

  test('Ziel weiter als 10 000 Zeilen hinter dem Blattende → abgelehnt, bis dahin erlaubt', () => {
    const w = setup({ cells: [[1, 2, 3], [null, null, null], [null, null, null]] });
    rejects(w, () => w.m.fillRange({ sheetId: 's1', source: { c0: 0, r0: 0, c1: 0, r1: 2 }, target: { c0: 0, r0: 0, c1: 0, r1: 1e9 }, ctrl: false }), 'invalid target');
    rejects(w, () => w.m.fillRange({ sheetId: 's1', source: { c0: 0, r0: 0, c1: 0, r1: 2 }, target: { c0: 0, r0: 0, c1: 0, r1: 3 + 10000 }, ctrl: false }), 'invalid target');
    w.m.fillRange({ sheetId: 's1', source: { c0: 0, r0: 0, c1: 0, r1: 2 }, target: { c0: 0, r0: 0, c1: 0, r1: 2 + 10000 }, ctrl: false });
    assertEqual(sheet(w).data.rowCount, 10003);
  });

  test('Ziel umfasst die Quelle nicht → abgelehnt', () => {
    const w = setup();
    rejects(w, () => w.m.fillRange({ sheetId: 's1', source: { c0: 0, r0: 0, c1: 0, r1: 1 }, target: { c0: 1, r0: 0, c1: 1, r1: 2 }, ctrl: false }), 'invalid target');
  });
});

suite('worksheet: clearRange (Verhalten aus _clearSelection)', () => {
  test('leert Werte und Formeln, gesperrte Spalten bleiben; Umkehrung', () => {
    const w = setup({
      heads: [col('a', { shortName: 'C1', meta: { lock: 'soft' } }), col('b', { shortName: 'C2' }), col('c', { shortName: 'C3' })],
      cells: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
      formulas: { c: { 0: '=C1[1]+C2[1]' } },
    });
    const n = roundTrip(w, { type: 'clearRange', sheetId: 's1', c0: 0, r0: 0, c1: 2, r1: 1 });
    assertEqual(n, 4);
    assertDeepEqual(values(w, 0), [1, 2, 3]);
    assertDeepEqual(values(w, 1), [null, null, 6]);
    assertDeepEqual(values(w, 2), [null, null, 9]);
    assertDeepEqual(sheet(w).formulas, {});
  });

  test('zählt nur Zellen, die wirklich geleert werden (Wert oder Formel)', () => {
    const w = setup({ cells: [[1, null, null], [null, null, null], [null, null, null]], formulas: { b: { 2: '=1' } } });
    assertEqual(w.m.clearRange({ sheetId: 's1', c0: 0, r0: 0, c1: 2, r1: 2 }), 2);
    const before = w.json();
    assertEqual(w.m.clearRange({ sheetId: 's1', c0: 0, r0: 0, c1: 2, r1: 2 }), 0);
    assertEqual(w.json(), before);
  });

  test('außerhalb des Blatts → abgelehnt', () => {
    const w = setup();
    rejects(w, () => w.m.clearRange({ sheetId: 's1', c0: 0, r0: 0, c1: 3, r1: 0 }), 'invalid c1 3; allowed: 0..2');
    rejects(w, () => w.m.clearRange({ sheetId: 's1', c0: 1, r0: 0, c1: 0, r1: 0 }), 'invalid c1 0; allowed: 1..2');
  });
});

suite('worksheet: moveCells (Verhalten aus DataGrid.moveCells)', () => {
  const moveSheet = () => setup({
    heads: [col('x', { name: 'X', shortName: 'C1' }), col('y', { name: 'Y', shortName: 'C2' }), col('z', { name: 'Z', shortName: 'C3' })],
    cells: [[1, 2, 3, 4, null, null], [10, 20, 30, 40, null, null], [null, null, null, null, null, null]],
    formulas: { z: { 0: '=C1[1]+C2[1]', 1: '=SUM(C1[1]:C1[2])', 2: '=C2[3]', 3: '=C1[4]' } },
  });
  const mv = (w, source, toCol, toRow) => w.m.moveCells({ sheetId: 's1', source, toCol, toRow });
  const fz = (w, row) => sheet(w).formulas.z?.[row] ?? null;
  const join = (w, c) => values(w, c).map((v) => v ?? '').join('|');
  const down = { c0: 0, r0: 0, c1: 0, r1: 1 };

  test('moves the values and empties the source', () => {
    const w = moveSheet();
    assertDeepEqual(mv(w, down, 0, 4), { c0: 0, r0: 4, c1: 0, r1: 5 });
    assertEqual(join(w, 0), '||3|4|1|2');
  });

  test('references to the moved cells follow them', () => {
    const w = moveSheet();
    mv(w, down, 0, 4);
    assertEqual(fz(w, 0), '=C1[5]+C2[1]');
    assertEqual(fz(w, 1), '=SUM(C1[5]:C1[6])');
    assertEqual(values(w, 2)[0], 11);
    assertEqual(values(w, 2)[1], 3);
  });

  test('a reference to an overwritten cell becomes #REF!', () => {
    const w = moveSheet();
    mv(w, down, 0, 2);
    assertEqual(join(w, 0), '||1|2||');
    assertEqual(fz(w, 3), '=#REF!');
    assertEqual(fz(w, 0), '=C1[3]+C2[1]');
    assertEqual(values(w, 2)[3], null);
  });

  test('a moved formula keeps pointing at the same cells', () => {
    const w = moveSheet();
    mv(w, { c0: 2, r0: 2, c1: 2, r1: 2 }, 2, 5);
    assertEqual(fz(w, 5), '=C2[3]');
    assertEqual(values(w, 2)[5], 30);
    assertEqual(fz(w, 2), null);
    assertEqual(values(w, 2)[2], null);
  });

  test('a formula moved together with its source still sees it', () => {
    const w = moveSheet();
    mv(w, { c0: 1, r0: 2, c1: 2, r1: 2 }, 1, 5);
    assertEqual(fz(w, 5), '=C2[6]');
    assertEqual(values(w, 2)[5], 30);
  });

  test('undo and redo restore values and formulas', () => {
    roundTrip(moveSheet(), { type: 'moveCells', sheetId: 's1', source: down, toCol: 0, toRow: 2 });
    const w = moveSheet();
    mv(w, down, 0, 2);
    for (const c of [...w.seen.inverses].reverse()) w.m.execute(c);
    assertEqual(join(w, 0), '1|2|3|4||');
    assertEqual(fz(w, 3), '=C1[4]');
    assertEqual(values(w, 2)[3], 4);
  });

  test('selects the target (Rückgabe, eine Änderung)', () => {
    const w = moveSheet();
    const rev = w.m.$tableRev;
    w.seen.inverses = null;
    assertDeepEqual(mv(w, { c0: 0, r0: 0, c1: 1, r1: 0 }, 1, 4), { c0: 1, r0: 4, c1: 2, r1: 4 });
    assertEqual(w.m.$tableRev, rev + 1);
    assertEqual(w.seen.inverses.length, 1);
  });

  test('clamps the target into the grid', () => {
    const w = moveSheet();
    assertDeepEqual(mv(w, down, 0, 99), { c0: 0, r0: 4, c1: 0, r1: 5 });
    assertEqual(join(w, 0), '||3|4|1|2');
  });

  test('a locked column in the target refuses the move', () => {
    const w = setup({
      heads: [col('x', { name: 'X', shortName: 'C1' }), col('y', { name: 'Y', shortName: 'C2', meta: { lock: 'hard' } }), col('z', { shortName: 'C3' })],
      cells: [[1, 2, 3, 4, null, null], [10, 20, 30, 40, null, null], [null, null, null, null, null, null]],
    });
    rejects(w, () => mv(w, { c0: 0, r0: 0, c1: 0, r1: 0 }, 1, 4), 'column "y" is locked (hard)');
    assertEqual(join(w, 0), '1|2|3|4||');
  });

  test('Ziel = Quelle → null, kein Verlauf', () => {
    const w = moveSheet();
    const before = w.json();
    w.seen.inverses = null;
    assertEqual(mv(w, down, 0, 0), null);
    assertEqual(w.seen.inverses?.length ?? 0, 0);
    assertEqual(w.json(), before);
    assertEqual(mv(w, { c0: 0, r0: 4, c1: 0, r1: 5 }, 0, 99), null);
    assertEqual(w.seen.inverses?.length ?? 0, 0);
    assertEqual(w.json(), before);
  });

  test('Quelle außerhalb wirft', () => {
    const w = moveSheet();
    rejects(w, () => mv(w, { c0: 0, r0: 0, c1: 3, r1: 0 }, 0, 1), 'invalid source.c1');
  });

  test('Typ der Zielspalte neu erkannt', () => {
    const w = setup({
      heads: [col('x', { type: 'text', role: 'categorical', shortName: 'C1' }), col('y', { shortName: 'C2' })],
      cells: [['a', 'b', 'c', 'd'], [null, null, null, null]],
    });
    mv(w, down, 1, 0);
    assertEqual(sheet(w).columns[1].type, 'text');
    assertEqual(join(w, 1), 'a|b||');
  });

  test('überlappendes Ziel: Quelle zuerst gelesen, Bezug auf Quellzelle folgt', () => {
    const w = setup({
      heads: [col('x', { shortName: 'C1' }), col('y', { shortName: 'C2' })],
      cells: [[1, 2, 3, null], [null, null, null, null]],
      formulas: { y: { 0: '=C1[2]' } },
    });
    mv(w, { c0: 0, r0: 0, c1: 0, r1: 2 }, 0, 1);
    assertEqual(join(w, 0), '|1|2|3');
    assertEqual(sheet(w).formulas.y[0], '=C1[3]');
    assertEqual(values(w, 1)[0], 2);
  });
});

suite('worksheet: moveCells (Bezüge, moveCellRefs über das Kommando)', () => {
  const refSheet = (formula) => setup({
    heads: [col('x', { name: 'X', shortName: 'C1' }), col('y', { name: 'Y', shortName: 'C2' }), col('u', { shortName: 'C3' }), col('f', { name: 'F', shortName: 'C4' })],
    cells: [0, 1, 2, 3].map(() => new Array(6).fill(null)),
    formulas: { f: { 5: formula } },
  });
  const src = { c0: 0, r0: 0, c1: 0, r1: 1 };
  const run = (formula, toCol, toRow) => {
    const w = refSheet(formula);
    w.m.moveCells({ sheetId: 's1', source: src, toCol, toRow });
    return sheet(w).formulas.f[5];
  };

  test('keeps $ markers and leaves column refs alone', () => {
    assertEqual(run('=$C1[$2]+C1+SUM(C1:C2)+C2[1]', 0, 3), '=$C1[$5]+C1+SUM(C1:C2)+C2[1]');
  });
  test('a partly moved cell range stays', () => {
    assertEqual(run('=SUM(C1[2]:C1[3])', 0, 3), '=SUM(C1[2]:C1[3])');
  });
  test('a reference into the overwritten area becomes #REF!', () => {
    assertEqual(run('=C1[4]+$C1[$5]+C1[6]', 0, 3), '=#REF!+#REF!+C1[6]');
  });
  test('a named reference takes the target column name, or C<n>', () => {
    assertEqual(run("='X'[1]*2", 1, 0), "='Y'[1]*2");
    assertEqual(run("='X'[1]*2", 2, 0), '=C3[1]*2');
    assertEqual(run("='X'[1]", 0, 3), "='X'[4]");
  });
  test('leaves string literals alone', () => {
    assertEqual(run('=IF(C1[1]>0, "C1[1]", 0)', 0, 3), '=IF(C1[4]>0, "C1[1]", 0)');
  });
});

suite('worksheet: Agentenfläche der Zellkommandos', () => {
  test('pasteBlock, fillRange, clearRange, moveCells sind Aktionen; restoreCells (nur Umkehrung) nicht', () => {
    const { actions } = schemaAgentEntry(WorksheetModel);
    for (const name of ['setCells', 'setFormula', 'writeColumns', 'importCsv', 'pasteBlock', 'fillRange', 'clearRange', 'moveCells']) {
      assertTrue(Boolean(actions[name]), `${name} fehlt`);
    }
    assertEqual(actions.restoreCells, undefined);
  });
});

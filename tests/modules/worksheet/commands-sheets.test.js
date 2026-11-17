/**
 * Arbeitsblatt (Zielform): Kommandos für Blätter mit Umkehrung
 * (`domain/commands-sheets.js`). Jedes Kommando → seine Umkehrung ergibt den
 * Ausgangsstand (`toJSON` gleich, auch `activeSheetId`; `sheetCounter` steigt
 * nur, Ruling R12: eine Blatt-id wird nie zweimal vergeben),
 * die Wiederholung den Stand danach. Die Ablehnungen sind die der heutigen
 * Agentenaktionen (`worksheet.js`, E2E `worksheet.spec.js`), wörtlich; eine
 * unbekannte Blatt-id meldet `unknown_sheet: <id>` (Global Constraints).
 */
import { suite, test, assert, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { WorksheetModel, START_COLUMN_COUNT } from '../../../js/modules/worksheet/domain/model.js';
import { setCommandObserver, setHistoryMode, collectInverses } from '../../../js/core/model.js';
import { recalcFormulas } from '../../../js/core/datagrid/table/formulas.js';
import { schemaAgentEntry } from '../../../js/core/agent/agent-schema.js';
import { START_ROW_COUNT } from '../../../js/core/datagrid/datagrid-utils.js';
import { TableData } from '../../../js/core/table-data.js';

/** Ein Spaltenkopf in der Zielform. */
function col(id, over = {}) {
  return {
    id, name: '', shortName: id, type: 'numeric', unit: null, role: 'continuous', roleManual: false, format: {}, meta: null, ...over,
  };
}

/** Zwei Blätter `s1` (mit Formel) und `s2`; Verlaufsmodus `inverse`. */
function setup({ activeSheetId = 's1', single = false } = {}) {
  const sheets = [
    {
      id: 's1', name: 'Eins',
      columns: [col('a', { shortName: 'C1', name: 'A' }), col('b', { shortName: 'C2' })],
      formulas: { b: { 1: "='A'[2]*2" } },
      data: { rowCount: 3, columns: [[1, 2, 3], [null, null, null]] },
    },
    { id: 's2', name: 'Zwei', columns: [col('i0', { name: 'Alt', shortName: 'C1' })], formulas: {}, data: { rowCount: 2, columns: [[7, 8]] } },
  ];
  const json = {
    _schema: { version: '1.0' },
    sheets: single ? sheets.slice(0, 1) : sheets,
    sheetCounter: 2,
    activeSheetId,
    gridView: {},
  };
  const m = WorksheetModel.fromJSON(json);
  const s = m.sheets[0];
  recalcFormulas(s.columns, s.data, s.formulas);
  setHistoryMode(m, 'inverse');
  const seen = { inverses: null };
  setCommandObserver(m, (_name, _args, _result, inv) => { if (inv) seen.inverses = inv; });
  // Ohne `sheetCounter`: der Zähler sinkt nie (R12), Tests prüfen ihn einzeln.
  return { m, seen, json: () => canon({ ...m.toJSON(), sheetCounter: undefined }) };
}

/** JSON mit sortierten Objektschlüsseln. */
function canon(v) {
  return JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
}

/** Kommando, Rückgängig (Umkehrungen rückwärts), Wiederholen. */
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
  return { result, undo };
}

function throwsWith(fn, part) {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  assert(err, `kein Wurf, erwartet ${part}`);
  assert(String(err.message).includes(part), `Meldung "${err?.message}" enthält nicht "${part}"`);
}

/** Wirft, und der Stand ist unverändert. */
function rejects(w, fn, part) {
  const before = w.json();
  const rev = w.m.$tableRev;
  throwsWith(fn, part);
  assertEqual(w.json(), before, 'nichts geschrieben');
  assertEqual(w.m.$tableRev, rev, 'kein markTableChanged');
}

const sheetIds = (w) => w.m.sheets.map((s) => s.id);
const byId = (w, id) => w.m.sheets.find((s) => s.id === id);

suite('worksheet: addSheet', () => {
  test('hängt ein Blatt an, macht es aktiv, liefert die id; Umkehrung', () => {
    const w = setup();
    const { result: id } = roundTrip(w, { type: 'addSheet' });
    assertEqual(id, 'sheet_3');
    assertDeepEqual(sheetIds(w), ['s1', 's2', 'sheet_3']);
    assertEqual(w.m.activeSheetId, 'sheet_3');
    assertEqual(w.m.sheetCounter, 3);
    const s = byId(w, id);
    assertEqual(s.name, 'Sheet 3');
    assertEqual(s.columns.length, START_COLUMN_COUNT);
    assertDeepEqual(s.columns.map((c) => c.shortName), ['C1', 'C2', 'C3', 'C4', 'C5']);
    assertEqual(s.data.rowCount, START_ROW_COUNT);
    assertTrue(s.data instanceof TableData);
  });

  test('name gesetzt: der Name gilt (der Aufrufer übersetzt)', () => {
    const w = setup();
    const id = w.m.addSheet({ name: 'Tabelle 3' });
    assertEqual(byId(w, id).name, 'Tabelle 3');
  });

  test('eine schon vergebene id wird übersprungen', () => {
    const json = setup().m.toJSON();
    json.sheets[1].id = 'sheet_3';
    const m = WorksheetModel.fromJSON(json);
    assertEqual(m.addSheet(), 'sheet_4');
    assertEqual(m.sheetCounter, 4);
  });

  test('Rückgängig nach addSheet: aktives Blatt wie vorher, der Zähler sinkt nicht', () => {
    const w = setup({ activeSheetId: 's2' });
    w.seen.inverses = null;
    w.m.addSheet();
    const undo = w.seen.inverses;
    collectInverses(w.m, () => { for (const c of [...undo].reverse()) w.m.execute(c); });
    assertDeepEqual(sheetIds(w), ['s1', 's2']);
    assertEqual(w.m.activeSheetId, 's2');
    assertEqual(w.m.sheetCounter, 3);
  });

  test('add → Rückgängig → add vergibt sheet_4, keine id zweimal', () => {
    const w = setup();
    w.seen.inverses = null;
    assertEqual(w.m.addSheet(), 'sheet_3');
    const undo = w.seen.inverses;
    collectInverses(w.m, () => { for (const c of [...undo].reverse()) w.m.execute(c); });
    assertEqual(w.m.addSheet(), 'sheet_4');
  });

  test('Name aus Leerzeichen wird abgelehnt, ein Name getrimmt', () => {
    const w = setup();
    rejects(w, () => w.m.addSheet({ name: '   ' }),
      'empty sheet name for id "sheet_3"; a sheet name must contain a non-space character');
    rejects(w, () => w.m.insertSheetBefore({ id: 's1', name: ' ' }), 'empty sheet name for id "sheet_3"');
    rejects(w, () => w.m.duplicateSheet({ id: 's1', name: '\t' }), 'empty sheet name for id "sheet_3"');
    const id = w.m.addSheet({ name: '  Neu  ' });
    assertEqual(byId(w, id).name, 'Neu');
  });
});

suite('worksheet: renameSheet', () => {
  test('benennt um (getrimmt), Umkehrung', () => {
    const w = setup();
    roundTrip(w, { type: 'renameSheet', id: 's2', name: '  Neu  ' });
    assertEqual(byId(w, 's2').name, 'Neu');
  });

  test('leerer Name wird abgelehnt, wörtlich', () => {
    const w = setup();
    rejects(w, () => w.m.renameSheet({ id: 's1', name: '   ' }),
      'empty sheet name for id "s1"; a sheet name must contain a non-space character');
  });

  test('unbekanntes Blatt: unknown_sheet', () => {
    const w = setup();
    rejects(w, () => w.m.renameSheet({ id: 'weg', name: 'x' }), 'unknown_sheet: weg');
  });

  test('gleicher Name: keine Wirkung, keine Umkehrung', () => {
    const w = setup();
    w.seen.inverses = null;
    const before = w.json();
    w.m.renameSheet({ id: 's1', name: 'Eins' });
    assertEqual(w.seen.inverses?.length ?? 0, 0);
    assertEqual(w.json(), before);
  });

  test('Umkehrung stellt auch einen leeren Altnamen her', () => {
    const json = setup().m.toJSON();
    json.sheets[1].name = '';
    const m = WorksheetModel.fromJSON(json);
    setHistoryMode(m, 'inverse');
    const seen = { inverses: null };
    setCommandObserver(m, (_n, _a, _r, inv) => { if (inv) seen.inverses = inv; });
    m.renameSheet({ id: 's2', name: 'Neu' });
    collectInverses(m, () => { for (const c of [...seen.inverses].reverse()) m.execute(c); });
    assertEqual(m.sheets[1].name, '');
  });
});

suite('worksheet: duplicateSheet', () => {
  test('Kopie am Ende mit Zellen, Formeln und Köpfen, aktiv; Umkehrung', () => {
    const w = setup();
    const { result: id } = roundTrip(w, { type: 'duplicateSheet', id: 's1' });
    assertEqual(id, 'sheet_3');
    assertDeepEqual(sheetIds(w), ['s1', 's2', 'sheet_3']);
    assertEqual(w.m.activeSheetId, 'sheet_3');
    const src = byId(w, 's1');
    const copy = byId(w, id);
    assertEqual(copy.name, 'Eins (Copy)');
    assertDeepEqual(copy.columns, src.columns);
    assertDeepEqual(copy.formulas, src.formulas);
    assertDeepEqual(copy.data.columns, src.data.columns);
    assertTrue(copy.data instanceof TableData);
  });

  test('die Kopie teilt keine Arrays mit der Quelle', () => {
    const w = setup();
    const id = w.m.duplicateSheet({ id: 's1' });
    const src = byId(w, 's1');
    const copy = byId(w, id);
    assert(copy.data !== src.data, 'eigene TableData');
    assert(copy.data.columns[0] !== src.data.columns[0], 'eigene Spalte');
    assert(copy.columns[0] !== src.columns[0], 'eigener Kopf');
    assert(copy.formulas.b !== src.formulas.b, 'eigene Formeln');
  });

  test('name gesetzt: der Name gilt', () => {
    const w = setup();
    const id = w.m.duplicateSheet({ id: 's2', name: 'Zwei (Kopie)' });
    assertEqual(byId(w, id).name, 'Zwei (Kopie)');
  });

  test('unbekanntes Blatt: unknown_sheet', () => {
    const w = setup();
    rejects(w, () => w.m.duplicateSheet({ id: 'weg' }), 'unknown_sheet: weg');
  });
});

suite('worksheet: insertSheetBefore', () => {
  test('leeres Blatt vor dem genannten, aktiv; Umkehrung', () => {
    const w = setup();
    const { result: id } = roundTrip(w, { type: 'insertSheetBefore', id: 's2' });
    assertEqual(id, 'sheet_3');
    assertDeepEqual(sheetIds(w), ['s1', 'sheet_3', 's2']);
    assertEqual(w.m.activeSheetId, 'sheet_3');
    assertEqual(byId(w, id).name, 'Sheet 3');
    assertEqual(byId(w, id).columns.length, START_COLUMN_COUNT);
  });

  test('unbekanntes Blatt: unknown_sheet', () => {
    const w = setup();
    rejects(w, () => w.m.insertSheetBefore({ id: 'weg' }), 'unknown_sheet: weg');
  });
});

suite('worksheet: removeSheet', () => {
  test('entfernt ein inaktives Blatt; Umkehrung stellt es an seiner Stelle her', () => {
    const w = setup();
    const { undo } = roundTrip(w, { type: 'removeSheet', id: 's2' });
    assertDeepEqual(sheetIds(w), ['s1']);
    assertEqual(w.m.activeSheetId, 's1');
    assertEqual(undo.length, 1);
    assertEqual(undo[0].type, 'restoreSheet');
    assertEqual(undo[0].index, 1);
  });

  test('das aktive Blatt: der Nachbar wird aktiv (activeSheetId bleibt gültig)', () => {
    const w = setup({ activeSheetId: 's1' });
    roundTrip(w, { type: 'removeSheet', id: 's1' });
    assertDeepEqual(sheetIds(w), ['s2']);
    assertEqual(w.m.activeSheetId, 's2');
    const v = setup({ activeSheetId: 's2' });
    v.m.removeSheet({ id: 's2' });
    assertEqual(v.m.activeSheetId, 's1');
  });

  test('Umkehrung stellt Zellen, Formeln und Köpfe her', () => {
    const w = setup();
    const before = w.m.toJSON().sheets[0];
    w.seen.inverses = null;
    w.m.removeSheet({ id: 's1' });
    const undo = w.seen.inverses;
    collectInverses(w.m, () => { for (const c of [...undo].reverse()) w.m.execute(c); });
    assertDeepEqual(w.m.toJSON().sheets[0], before);
    assertTrue(byId(w, 's1').data instanceof TableData);
    assertEqual(w.m.activeSheetId, 's1');
  });

  test('das Blatt der Umkehrung ist eine Kopie (JSON), keine lebende Tabelle', () => {
    const w = setup();
    const live = byId(w, 's1').data;
    w.seen.inverses = null;
    w.m.removeSheet({ id: 's1' });
    const [restore] = w.seen.inverses;
    assert(!(restore.sheet.data instanceof TableData), 'schlichte Form');
    assert(restore.sheet.data.columns[0] !== live.columns[0], 'Kopie der Spalte');
  });

  test('entfernt gridView des Blatts; Umkehrung stellt es her', () => {
    const w = setup();
    const view = { colWidths: { i0: 120 }, selection: null };
    w.m.gridView = { s2: view, s1: { colWidths: {}, selection: null } };
    const { undo } = roundTrip(w, { type: 'removeSheet', id: 's2' });
    assertEqual('s2' in w.m.gridView, false);
    assertDeepEqual(undo[0].view, view);
    const v = setup();
    v.m.removeSheet({ id: 's2' });
    assertEqual('view' in v.seen.inverses[0], false, 'ohne Ansicht keine');
  });

  test('Rückgängig nach addSheet entfernt die Ansicht des Blatts', () => {
    const w = setup();
    w.seen.inverses = null;
    const id = w.m.addSheet();
    const undo = w.seen.inverses;
    w.m.gridView = { [id]: { colWidths: {}, selection: null } };
    collectInverses(w.m, () => { for (const c of [...undo].reverse()) w.m.execute(c); });
    assertEqual(id in w.m.gridView, false);
  });

  test('Rückgängig senkt den Zähler nicht (restoreSheet)', () => {
    const w = setup();
    w.m.addSheet();
    w.seen.inverses = null;
    w.m.removeSheet({ id: 'sheet_3' });
    const undo = w.seen.inverses;
    collectInverses(w.m, () => { for (const c of [...undo].reverse()) w.m.execute(c); });
    assertEqual(w.m.sheetCounter, 3);
    assertEqual(w.m.addSheet(), 'sheet_4');
  });

  test('das letzte Blatt: wörtliche Ablehnung', () => {
    const w = setup({ single: true });
    rejects(w, () => w.m.removeSheet({ id: 's1' }),
      'last sheet "s1" cannot be removed; a workbook keeps at least one sheet');
  });

  test('unbekanntes Blatt: unknown_sheet', () => {
    const w = setup();
    rejects(w, () => w.m.removeSheet({ id: 'weg' }), 'unknown_sheet: weg');
  });

  test('markTableChanged genau einmal', () => {
    const w = setup();
    const rev = w.m.$tableRev;
    w.m.removeSheet({ id: 's2' });
    assertEqual(w.m.$tableRev, rev + 1);
  });
});

suite('worksheet: restoreSheet (nur Umkehrung)', () => {
  test('lehnt eine vergebene id und eine falsche Stelle ab', () => {
    const w = setup();
    const sheet = w.m.toJSON().sheets[1];
    rejects(w, () => w.m.restoreSheet({ index: 0, sheet, activeSheetId: 's1' }), 'sheet.id');
    const other = { ...sheet, id: 'neu' };
    rejects(w, () => w.m.restoreSheet({ index: 5, sheet: other, activeSheetId: 's1' }), 'index');
  });

  test('Agentenfläche: Blattkommandos ja, Umkehr-Kommandos nein', () => {
    const { actions } = schemaAgentEntry(WorksheetModel);
    for (const name of ['addSheet', 'renameSheet', 'duplicateSheet', 'insertSheetBefore', 'removeSheet']) {
      assertTrue(Boolean(actions[name]), `${name} fehlt`);
    }
    assertEqual(actions.restoreSheet, undefined);
    assertEqual(actions.dropSheet, undefined);
    assertEqual(actions.restoreSheetName, undefined);
  });
});

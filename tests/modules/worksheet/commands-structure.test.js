/**
 * Arbeitsblatt (Zielform): Kommandos für die Struktur mit Umkehrung
 * (`domain/commands-structure.js`). Jedes Kommando → seine Umkehrung ergibt
 * den Ausgangsstand (`toJSON` gleich), die Wiederholung den Stand danach.
 * Die Ablehnungen sind die der heutigen Agentenaktionen (`worksheet.js`,
 * E2E `worksheet.spec.js`), wörtlich.
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
 * Ein Model mit Blatt `s1` und einem zweiten Blatt `s2`; Verlaufsmodus
 * `inverse`, der Beobachter hält die letzte Umkehrliste.
 * @param {{ heads?: object[], cells?: any[][], formulas?: object, rowCount?: number }} [opts]
 */
function setup({ heads, cells, formulas = {}, rowCount } = {}) {
  const h = heads ?? [col('a', { shortName: 'C1', name: 'A' }), col('b', { shortName: 'C2', name: 'B' }), col('c', { shortName: 'C3' })];
  const rows = rowCount ?? (cells?.[0]?.length ?? 3);
  const data = cells ?? h.map(() => new Array(rows).fill(null));
  const json = {
    _schema: { version: '1.0' },
    sheets: [
      { id: 's1', name: 'Eins', columns: h, formulas, data: { rowCount: rows, columns: data } },
      { id: 's2', name: 'Zwei', columns: [col('i0', { name: 'Alt', shortName: 'C1' })], formulas: {}, data: { rowCount: 2, columns: [[1, 2]] } },
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

/** JSON mit sortierten Objektschlüsseln. @param {any} v @returns {string} */
function canon(v) {
  return JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
}

/**
 * Kommando, dann Rückgängig (Umkehrungen rückwärts), dann Wiederholen.
 * @param {ReturnType<typeof setup>} w @param {object} cmd @returns {any}
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

/** Wirft `fn` mit einer Meldung, die `part` enthält? */
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

const sheet = (w, id = 's1') => w.m.sheets.find((s) => s.id === id);
const values = (w, c, id = 's1') => [...sheet(w, id).data.columns[c]];
const ids = (w) => sheet(w).columns.map((c) => c.id);
const shorts = (w) => sheet(w).columns.map((c) => c.shortName);

/** Drei Spalten, drei Zeilen; Formel in `c` liest `a` über den Namen. */
function filled() {
  return setup({
    cells: [[1, 2, 3], ['x', 'y', 'z'], [null, null, null]],
    heads: [col('a', { shortName: 'C1', name: 'A' }), col('b', { shortName: 'C2', name: 'B', type: 'text', role: 'categorical' }), col('c', { shortName: 'C3' })],
    formulas: { c: { 0: "='A'[1]*10", 2: "='A'[3]+1" } },
  });
}

suite('worksheet: addColumn', () => {
  test('hängt an, liefert die id, Kurznamen C1…C4, Umkehrung', () => {
    const w = setup();
    const id = roundTrip(w, { type: 'addColumn', sheetId: 's1' });
    assertEqual(typeof id, 'string');
    assertDeepEqual(ids(w), ['a', 'b', 'c', id]);
    assertDeepEqual(shorts(w), ['C1', 'C2', 'C3', 'C4']);
    assertDeepEqual(values(w, 3), [null, null, null]);
    const head = sheet(w).columns[3];
    assertEqual(head.type, 'numeric');
    assertEqual(head.name, '');
  });

  test('position 0 setzt die Spalte nach vorn, Kurznamen folgen', () => {
    const w = filled();
    const id = roundTrip(w, { type: 'addColumn', sheetId: 's1', position: 0 });
    assertDeepEqual(ids(w), [id, 'a', 'b', 'c']);
    assertDeepEqual(shorts(w), ['C1', 'C2', 'C3', 'C4']);
    assertDeepEqual(values(w, 1), [1, 2, 3]);
    assertDeepEqual(values(w, 3), [10, null, 4]);
  });

  test('Kurznamen außerhalb der Reihe: Umkehrung stellt sie wörtlich her', () => {
    const w = setup({ heads: [col('a', { shortName: 'X' }), col('b', { shortName: 'C7' })] });
    roundTrip(w, { type: 'addColumn', sheetId: 's1', position: 1 });
    assertDeepEqual(shorts(w), ['C1', 'C2', 'C3']);
  });

  test('markTableChanged genau einmal', () => {
    const w = setup();
    const rev = w.m.$tableRev;
    w.m.addColumn({ sheetId: 's1' });
    assertEqual(w.m.$tableRev, rev + 1);
  });

  test('Ablehnungen: Position außerhalb, unbekanntes Blatt', () => {
    const w = setup();
    rejects(w, () => w.m.addColumn({ sheetId: 's1', position: 99 }), 'invalid position 99; allowed: 0..3');
    rejects(w, () => w.m.addColumn({ sheetId: 's1', position: -1 }), 'allowed: 0..3');
    rejects(w, () => w.m.addColumn({ sheetId: 'weg' }), 'unknown_sheet: weg');
  });
});

suite('worksheet: removeColumn', () => {
  test('entfernt Spalte samt Werten und Formeln, Umkehrung', () => {
    const w = filled();
    roundTrip(w, { type: 'removeColumn', sheetId: 's1', columnId: 'c' });
    assertDeepEqual(ids(w), ['a', 'b']);
    assertEqual(sheet(w).formulas.c, undefined);
  });

  test('erste Spalte: Kurznamen rücken nach, Umkehrung', () => {
    const w = filled();
    roundTrip(w, { type: 'removeColumn', sheetId: 's1', columnId: 'a' });
    assertDeepEqual(ids(w), ['b', 'c']);
    assertDeepEqual(shorts(w), ['C1', 'C2']);
    assertDeepEqual(values(w, 0), ['x', 'y', 'z']);
  });

  test('weiche Sperre erlaubt das Entfernen (wie das Kopfmenü)', () => {
    const w = setup({ heads: [col('a', { shortName: 'C1', meta: { lock: 'soft' } }), col('b', { shortName: 'C2' })] });
    roundTrip(w, { type: 'removeColumn', sheetId: 's1', columnId: 'a' });
    assertDeepEqual(ids(w), ['b']);
  });

  test('harte Sperre wirft, unbekannte Spalte wirft', () => {
    const w = setup({ heads: [col('a', { shortName: 'C1' }), col('b', { shortName: 'C2', meta: { lock: 'hard' } })] });
    rejects(w, () => w.m.removeColumn({ sheetId: 's1', columnId: 'b' }), 'column "b" is locked (hard)');
    rejects(w, () => w.m.removeColumn({ sheetId: 's1', columnId: 'zz' }), 'unknown columnId "zz"; available: a, b');
  });
});

suite('worksheet: renameColumn', () => {
  test('benennt um, Formelbezüge folgen, Umkehrung', () => {
    const w = filled();
    const name = roundTrip(w, { type: 'renameColumn', sheetId: 's1', columnId: 'a', name: 'Länge' });
    assertEqual(name, 'Länge');
    assertEqual(sheet(w).columns[0].name, 'Länge');
    assertDeepEqual(sheet(w).formulas.c, { 0: "='Länge'[1]*10", 2: "='Länge'[3]+1" });
    assertDeepEqual(values(w, 2), [10, null, 4]);
  });

  test('Namensgleichheit bekommt einen Zusatz', () => {
    const w = filled();
    assertEqual(roundTrip(w, { type: 'renameColumn', sheetId: 's1', columnId: 'b', name: 'A' }), 'A (2)');
  });

  test('"" löscht den Namen; Formeln nennen dann den Kurznamen', () => {
    const w = filled();
    assertEqual(roundTrip(w, { type: 'renameColumn', sheetId: 's1', columnId: 'a', name: '' }), '');
    assertDeepEqual(sheet(w).formulas.c, { 0: '=C1[1]*10', 2: '=C1[3]+1' });
    assertDeepEqual(values(w, 2), [10, null, 4]);
  });

  test('Ablehnungen: jede Sperre, kein Text, unbekannte Spalte', () => {
    const w = setup({ heads: [col('a', { shortName: 'C1', meta: { lock: 'soft' } }), col('b', { shortName: 'C2' })] });
    rejects(w, () => w.m.renameColumn({ sheetId: 's1', columnId: 'a', name: 'X' }), 'column "a" is locked (soft)');
    rejects(w, () => w.m.renameColumn({ sheetId: 's1', columnId: 'b', name: 42 }), 'allowed: any string');
    rejects(w, () => w.m.renameColumn({ sheetId: 's1', columnId: 'q', name: 'X' }), 'unknown columnId "q"; available: a, b');
  });
});

suite('worksheet: moveColumn', () => {
  test('verschiebt wie das Ziehen, Kurznamen folgen, Umkehrung', () => {
    const w = filled();
    assertEqual(roundTrip(w, { type: 'moveColumn', sheetId: 's1', columnId: 'c', toIndex: 0 }), true);
    assertDeepEqual(ids(w), ['c', 'a', 'b']);
    assertDeepEqual(shorts(w), ['C1', 'C2', 'C3']);
    assertDeepEqual(values(w, 1), [1, 2, 3]);
  });

  test('schon an der Stelle: false, nichts geändert', () => {
    const w = filled();
    const before = w.json();
    assertEqual(w.m.moveColumn({ sheetId: 's1', columnId: 'b', toIndex: 1 }), false);
    assertEqual(w.json(), before);
  });

  test('Kurznamen außerhalb der Reihe: Umkehrung stellt sie her', () => {
    const w = setup({ heads: [col('a', { shortName: 'P' }), col('b', { shortName: 'Q' })] });
    roundTrip(w, { type: 'moveColumn', sheetId: 's1', columnId: 'a', toIndex: 1 });
    assertDeepEqual(shorts(w), ['C1', 'C2']);
  });

  test('Ablehnungen: Ziel außerhalb, unbekannte Spalte', () => {
    const w = setup({ heads: [col('a', { shortName: 'C1' }), col('b', { shortName: 'C2' })] });
    rejects(w, () => w.m.moveColumn({ sheetId: 's1', columnId: 'a', toIndex: 2 }), 'invalid toIndex 2; allowed: 0..1');
    rejects(w, () => w.m.moveColumn({ sheetId: 's1', columnId: 'x', toIndex: 0 }), 'unknown columnId "x"; available: a, b');
  });
});

suite('worksheet: setColumnMeta', () => {
  test('setzt das ganze Merkmal, null entfernt es, Umkehrung', () => {
    const w = filled();
    roundTrip(w, { type: 'setColumnMeta', sheetId: 's1', columnId: 'a', meta: { lock: 'hard', reason: 'run-order', managedBy: 'doe-planner' } });
    assertDeepEqual(sheet(w).columns[0].meta, { lock: 'hard', reason: 'run-order', managedBy: 'doe-planner' });
    roundTrip(w, { type: 'setColumnMeta', sheetId: 's1', columnId: 'a', meta: null });
    assertEqual(sheet(w).columns[0].meta, null);
  });

  test('auch auf gesperrten Spalten (Sperre aufheben und wieder setzen)', () => {
    const w = setup({ heads: [col('a', { shortName: 'C1', meta: { lock: 'hard', reason: 'run-order' } })] });
    roundTrip(w, { type: 'setColumnMeta', sheetId: 's1', columnId: 'a', meta: { reason: 'run-order' } });
    assertDeepEqual(sheet(w).columns[0].meta, { reason: 'run-order' });
  });

  test('streng: null-Wert, fremder Schlüssel, falsche Sperre, unbekannte Spalte', () => {
    const w = filled();
    rejects(w, () => w.m.setColumnMeta({ sheetId: 's1', columnId: 'a', meta: { reason: null } }), 'meta.reason must be a string');
    rejects(w, () => w.m.setColumnMeta({ sheetId: 's1', columnId: 'a', meta: { farbe: 'rot' } }), 'unknown meta key "farbe"; allowed: lock, reason, managedBy, managedRef, categoricalCoding');
    rejects(w, () => w.m.setColumnMeta({ sheetId: 's1', columnId: 'a', meta: { lock: 'fest' } }), "meta.lock must be 'hard' or 'soft'");
    rejects(w, () => w.m.setColumnMeta({ sheetId: 's1', columnId: 'gibt-es-nicht', meta: { lock: 'soft' } }), 'unknown columnId "gibt-es-nicht"');
  });
});

suite('worksheet: setColumnRole', () => {
  test('setzt eine Rolle von Hand, Umkehrung', () => {
    const w = filled();
    roundTrip(w, { type: 'setColumnRole', sheetId: 's1', columnId: 'a', role: 'identifier' });
    const head = sheet(w).columns[0];
    assertDeepEqual([head.role, head.roleManual], ['identifier', true]);
  });

  test('dieselbe Rolle bestätigt sie', () => {
    const w = filled();
    roundTrip(w, { type: 'setColumnRole', sheetId: 's1', columnId: 'a', role: 'continuous' });
    assertEqual(sheet(w).columns[0].roleManual, true);
  });

  test('Ablehnungen: unbekannte Rolle, Rolle passt nicht zum Typ, Sperre', () => {
    const w = setup({ heads: [col('a', { shortName: 'C1' }), col('b', { shortName: 'C2', meta: { lock: 'soft' } })] });
    rejects(w, () => w.m.setColumnRole({ sheetId: 's1', columnId: 'a', role: 'stetig' }),
      'allowed: continuous, categorical, ordinal, date, identifier, freeText');
    rejects(w, () => w.m.setColumnRole({ sheetId: 's1', columnId: 'a', role: 'date' }),
      'invalid role "date" for column type "numeric"; allowed: continuous, categorical, ordinal, identifier');
    rejects(w, () => w.m.setColumnRole({ sheetId: 's1', columnId: 'b', role: 'identifier' }), 'column "b" is locked (soft)');
  });
});

suite('worksheet: setColumnType', () => {
  test('Zahl → Text wandelt um, unpassende Handrolle wird neu geschätzt, Umkehrung', () => {
    const w = setup({
      heads: [col('a', { shortName: 'C1', role: 'continuous', roleManual: true }), col('b', { shortName: 'C2' })],
      cells: [[1, 3], [2, 4]],
    });
    assertEqual(roundTrip(w, { type: 'setColumnType', sheetId: 's1', columnId: 'a', columnType: 'text' }), true);
    const head = sheet(w).columns[0];
    assertDeepEqual([head.type, head.role, head.roleManual], ['text', 'freeText', false]);
    assertDeepEqual(values(w, 0), ['1', '3']);
    assertEqual(w.m.setColumnType({ sheetId: 's1', columnId: 'a', columnType: 'text' }), false);
  });

  test('Währung bringt zwei, Prozent eine Nachkommastelle', () => {
    const w = setup({ heads: [col('a', { shortName: 'C1' }), col('b', { shortName: 'C2' })], cells: [[1, 3], [2, 4]] });
    roundTrip(w, { type: 'setColumnType', sheetId: 's1', columnId: 'a', columnType: 'currency' });
    assertDeepEqual(sheet(w).columns[0].format, { decimals: 2 });
    roundTrip(w, { type: 'setColumnType', sheetId: 's1', columnId: 'b', columnType: 'percent' });
    assertDeepEqual(sheet(w).columns[1].format, { decimals: 1 });
  });

  test('Text → Zahl: was keine Zahl ist, wird leer; Umkehrung bringt den Text zurück', () => {
    const w = setup({ heads: [col('a', { shortName: 'C1', type: 'text', role: 'categorical' })], cells: [['1,5', 'abc', null]] });
    roundTrip(w, { type: 'setColumnType', sheetId: 's1', columnId: 'a', columnType: 'numeric' });
    assertDeepEqual(values(w, 0), [1.5, null, null]);
  });

  test('Ablehnungen: unbekannter Typ, Sperre', () => {
    const w = setup({ heads: [col('a', { shortName: 'C1' }), col('b', { shortName: 'C2', meta: { lock: 'soft' } })] });
    rejects(w, () => w.m.setColumnType({ sheetId: 's1', columnId: 'a', columnType: 'zahl' }),
      'invalid columnType "zahl"; allowed: numeric, text, date, time, currency, percent, binary');
    rejects(w, () => w.m.setColumnType({ sheetId: 's1', columnId: 'b', columnType: 'text' }), 'column "b" is locked (soft)');
  });
});

suite('worksheet: setColumnFormat', () => {
  test('setzt Nachkommastellen; null stellt die Vorgabe her; Umkehrung', () => {
    const w = filled();
    roundTrip(w, { type: 'setColumnFormat', sheetId: 's1', columnId: 'a', key: 'decimals', value: 2 });
    assertDeepEqual(sheet(w).columns[0].format, { decimals: 2 });
    roundTrip(w, { type: 'setColumnFormat', sheetId: 's1', columnId: 'a', key: 'decimals', value: null });
    assertDeepEqual(sheet(w).columns[0].format, {});
  });

  test('Datumsformat auf einer Datumsspalte', () => {
    const w = setup({ heads: [col('a', { shortName: 'C1', type: 'date', role: 'date' })] });
    roundTrip(w, { type: 'setColumnFormat', sheetId: 's1', columnId: 'a', key: 'dateFormat', value: 'yyyy-MM-dd' });
    assertDeepEqual(sheet(w).columns[0].format, { dateFormat: 'yyyy-MM-dd' });
  });

  test('Ablehnungen wörtlich', () => {
    const w = setup({
      heads: [col('a', { shortName: 'C1' }), col('b', { shortName: 'C2', type: 'text', role: 'categorical' }),
        col('d', { shortName: 'C3', type: 'date', role: 'date' }), col('e', { shortName: 'C4', meta: { lock: 'soft' } })],
    });
    rejects(w, () => w.m.setColumnFormat({ sheetId: 's1', columnId: 'a', key: 'farbe', value: 'rot' }),
      'invalid key "farbe"; allowed: decimals, dateFormat, timeFormat');
    rejects(w, () => w.m.setColumnFormat({ sheetId: 's1', columnId: 'a', key: 'dateFormat', value: 'yyyy-MM-dd' }),
      'invalid key "dateFormat" for column type "numeric"; allowed: decimals');
    rejects(w, () => w.m.setColumnFormat({ sheetId: 's1', columnId: 'a', key: 'decimals', value: 7 }),
      'invalid value 7; allowed: a whole number from 0 to 6');
    rejects(w, () => w.m.setColumnFormat({ sheetId: 's1', columnId: 'd', key: 'dateFormat', value: 'dd-MM' }),
      'invalid value "dd-MM"; allowed: dd.MM.yyyy, yyyy-MM-dd, dd/MM/yyyy, MM/dd/yyyy, d. MMMM yyyy');
    rejects(w, () => w.m.setColumnFormat({ sheetId: 's1', columnId: 'b', key: 'decimals', value: 1 }),
      'invalid key "decimals" for column type "text"; allowed: none, this column type has no format');
    rejects(w, () => w.m.setColumnFormat({ sheetId: 's1', columnId: 'e', key: 'decimals', value: 1 }), 'column "e" is locked (soft)');
  });
});

suite('worksheet: addRows', () => {
  test('fügt an einer Position ein, Formelzeilen rücken mit, Umkehrung', () => {
    const w = filled();
    roundTrip(w, { type: 'addRows', sheetId: 's1', count: 2, position: 0 });
    assertEqual(sheet(w).data.rowCount, 5);
    assertDeepEqual(values(w, 0), [null, null, 1, 2, 3]);
    assertDeepEqual(sheet(w).formulas.c, { 2: "='A'[1]*10", 4: "='A'[3]+1" });
  });

  test('ohne Angaben: zehn Zeilen am Ende', () => {
    const w = filled();
    roundTrip(w, { type: 'addRows', sheetId: 's1' });
    assertEqual(sheet(w).data.rowCount, 13);
    assertDeepEqual(values(w, 0).slice(0, 4), [1, 2, 3, null]);
  });

  test('Ablehnungen: count und position', () => {
    const w = filled();
    rejects(w, () => w.m.addRows({ sheetId: 's1', count: -1 }), 'allowed: a whole number of at least 1');
    rejects(w, () => w.m.addRows({ sheetId: 's1', count: 2.5 }), 'allowed: a whole number of at least 1');
    rejects(w, () => w.m.addRows({ sheetId: 's1', count: 1, position: 99 }), 'invalid position 99; allowed: 0..3');
  });
});

suite('worksheet: removeRows', () => {
  test('entfernt einen Bereich samt Formeln, liefert die Zahl, Umkehrung', () => {
    const w = filled();
    assertEqual(roundTrip(w, { type: 'removeRows', sheetId: 's1', startRow: 0, count: 2 }), 2);
    assertDeepEqual(values(w, 0), [3]);
    assertDeepEqual(sheet(w).formulas.c, { 0: "='A'[3]+1" });
  });

  test('Ablehnungen wörtlich', () => {
    const w = filled();
    rejects(w, () => w.m.removeRows({ sheetId: 's1', startRow: 3, count: 1 }), 'allowed: 0..2');
    rejects(w, () => w.m.removeRows({ sheetId: 's1', startRow: 1, count: 5 }), 'allowed: a whole number from 1 to 2');
    rejects(w, () => w.m.removeRows({ sheetId: 's1', startRow: 0, count: 0 }), 'allowed: a whole number from 1 to 3');
  });
});

suite('worksheet: moveRow', () => {
  test('verschiebt eine Zeile samt Formel, Zielindex = Endposition, Umkehrung', () => {
    const w = filled();
    assertEqual(roundTrip(w, { type: 'moveRow', sheetId: 's1', fromRow: 0, toRow: 2 }), true);
    assertDeepEqual(values(w, 0), [2, 3, 1]);
    assertDeepEqual(values(w, 1), ['y', 'z', 'x']);
    assertDeepEqual(sheet(w).formulas.c, { 2: "='A'[1]*10", 1: "='A'[3]+1" });
  });

  test('gleiche Zeile: false, nichts geändert', () => {
    const w = filled();
    const before = w.json();
    assertEqual(w.m.moveRow({ sheetId: 's1', fromRow: 1, toRow: 1 }), false);
    assertEqual(w.json(), before);
  });

  test('Ablehnung: Ziel außerhalb', () => {
    const w = filled();
    rejects(w, () => w.m.moveRow({ sheetId: 's1', fromRow: 0, toRow: 3 }), 'invalid toRow 3; allowed: 0..2');
    rejects(w, () => w.m.moveRow({ sheetId: 's1', fromRow: 5, toRow: 0 }), 'invalid fromRow 5; allowed: 0..2');
  });
});

suite('worksheet: sortRows', () => {
  test('sortiert absolut, Formeln wandern mit, Umkehrung', () => {
    const w = setup({
      heads: [col('x', { shortName: 'C1', name: 'X' }), col('y', { shortName: 'C2', type: 'text', role: 'categorical' }), col('z', { shortName: 'C3' })],
      cells: [[3, 1, null, 2], ['c', 'a', 'n', 'b'], [null, null, null, null]],
      formulas: { z: { 0: '=1' } },
    });
    assertEqual(roundTrip(w, { type: 'sortRows', sheetId: 's1', columnId: 'x', direction: 'desc' }), true);
    assertDeepEqual(values(w, 0), [3, 2, 1, null]);
    assertDeepEqual(values(w, 1), ['c', 'b', 'a', 'n']);
    assertDeepEqual(sheet(w).formulas.z, { 0: '=1' });
    const before = w.json();
    assertEqual(w.m.sortRows({ sheetId: 's1', columnId: 'x', direction: 'desc' }), false);
    assertEqual(w.json(), before);
    roundTrip(w, { type: 'sortRows', sheetId: 's1', columnId: 'y', direction: 'asc' });
    assertDeepEqual(values(w, 1), ['a', 'b', 'c', 'n']);
    assertDeepEqual(sheet(w).formulas.z, { 2: '=1' });
  });

  test('Ablehnungen: Richtung, unbekannte Spalte', () => {
    const w = filled();
    rejects(w, () => w.m.sortRows({ sheetId: 's1', columnId: 'a', direction: 'up' }), 'allowed: asc, desc');
    rejects(w, () => w.m.sortRows({ sheetId: 's1', columnId: 'nicht-existent', direction: 'asc' }), 'available: a, b, c');
  });

  test('100 000 Zeilen in unter 200 ms', () => {
    const n = 100000;
    const a = Array.from({ length: n }, (_, i) => ((i * 7919) % n) / 10);
    const b = Array.from({ length: n }, (_, i) => i);
    const w = setup({ heads: [col('a', { shortName: 'C1' }), col('b', { shortName: 'C2' })], cells: [a, b] });
    const t0 = performance.now();
    assertEqual(w.m.sortRows({ sheetId: 's1', columnId: 'a', direction: 'asc' }), true);
    const ms = performance.now() - t0;
    assertTrue(ms < 200, `sortRows dauerte ${ms.toFixed(1)} ms`);
    assertEqual(sheet(w).data.columns[0][0], 0);
  });
});

suite('worksheet: Umkehr-Kommandos', () => {
  test('applyRowPermutation prüft die Permutation', () => {
    const w = filled();
    rejects(w, () => w.m.applyRowPermutation({ sheetId: 's1', perm: [0, 0, 1] }), 'allowed: a permutation of 0..2');
    rejects(w, () => w.m.applyRowPermutation({ sheetId: 's1', perm: [0, 1] }), 'allowed: a permutation of 0..2');
  });

  test('Agentenfläche: Strukturkommandos ja, Umkehr-Kommandos nein', () => {
    const { actions } = schemaAgentEntry(WorksheetModel);
    for (const name of ['addColumn', 'removeColumn', 'renameColumn', 'moveColumn', 'setColumnMeta', 'setColumnRole',
      'setColumnType', 'setColumnFormat', 'addRows', 'removeRows', 'moveRow', 'sortRows']) {
      assertTrue(Boolean(actions[name]), `${name} fehlt`);
    }
    assertEqual(actions.applyRowPermutation, undefined);
    assertEqual(actions.restoreColumn, undefined);
    assertEqual(actions.restoreRows, undefined);
  });
});

/**
 * Tests for core/zeg-sheet/zeg-sheet-model.js
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import {
  historyToRows, rowsToHistory, readRows, buildSheetState, isZegColumn, DATE_REF, planZegStack,
} from '../../js/core/zeg-sheet/zeg-sheet-model.js';
import { WorksheetModel } from '../../js/modules/worksheet/domain/model.js';
import { readWorksheetStored } from '../../js/modules/worksheet/domain/read.js';
import { fakeKernelSurface } from '../helpers/kernel-surface.js';

const ofMethodOf = (stack, m) => stack.filter(a => a.method === m);

const DMAIC = ['define', 'measure', 'analyze', 'improve', 'control'];
const DMADV = ['define', 'measure', 'analyze', 'design', 'verify'];
const at = (y, m, d, h = 9) => new Date(y, m - 1, d, h).getTime();
const noon = (y, m, d) => new Date(y, m - 1, d, 12).getTime();
const LABELS = {
  date: 'Datum',
  phases: { define: 'Define', measure: 'Measure', analyze: 'Analyze', improve: 'Improve', control: 'Control', design: 'Design', verify: 'Verify' },
};

suite('core/zeg-sheet-model historyToRows', () => {
  test('one row per day, last entry of a day wins, sorted by date', () => {
    const history = {
      define: [{ t: at(2026, 7, 10, 9), v: 40 }, { t: at(2026, 7, 10, 15), v: 90 }],
      measure: [{ t: at(2026, 7, 9), v: 55 }],
    };
    assertDeepEqual(historyToRows(history, DMAIC), [
      { date: '2026-07-09', values: { define: null, measure: 55, analyze: null, improve: null, control: null } },
      { date: '2026-07-10', values: { define: 90, measure: null, analyze: null, improve: null, control: null } },
    ]);
  });

  test('uses only the given phases (DMADV)', () => {
    const history = { design: [{ t: at(2026, 7, 1), v: 10 }], control: [{ t: at(2026, 7, 1), v: 99 }] };
    const rows = historyToRows(history, DMADV);
    assertEqual(rows.length, 1);
    assertDeepEqual(Object.keys(rows[0].values), DMADV);
    assertEqual(rows[0].values.design, 10);
  });

  test('empty history gives no rows', () => {
    assertDeepEqual(historyToRows({}, DMAIC), []);
    assertDeepEqual(historyToRows(undefined, DMAIC), []);
  });
});

suite('core/zeg-sheet-model rowsToHistory', () => {
  const row = (date, values) => ({ date, values });

  test('unchanged day keeps all its entries (several pencil edits)', () => {
    const old = { define: [{ t: at(2026, 7, 10, 9), v: 40 }, { t: at(2026, 7, 10, 15), v: 90 }] };
    const next = rowsToHistory([row('2026-07-10', { define: 90 })], DMAIC, old, ['define']);
    assertDeepEqual(next.define, old.define);
  });

  test('changed value keeps the timestamp of the day\'s last entry', () => {
    const old = { define: [{ t: at(2026, 7, 10, 9), v: 40 }, { t: at(2026, 7, 10, 15), v: 90 }] };
    const next = rowsToHistory([row('2026-07-10', { define: 70 })], DMAIC, old, ['define']);
    assertDeepEqual(next.define, [{ t: at(2026, 7, 10, 15), v: 70 }]);
  });

  test('new day gets 12:00 local time', () => {
    const next = rowsToHistory([row('2026-07-11', { define: 30 })], DMAIC, {}, ['define']);
    assertDeepEqual(next.define, [{ t: noon(2026, 7, 11), v: 30 }]);
  });

  test('cleared cell drops the day (accidental 0 entry removed)', () => {
    const old = { define: [{ t: at(2026, 7, 10), v: 90 }, { t: at(2026, 12, 10), v: 0 }] };
    const next = rowsToHistory(
      [row('2026-07-10', { define: 90 }), row('2026-12-10', { define: null })], DMAIC, old, ['define'],
    );
    assertDeepEqual(next.define, [{ t: at(2026, 7, 10), v: 90 }]);
  });

  test('rows without a valid date are ignored', () => {
    const next = rowsToHistory([row(null, { define: 5 }), row('abc', { define: 6 })], DMAIC, {}, ['define']);
    assertEqual(next.define, undefined);
  });

  test('values are clamped to 0..100 and rounded', () => {
    const next = rowsToHistory([row('2026-07-01', { define: 140 }), row('2026-07-02', { define: -3 }), row('2026-07-03', { define: 33.6 })], DMAIC, {}, ['define']);
    assertDeepEqual(next.define.map(e => e.v), [100, 0, 34]);
  });

  test('numeric strings parse, other text is skipped', () => {
    const next = rowsToHistory([row('2026-07-01', { define: '45 %' }), row('2026-07-02', { define: '55,5' }), row('2026-07-03', { define: 'viel' })], DMAIC, {}, ['define']);
    assertDeepEqual(next.define.map(e => e.v), [45, 56]);
  });

  test('several rows with the same date: last row wins', () => {
    const next = rowsToHistory([row('2026-07-01', { define: 10 }), row('2026-07-01', { define: 20 })], DMAIC, {}, ['define']);
    assertDeepEqual(next.define, [{ t: noon(2026, 7, 1), v: 20 }]);
  });

  test('phase whose column is missing keeps its old history', () => {
    const old = { measure: [{ t: at(2026, 7, 1), v: 50 }] };
    const next = rowsToHistory([row('2026-07-01', { define: 10 })], DMAIC, old, ['define']);
    assertDeepEqual(next.measure, old.measure);
  });

  test('foreign phases (not in the cycle) are kept', () => {
    const old = { control: [{ t: at(2026, 7, 1), v: 50 }] };
    const next = rowsToHistory([], DMADV, old, DMADV);
    assertDeepEqual(next.control, old.control);
  });

  test('entries are sorted by time', () => {
    const next = rowsToHistory([row('2026-07-05', { define: 2 }), row('2026-07-01', { define: 1 })], DMAIC, {}, ['define']);
    assertDeepEqual(next.define.map(e => e.v), [1, 2]);
  });

  test('round trip history → rows → history is identity', () => {
    const old = {
      define: [{ t: at(2026, 7, 10, 9), v: 40 }, { t: at(2026, 7, 10, 15), v: 90 }, { t: at(2026, 8, 1), v: 95 }],
      measure: [{ t: at(2026, 7, 10), v: 55 }],
    };
    const next = rowsToHistory(historyToRows(old, DMAIC), DMAIC, old, DMAIC);
    assertDeepEqual(next.define, old.define);
    assertDeepEqual(next.measure, old.measure);
    assertEqual(next.analyze, undefined);
  });
});

suite('core/zeg-sheet-model sheet state', () => {
  test('buildSheetState: date column + one percent column per phase, marked', () => {
    const rows = [{ date: '2026-07-10', values: { define: 90, measure: null } }];
    const st = buildSheetState(null, rows, ['define', 'measure'], LABELS);
    assertEqual(st.rowCount, 1);
    assertDeepEqual(st.columns.map(c => c.name), ['Datum', 'Define', 'Measure']);
    assertDeepEqual(st.columns.map(c => c.type), ['date', 'percent', 'percent']);
    assertDeepEqual(st.columns.map(c => c.meta.managedRef), [DATE_REF, 'define', 'measure']);
    assertTrue(st.columns.every(isZegColumn));
    assertTrue(st.columns.every(c => !('lock' in c.meta)));
    assertDeepEqual(st.columns[1].values, [90]);
    assertDeepEqual(st.columns.map(c => c.shortName), ['C1', 'C2', 'C3']);
  });

  test('buildSheetState with no rows seeds one row with today', () => {
    const st = buildSheetState(null, [], ['define'], LABELS);
    assertEqual(st.rowCount, 1);
    assertTrue(/^\d{4}-\d{2}-\d{2}$/.test(st.columns[0].values[0]));
    assertEqual(st.columns[1].values[0], null);
  });

  test('rebuild keeps column ids/names and user columns, drops stale phase columns', () => {
    const first = buildSheetState(null, [{ date: '2026-07-10', values: { define: 1, control: 2 } }], ['define', 'control'], LABELS);
    first.columns[1].name = 'Mein Define';
    first.columns.push({ id: 'note', name: 'Notiz', shortName: 'C4', type: 'text', values: ['a', 'b', 'c'], formulas: null, format: {}, meta: null });
    const next = buildSheetState(first, [{ date: '2026-07-10', values: { define: 5, design: 7 } }], ['define', 'design'], LABELS);
    assertEqual(next.columns[1].id, first.columns[1].id);
    assertEqual(next.columns[1].name, 'Mein Define');
    assertDeepEqual(next.columns.map(c => c.meta?.managedRef ?? c.id), [DATE_REF, 'define', 'design', 'note']);
    assertEqual(next.rowCount, 3);
    assertDeepEqual(next.columns[3].values, ['a', 'b', 'c']);
    assertDeepEqual(next.columns[1].values, [5, null, null]);
  });

  test('readRows reads managed columns; no date column means nothing present', () => {
    const st = buildSheetState(null, [{ date: '2026-07-10', values: { define: 90 } }], ['define'], LABELS);
    assertDeepEqual(readRows(st), { rows: [{ date: '2026-07-10', values: { define: 90 } }], presentPhases: ['define'] });
    const noDate = { ...st, columns: st.columns.filter(c => c.meta.managedRef !== DATE_REF) };
    assertDeepEqual(readRows(noDate), { rows: [], presentPhases: [] });
    assertDeepEqual(readRows(null), { rows: [], presentPhases: [] });
  });

  test('readRows: emptied date column with phase values means nothing present', () => {
    const st = buildSheetState(null, [
      { date: '2026-07-10', values: { define: 20 } },
      { date: '2026-07-12', values: { define: 40 } },
    ], ['define'], LABELS);
    st.columns[0].values = [null, ''];
    assertDeepEqual(readRows(st).presentPhases, []);
    const history = { define: [{ t: at(2026, 7, 10), v: 20 }, { t: at(2026, 7, 12), v: 40 }] };
    const { rows, presentPhases } = readRows(st);
    assertDeepEqual(rowsToHistory(rows, ['define'], history, presentPhases), history);
  });

  test('rebuild keeps user column values with their date, not their row position', () => {
    const first = buildSheetState(null, [
      { date: '2026-07-10', values: { define: 20 } },
      { date: '2026-07-12', values: { define: 40 } },
    ], ['define'], LABELS);
    first.columns.push({ id: 'note', name: 'Notiz', shortName: 'C3', type: 'text', values: ['Kickoff', 'Review'], formulas: null, format: {}, meta: null });
    // 07-10 was removed; a pencil edit added today's row
    const next = buildSheetState(first, [
      { date: '2026-07-12', values: { define: 40 } },
      { date: '2026-10-12', values: { define: 60 } },
    ], ['define'], LABELS);
    assertDeepEqual(next.columns[0].values.slice(0, 2), ['2026-07-12', '2026-10-12']);
    assertEqual(next.columns[2].values[0], 'Review');
    assertEqual(next.columns[2].values[1], null);
    // the orphaned note is kept, after the dated rows
    assertEqual(next.columns[2].values[2], 'Kickoff');
    assertEqual(next.columns[0].values[2], null);
  });
});

suite('core/zeg-sheet-model review minors', () => {
  test('unchanged day with a non-integer value keeps all its entries', () => {
    const history = { define: [{ t: at(2026, 7, 10, 9), v: 10 }, { t: at(2026, 7, 10, 11), v: 33.6 }] };
    const rows = historyToRows(history, ['define']);
    assertDeepEqual(rowsToHistory(rows, ['define'], history), history);
  });

  test('rebuild keeps typed rows without a valid date, with their values', () => {
    const first = buildSheetState(null, [{ date: '2026-07-10', values: { define: 20 } }], ['define'], LABELS);
    first.columns[0].values.push('gestern');
    first.columns[1].values.push(50);
    first.rowCount = 2;
    const next = buildSheetState(first, [
      { date: '2026-07-10', values: { define: 20 } },
      { date: '2026-10-12', values: { define: 60 } },
    ], ['define'], LABELS);
    assertDeepEqual(next.columns[0].values, ['2026-07-10', '2026-10-12', 'gestern']);
    assertDeepEqual(next.columns[1].values, [20, 60, 50]);
  });
});

suite('core/zeg-sheet-model malformed history entries', () => {
  test('entries without a numeric t are not shown and survive a sync', () => {
    const history = { define: [{ ts: 123, value: 50 }, { t: at(2026, 7, 10), v: 20 }] };
    const rows = historyToRows(history, ['define']);
    assertDeepEqual(rows, [{ date: '2026-07-10', values: { define: 20 } }]);
    const back = rowsToHistory(rows, ['define'], history);
    assertDeepEqual(back.define, [{ ts: 123, value: 50 }, { t: at(2026, 7, 10), v: 20 }]);
  });
});

suite('core/zeg-sheet-model planZegStack', () => {
  const SHEET = 's1';
  const D1 = { date: '2026-07-10', values: { define: 20, measure: 10 } };
  const D2 = { date: '2026-07-12', values: { define: 40, measure: null } };
  const D3 = { date: '2026-07-14', values: { define: 60, measure: 30 } };
  /** Die Aktionen eines Stapels als `[method, args]`. */
  const calls = (stack) => stack.map(a => [a.method, a.args]);
  const ofMethod = (stack, m) => stack.filter(a => a.method === m);

  test('Gleichstand gibt einen leeren Stapel', () => {
    const prev = buildSheetState(null, [D1, D2], ['define', 'measure'], LABELS);
    const next = buildSheetState(prev, [D1, D2], ['define', 'measure'], LABELS);
    assertDeepEqual(planZegStack('ws1', SHEET, prev, next), []);
  });

  test('Gleichstand trotz Merkmal-Nullwerten aus read() und fehlender formulas', () => {
    const prev = buildSheetState(null, [D1], ['define'], LABELS);
    const next = buildSheetState(prev, [D1], ['define'], LABELS);
    const asRead = { ...prev, columns: prev.columns.map(c => ({ ...c, meta: { ...c.meta, lock: null, reason: null }, formulas: undefined })) };
    assertDeepEqual(planZegStack('ws1', SHEET, asRead, next), []);
  });

  test('neuer Tag: ein writeColumns mit den verlängerten Werten, kein removeRows', () => {
    const prev = buildSheetState(null, [D1, D2], ['define', 'measure'], LABELS);
    const next = buildSheetState(prev, [D1, D2, D3], ['define', 'measure'], LABELS);
    const stack = planZegStack('ws1', SHEET, prev, next);
    assertEqual(stack.length, 1);
    const [w] = stack;
    assertEqual(w.op, 'instance.call');
    assertEqual(w.id, 'write');
    assertEqual(w.instance, 'ws1');
    assertEqual(w.module, 'worksheet');
    assertEqual(w.method, 'writeColumns');
    assertEqual(w.args[0].sheetId, SHEET);
    assertDeepEqual(w.args[0].columns, [
      { to: prev.columns[0].id, values: ['2026-07-10', '2026-07-12', '2026-07-14'] },
      { to: prev.columns[1].id, values: [20, 40, 60] },
      { to: prev.columns[2].id, values: [10, null, 30] },
    ]);
    assertEqual(ofMethod(stack, 'removeRows').length, 0);
  });

  test('neue Phase: to append samt setColumnMeta mit Referenz auf das Schreiben', () => {
    const prev = buildSheetState(null, [D1], ['define', 'measure'], LABELS);
    const next = buildSheetState(prev, [D1], ['define', 'measure', 'analyze'], LABELS);
    const stack = planZegStack('ws1', SHEET, prev, next);
    assertDeepEqual(stack[0].args[0].columns[3], { to: 'append', name: 'Analyze', type: 'percent', format: { decimals: 0 }, values: [null] });
    assertDeepEqual(calls(stack.slice(1)), [
      ['setColumnMeta', [{ sheetId: SHEET, columnId: { $from: 'write', path: 'value.3' }, meta: { managedBy: 'zeg', managedRef: 'analyze' } }]],
    ]);
  });

  test('neue Phase vor einer Nutzerspalte: moveColumn mit Referenz an ihren Platz', () => {
    const prev = buildSheetState(null, [D1], ['define'], LABELS);
    prev.columns.push({ id: 'note', name: 'Notiz', type: 'text', values: ['x'], formulas: [null], format: {}, meta: null });
    const next = buildSheetState(prev, [D1], ['define', 'measure'], LABELS);
    const stack = planZegStack('ws1', SHEET, prev, next);
    // Nutzerspalten werden nicht geschrieben (R18), sie wandern mit ihren Zeilen.
    assertDeepEqual(stack[0].args[0].columns.map(e => e.to), [prev.columns[0].id, prev.columns[1].id, 'append']);
    assertDeepEqual(calls(ofMethod(stack, 'moveColumn')), [
      ['moveColumn', [{ sheetId: SHEET, columnId: { $from: 'write', path: 'value.2' }, toIndex: 2 }]],
    ]);
  });

  test('weggefallene Phase: removeColumn', () => {
    const prev = buildSheetState(null, [D1], ['define', 'measure', 'analyze'], LABELS);
    const next = buildSheetState(prev, [D1], ['define', 'measure'], LABELS);
    const stack = planZegStack('ws1', SHEET, prev, next);
    assertDeepEqual(calls(ofMethod(stack, 'removeColumn')), [['removeColumn', [{ sheetId: SHEET, columnId: prev.columns[3].id }]]]);
    assertEqual(ofMethod(stack, 'moveColumn').length, 0);
    assertEqual(stack[0].args[0].columns.length, 3);
  });

  test('weniger Zeilen: removeRows ab next.rowCount', () => {
    const prev = buildSheetState(null, [D1, D2, D3], ['define'], LABELS);
    const next = buildSheetState(prev, [D2], ['define'], LABELS);
    assertEqual(next.rowCount, 1);
    const stack = planZegStack('ws1', SHEET, prev, next);
    // Weggefallene Zeilen einzeln von unten nach oben; die Zeile von D2 bleibt und rückt nach oben.
    assertDeepEqual(calls(ofMethod(stack, 'removeRows')), [
      ['removeRows', [{ sheetId: SHEET, startRow: 2, count: 1 }]],
      ['removeRows', [{ sheetId: SHEET, startRow: 0, count: 1 }]],
    ]);
  });

  test('Zeile davor: addRows an der Position, Nutzerspalten werden nicht geschrieben, keine Formeln neu gesetzt', () => {
    const prev = buildSheetState(null, [D1, D2], ['define'], LABELS);
    prev.columns.push({ id: 'u1', name: 'Doppelt', type: 'numeric', values: [null, 80], formulas: [null, '=C2[2]*2'], format: {}, meta: null });
    const D0 = { date: '2026-07-01', values: { define: 5 } };
    const next = buildSheetState(prev, [D0, D1, D2], ['define'], LABELS);
    const stack = planZegStack('ws1', SHEET, prev, next);
    // Struktur zuerst, dann die verwalteten Spalten.
    assertDeepEqual(calls(stack.slice(0, 1)), [['addRows', [{ sheetId: SHEET, position: 0, count: 1 }]]]);
    assertEqual(stack[1].method, 'writeColumns');
    assertTrue(!stack[1].args[0].columns.some(e => e.to === 'u1'));
    assertEqual(ofMethod(stack, 'setFormula').length, 0);
  });

  test('Gleichstand unabhängig von der Schlüsselreihenfolge in meta und Werten', () => {
    const prev = buildSheetState(null, [D1], ['define'], LABELS);
    prev.columns.push({ id: 'u1', name: 'Notiz', type: 'text', values: [{ a: 1, b: 2 }], formulas: [null], format: {}, meta: { lock: 'soft', reason: 'x' } });
    const next = buildSheetState(prev, [D1], ['define'], LABELS);
    const flip = (o) => (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).reverse()) : o);
    const asRead = { ...prev, columns: prev.columns.map(c => ({ ...c, meta: flip(c.meta), values: c.values.map(flip) })) };
    assertDeepEqual(planZegStack('ws1', SHEET, asRead, next), []);
  });

  test('Referenz einer neuen Spalte zählt nur die geschriebenen (verwalteten) Einträge', () => {
    const prev = buildSheetState(null, [D1], ['define'], LABELS);
    prev.columns.push({ id: 'u1', name: 'Fix', type: 'numeric', values: [1], formulas: [null], format: {}, meta: { lock: 'hard' } });
    const next = buildSheetState(prev, [D1], ['define', 'measure'], LABELS);
    const stack = planZegStack('ws1', SHEET, prev, next);
    const entries = ofMethod(stack, 'writeColumns')[0].args[0].columns;
    const appendAt = entries.findIndex(e => e.to === 'append');
    const meta = ofMethod(stack, 'setColumnMeta')[0].args[0];
    assertDeepEqual(meta.columnId, { $from: 'write', path: `value.${appendAt}` });
  });

  test('neue Spalte: format ist eine Kopie, kein Verweis', () => {
    const prev = buildSheetState(null, [D1], ['define'], LABELS);
    const next = buildSheetState(prev, [D1], ['define', 'measure'], LABELS);
    const col = next.columns.find(c => c.meta.managedRef === 'measure');
    const entry = planZegStack('ws1', SHEET, prev, next)[0].args[0].columns.find(e => e.to === 'append');
    assertDeepEqual(entry.format, col.format);
    assertTrue(entry.format !== col.format);
  });
});

/**
 * P11/R18: gesperrte Nutzerspalten bleiben bei ihrem Datum. Der Stapel läuft
 * gegen das echte Model des Arbeitsblatts (`fakeKernelSurface`, nur
 * `@agent`-Kommandos); geprüft werden die Zellen je Datum danach.
 */
suite('core/zeg-sheet-model planZegStack: Zeilen wandern ganz (gesperrte Nutzerspalten)', () => {
  const SHEET = 'sheet_1';

  /** Den Plan prev → next auf ein Arbeitsblatt mit Blatt `prev` anwenden; liefert das Blatt danach. */
  async function apply(prev, next) {
    const modules = new Map([['ws1', WorksheetModel.fromJSON({ sheets: [{ id: SHEET, name: 'ZEG', state: prev }], activeSheetId: SHEET, sheetCounter: 1 }).toJSON()]]);
    const state = { phases: { data: [{ instanceId: 'ws1', moduleId: 'worksheet', order: 0 }] } };
    const surface = fakeKernelSurface({ state, modules, isCompleted: () => false });
    const stack = planZegStack('ws1', SHEET, prev, next);
    const out = await surface.interactAsKernel(stack, 'zeg-sheet');
    assertEqual(out.ok, true, JSON.stringify(out));
    const saved = modules.get('ws1');
    const head = readWorksheetStored(saved, { sheetId: SHEET });
    return { stack, sheet: readWorksheetStored(saved, { sheetId: SHEET, columns: head.columns.map(c => c.id), fields: ['formulas'] }) };
  }
  const byRef = (sheet, ref) => sheet.columns.find(c => c.meta?.managedRef === ref);
  const byId = (sheet, id) => sheet.columns.find(c => c.id === id);
  const formulaAt = (sheet, id) => Object.fromEntries((sheet.formulas ?? []).filter(f => f.columnId === id).map(f => [f.row, f.formula]));
  const NOTE = (values, formulas, lock = 'hard') => ({ id: 'u1', name: 'Notiz', type: 'numeric', values, formulas, format: {}, meta: { lock } });

  test('Zeile davor eingefügt: Werte und Formel der hart gesperrten Spalte bleiben bei ihrem Datum', async () => {
    const D1 = { date: '2026-07-10', values: { define: 20 } };
    const D2 = { date: '2026-07-12', values: { define: 40 } };
    const D0 = { date: '2026-07-01', values: { define: 5 } };
    const prev = buildSheetState(null, [D1, D2], ['define'], LABELS);
    prev.columns.push(NOTE([7, 80], [null, '=40*2']));
    const next = buildSheetState(prev, [D0, D1, D2], ['define'], LABELS);
    const { stack, sheet } = await apply(prev, next);
    assertEqual(ofMethodOf(stack, 'setFormula').length, 0);
    assertDeepEqual(byRef(sheet, DATE_REF).values, ['2026-07-01', '2026-07-10', '2026-07-12']);
    assertDeepEqual(byRef(sheet, 'define').values, [5, 20, 40]);
    assertDeepEqual(byId(sheet, 'u1').values, [null, 7, 80]);
    assertDeepEqual(formulaAt(sheet, 'u1'), { 2: '=40*2' });
  });

  test('Zeile weggefallen (Zykluswechsel): die Zelle des späteren Datums bleibt, nichts wird abgeschnitten', async () => {
    // DMAIC, 07-02 hat nur einen improve-Wert; Notiz hart gesperrt.
    const rows = [
      { date: '2026-07-01', values: { define: 10 } },
      { date: '2026-07-02', values: { improve: 50 } },
      { date: '2026-07-03', values: { define: 30 } },
    ];
    const prev = buildSheetState(null, rows, DMAIC, LABELS);
    prev.columns.push({ ...NOTE(['a', null, 'c'], [null, null, null]), type: 'text' });
    // Wechsel nach DMADV: improve fällt weg, damit auch der Tag 07-02.
    const next = buildSheetState(prev, [rows[0], rows[2]], DMADV, LABELS);
    const { sheet } = await apply(prev, next);
    assertDeepEqual(byRef(sheet, DATE_REF).values, ['2026-07-01', '2026-07-03']);
    assertDeepEqual(byId(sheet, 'u1').values, ['a', 'c']);
    assertEqual(byRef(sheet, 'improve'), undefined);
  });

  test('Umordnung samt Formel einer ungesperrten Nutzerspalte: die Formel wandert mit ihrer Zeile', async () => {
    const D1 = { date: '2026-07-10', values: { define: 20 } };
    const D2 = { date: '2026-07-12', values: { define: 40 } };
    const prev = buildSheetState(null, [D1, D2], ['define'], LABELS);
    prev.columns.push({ ...NOTE([null, 80], [null, '=40*2']), meta: null });
    const D0 = { date: '2026-07-01', values: { define: 5 } };
    const next = buildSheetState(prev, [D0, D1, D2], ['define'], LABELS);
    const { sheet } = await apply(prev, next);
    assertDeepEqual(byId(sheet, 'u1').values, [null, null, 80]);
    assertDeepEqual(formulaAt(sheet, 'u1'), { 2: '=40*2' });
  });

  test('Tage vertauscht (Datum von Hand geändert): moveRow bringt die Zeilen samt gesperrter Zelle in Datumsfolge', async () => {
    const prev = buildSheetState(null, [
      { date: '2026-07-01', values: { define: 10 } },
      { date: '2026-07-03', values: { define: 30 } },
    ], ['define'], LABELS);
    prev.columns.push(NOTE([1, 3], [null, null], 'soft'));
    // Der Nutzer hat das erste Datum auf 07-05 gesetzt; der Verlauf ist schon gelesen.
    byRef(prev, DATE_REF).values[0] = '2026-07-05';
    const next = buildSheetState(prev, [
      { date: '2026-07-03', values: { define: 30 } },
      { date: '2026-07-05', values: { define: 10 } },
    ], ['define'], LABELS);
    const { stack, sheet } = await apply(prev, next);
    assertTrue(ofMethodOf(stack, 'moveRow').length > 0);
    assertDeepEqual(byRef(sheet, DATE_REF).values, ['2026-07-03', '2026-07-05']);
    assertDeepEqual(byId(sheet, 'u1').values, [3, 1]);
  });

  test('Rückfall: verlöre eine gesperrte Zelle ihr Datum, plant er nichts', () => {
    const prev = buildSheetState(null, [{ date: '2026-07-01', values: { define: 10 } }], ['define'], LABELS);
    prev.columns.push(NOTE([9], [null]));
    const next = buildSheetState(prev, [{ date: '2026-07-01', values: { define: 10 } }], ['define'], LABELS);
    next.rowOrigin = [null];                       // ein Herkunftsplan, der Zeile 0 fallen ließe
    next.columns.find(c => c.meta?.managedRef === 'define').values = [11];
    const warn = console.warn;
    console.warn = () => {};
    try {
      assertDeepEqual(planZegStack('ws1', SHEET, prev, next), []);
    } finally { console.warn = warn; }
  });
});

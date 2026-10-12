/**
 * Tests for core/zeg-sheet/zeg-sheet-model.js
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import {
  historyToRows, rowsToHistory, readRows, buildSheetState, isZegColumn, DATE_REF,
} from '../../js/core/zeg-sheet/zeg-sheet-model.js';

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

suite('core/zeg-sheet-model malformed history entries', () => {
  test('entries without a numeric t are not shown and survive a sync', () => {
    const history = { define: [{ ts: 123, value: 50 }, { t: at(2026, 7, 10), v: 20 }] };
    const rows = historyToRows(history, ['define']);
    assertDeepEqual(rows, [{ date: '2026-07-10', values: { define: 20 } }]);
    const back = rowsToHistory(rows, ['define'], history);
    assertDeepEqual(back.define, [{ ts: 123, value: 50 }, { t: at(2026, 7, 10), v: 20 }]);
  });
});

import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import {
  parseCount, parseProportion, distinctValues, defaultEventValue,
  normalizeSummary, normalizeColumns,
} from '../../js/modules/attribute-test/attribute-test-input.js';

const base = (over = {}) => ({
  testKind: 'one',
  p0: '0.5',
  eventValue: null,
  summary: {
    x: '', n: '', x1: '', n1: '', x2: '', n2: '',
    table: { rows: ['A', 'B'], cols: ['X', 'Y'], counts: [['', ''], ['', '']] },
  },
  ...over,
});

suite('attribute-test input — parsing', () => {
  test('parseCount accepts integers with blanks', () => {
    assertEqual(parseCount(' 12 '), 12);
    assertEqual(parseCount('1 200'), 1200);
    assertEqual(parseCount(7), 7);
  });
  test('parseCount rejects decimals, negatives, text and empty', () => {
    assertEqual(parseCount('3.5'), null);
    assertEqual(parseCount('12,0'), null);
    assertEqual(parseCount('-1'), null);
    assertEqual(parseCount('abc'), null);
    assertEqual(parseCount(''), null);
  });
  test('parseProportion accepts comma and dot', () => {
    assertEqual(parseProportion('0,25'), 0.25);
    assertEqual(parseProportion('0.25'), 0.25);
    assertEqual(parseProportion('x'), null);
  });
  test('distinctValues sorts numerically and skips missing', () => {
    assertDeepEqual(distinctValues([1, 0, null, '', 1, 10, 2]), ['0', '1', '2', '10']);
    assertEqual(defaultEventValue(['i.O.', 'n.i.O.', 'i.O.']), 'n.i.O.');
    assertEqual(defaultEventValue([null, '']), null);
  });
  test('0/1 codes with blanks: selector offers "0" and "1", default "1"', () => {
    const col = [1, 0, null, 1, '', 1];
    assertDeepEqual(distinctValues(col), ['0', '1']);
    assertEqual(defaultEventValue(col), '1');
  });
});

suite('attribute-test input — summary', () => {
  test('empty one-proportion input is a hint, not an error', () => {
    const r = normalizeSummary(base());
    assertEqual(r.ok, false);
    assertEqual(r.error, 'hintEnterCounts');
    assertEqual(r.hint, true);
  });
  test('valid one-proportion input', () => {
    const s = base({ p0: '0,1' });
    s.summary.x = '3'; s.summary.n = '40';
    assertDeepEqual(normalizeSummary(s), { ok: true, kind: 'one', x: 3, n: 40, p0: 0.1, missing: 0 });
  });
  test('one-proportion errors', () => {
    const s = base();
    s.summary.x = '5'; s.summary.n = '4';
    assertEqual(normalizeSummary(s).error, 'errXGreaterN');
    s.summary.x = '0'; s.summary.n = '0';
    assertEqual(normalizeSummary(s).error, 'errNZero');
    s.summary.x = '2.5'; s.summary.n = '10';
    assertEqual(normalizeSummary(s).error, 'errCountInvalid');
    s.summary.x = '2'; s.p0 = '1';
    assertEqual(normalizeSummary(s).error, 'errP0Range');
  });
  test('decimal counts are an error, never truncated', () => {
    const s = base();
    s.summary.x = '3'; s.summary.n = '12,0';
    assertEqual(normalizeSummary(s).error, 'errCountInvalid');
    s.summary.n = '3.5';
    assertEqual(normalizeSummary(s).error, 'errCountInvalid');
    s.summary.n = '1 200';
    assertEqual(normalizeSummary(s).n, 1200);
  });
  test('valid two-proportion input', () => {
    const s = base({ testKind: 'two' });
    Object.assign(s.summary, { x1: '46', n1: '1 200', x2: '21', n2: '1150' });
    assertDeepEqual(normalizeSummary(s),
      { ok: true, kind: 'two', x1: 46, n1: 1200, x2: 21, n2: 1150, groups: null, missing: 0 });
  });
  test('two-proportion x2 > n2', () => {
    const s = base({ testKind: 'two' });
    Object.assign(s.summary, { x1: '1', n1: '10', x2: '11', n2: '10' });
    assertEqual(normalizeSummary(s).error, 'errXGreaterN');
  });
  test('table: empty is a hint, blanks inside a started table are errors', () => {
    const s = base({ testKind: 'assoc' });
    assertEqual(normalizeSummary(s).error, 'hintEnterCounts');
    s.summary.table.counts = [['4', ''], ['2', '7']];
    assertEqual(normalizeSummary(s).error, 'errCountInvalid');
  });
  test('table: valid counts', () => {
    const s = base({ testKind: 'assoc' });
    s.summary.table.counts = [['4', '0'], ['2', '7']];
    assertDeepEqual(normalizeSummary(s),
      { ok: true, kind: 'assoc', rows: ['A', 'B'], cols: ['X', 'Y'], counts: [[4, 0], [2, 7]], missing: 0 });
  });
});

suite('attribute-test input — columns', () => {
  test('no column picked is a hint', () => {
    const r = normalizeColumns(base(), { response: null, group: null, rowVar: null, colVar: null });
    assertEqual(r.error, 'hintPickColumns');
    assertEqual(r.hint, true);
  });
  test('one proportion from 0/1 codes with blanks', () => {
    const s = base({ eventValue: '1', p0: '0.5' });
    const r = normalizeColumns(s, { response: [1, 0, null, 1, '', 1], group: null, rowVar: null, colVar: null });
    assertDeepEqual(r, { ok: true, kind: 'one', x: 3, n: 4, p0: 0.5, missing: 2 });
  });
  test('one proportion without chosen event defaults to "1"', () => {
    const r = normalizeColumns(base(), { response: [1, 0, null, 1, '', 1], group: null, rowVar: null, colVar: null });
    assertDeepEqual(r, { ok: true, kind: 'one', x: 3, n: 4, p0: 0.5, missing: 2 });
  });
  test('response with three levels is rejected', () => {
    const s = base({ eventValue: 'a' });
    const r = normalizeColumns(s, { response: ['a', 'b', 'c'], group: null, rowVar: null, colVar: null });
    assertEqual(r.error, 'errResponseLevels');
  });
  test('two proportions by group', () => {
    const s = base({ testKind: 'two', eventValue: 'n.i.O.' });
    const response = ['i.O.', 'n.i.O.', 'n.i.O.', 'i.O.', 'i.O.', null];
    const group = ['Früh', 'Früh', 'Spät', 'Spät', 'Spät', 'Spät'];
    assertDeepEqual(normalizeColumns(s, { response, group, rowVar: null, colVar: null }),
      { ok: true, kind: 'two', x1: 1, n1: 2, x2: 1, n2: 3, groups: ['Früh', 'Spät'], missing: 1 });
  });
  test('group with three levels is rejected', () => {
    const s = base({ testKind: 'two', eventValue: 'b' });
    const r = normalizeColumns(s, {
      response: ['a', 'b', 'a'], group: ['x', 'y', 'z'], rowVar: null, colVar: null,
    });
    assertEqual(r.error, 'errGroupLevels');
  });
  test('cross tabulation', () => {
    const s = base({ testKind: 'assoc' });
    const r = normalizeColumns(s, {
      response: null, group: null,
      rowVar: ['Früh', 'Spät', 'Früh', 'Nacht', null],
      colVar: ['ok', 'nok', 'nok', 'ok', 'ok'],
    });
    assertDeepEqual(r, {
      ok: true, kind: 'assoc',
      rows: ['Früh', 'Nacht', 'Spät'], cols: ['nok', 'ok'],
      counts: [[1, 1], [0, 1], [1, 0]], missing: 1,
    });
  });
});

// ---- Task 4: model and report ----

suite('attribute-test input — stale event value', () => {
  test('eventValue not among the levels falls back to the default level', () => {
    const s = base({ testKind: 'one', eventValue: 'gone' });
    const r = normalizeColumns(s, { response: ['a', 'b', 'b', 'a', 'b'], group: null, rowVar: null, colVar: null });
    assertEqual(r.x, 3);
    assertEqual(r.n, 5);
  });
});

import { State } from '../../js/modules/attribute-test/attribute-test-model.js';
import { buildReport, fmtP } from '../../js/modules/attribute-test/attribute-test-report.js';

suite('attribute-test model', () => {
  test('defaults', () => {
    const s = new State();
    assertEqual(s.testKind, 'two');
    assertEqual(s.inputMode, 'summary');
    assertEqual(s.alpha, null);
    assertEqual(s.hasContent(), false);
    assertDeepEqual(s.summary.table.counts, [['', ''], ['', '']]);
  });
  test('switching test kind keeps earlier inputs', () => {
    const s = new State();
    s.testKind = 'one'; s.summary.x = '3'; s.summary.n = '10';
    s.testKind = 'assoc'; s.summary.table.counts[0][0] = '7';
    s.testKind = 'two'; s.summary.x1 = '5';
    s.inputMode = 'columns'; s.inputMode = 'summary';
    const back = State.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
    assertEqual(back.summary.x, '3');
    assertEqual(back.summary.n, '10');
    assertEqual(back.summary.table.counts[0][0], '7');
    assertEqual(back.summary.x1, '5');
  });
  test('association direction persists', () => {
    const s = new State();
    s.direction = 'greater';
    assertEqual(State.fromJSON(JSON.parse(JSON.stringify(s.toJSON()))).direction, 'greater');
  });
  test('round trip keeps both input modes', () => {
    const s = new State();
    s.summary.x1 = '46';
    s.inputMode = 'columns';
    s.colRefs.response = { instanceId: 'w', sheetId: 's', columnId: 'c1' };
    s.eventValue = 'n.i.O.';
    const back = State.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
    assertEqual(back.summary.x1, '46');
    assertEqual(back.inputMode, 'columns');
    assertDeepEqual(back.colRefs.response, { instanceId: 'w', sheetId: 's', columnId: 'c1' });
    assertEqual(back.eventValue, 'n.i.O.');
    assertEqual(back.hasContent(), true);
  });
  test('fromJSON sanitizes garbage', () => {
    const s = State.fromJSON({ testKind: 'x', direction: 'up', summary: { table: { counts: 'no' } } });
    assertEqual(s.testKind, 'two');
    assertEqual(s.direction, 'two-sided');
    assertDeepEqual(s.summary.table.counts, [['', ''], ['', '']]);
  });
  test('table never shrinks below 2×2', () => {
    const s = new State();
    s.addRow(); s.addCol();
    assertEqual(s.summary.table.rows.length, 3);
    assertEqual(s.summary.table.counts[2].length, 3);
    s.removeRow(0); s.removeRow(0);
    assertEqual(s.summary.table.rows.length, 2);
    s.removeCol(2); s.removeCol(0);
    assertEqual(s.summary.table.cols.length, 2);
  });
});

suite('attribute-test report', () => {
  const st = (over = {}) => ({ direction: 'two-sided', alpha: 0.05, pooled: false, ...over });

  test('passes normalizer errors through', () => {
    assertDeepEqual(buildReport(st(), { ok: false, error: 'errNZero' }), { error: 'errNZero' });
    assertDeepEqual(buildReport(st(), { ok: false, error: 'hintEnterCounts', hint: true }),
      { error: 'hintEnterCounts', hint: true });
  });
  test('one proportion with x = n flags the normal approximation', () => {
    const r = buildReport(st({ direction: 'greater' }), { ok: true, kind: 'one', x: 25, n: 25, p0: 0.9, missing: 0 });
    assertEqual(r.kind, 'one');
    assertTrue(r.notes.some(n => n.key === 'noteNormalApprox'));
    const ci = r.stats.find(s => s.key === 'ci');
    assertTrue(!ci.value.includes('NaN'), ci.value);
    assertEqual(r.basisKey, 'basisExact');
  });
  test('two proportions: KW35/38 pooled keeps H0', () => {
    const r = buildReport(st({ pooled: true }),
      { ok: true, kind: 'two', x1: 184, n1: 3902, x2: 179, n2: 4023, groups: null, missing: 0 });
    assertEqual(r.decision, 'keep');
    assertEqual(r.stats.find(s => s.key === 'pValue').value, '0.5710');
    assertEqual(r.stats.find(s => s.key === 'pFisher').value, '0.5912');
    assertTrue(r.notes.some(n => n.key === 'notePooled'));
  });
  test('association: dropped zero row is named, 2×2 extras present', () => {
    const r = buildReport(st(), {
      ok: true, kind: 'assoc', rows: ['A', 'B', 'C'], cols: ['X', 'Y'],
      counts: [[10, 20], [0, 0], [15, 5]], missing: 0,
    });
    const dropped = r.notes.find(n => n.key === 'noteDropped');
    assertEqual(dropped.params.names, 'B');
    assertDeepEqual(r.table.rows.map(x => x.name), ['A', 'C']);
    assertTrue(r.stats.some(s => s.key === 'yates'));
    assertTrue(r.stats.some(s => s.key === 'pFisher'));
  });
  test('association 2x2 Fisher follows the direction', () => {
    const norm = { ok: true, kind: 'assoc', rows: ['A', 'B'], cols: ['X', 'Y'], counts: [[8, 2], [3, 7]], missing: 0 };
    const two = buildReport(st(), norm).stats.find(s => s.key === 'pFisher');
    const gr = buildReport(st({ direction: 'greater' }), norm).stats.find(s => s.key === 'pFisher');
    const le = buildReport(st({ direction: 'less' }), norm).stats.find(s => s.key === 'pFisher');
    assertEqual(two.labelKey, 'statPFisher');
    assertEqual(gr.labelKey, 'statPFisherGreater');
    assertEqual(le.labelKey, 'statPFisherLess');
    assertTrue(Number(gr.value) < Number(two.value), gr.value + ' vs ' + two.value);
    assertTrue(Number(le.value) > Number(gr.value));
  });
  test('association: larger table has no Fisher row', () => {
    const r = buildReport(st({ direction: 'greater' }), {
      ok: true, kind: 'assoc', rows: ['A', 'B'], cols: ['X', 'Y', 'Z'], counts: [[5, 6, 8], [7, 4, 9]], missing: 0,
    });
    assertTrue(!r.stats.some(s => s.key === 'pFisher'));
  });
  test('association: fewer than 2×2 after dropping is an error', () => {
    const r = buildReport(st(), {
      ok: true, kind: 'assoc', rows: ['A', 'B'], cols: ['X', 'Y'], counts: [[5, 0], [7, 0]], missing: 0,
    });
    assertEqual(r.error, 'errTableTooSmall');
  });
  test('association: low expected counts warn', () => {
    const r = buildReport(st(), {
      ok: true, kind: 'assoc', rows: ['A', 'B'], cols: ['X', 'Y', 'Z'], counts: [[1, 2, 8], [3, 1, 9]], missing: 0,
    });
    assertTrue(r.notes.some(n => n.key === 'warnShareBelow5'));
  });
  test('x = 0 with a one-sided alternative gives exact bounds', () => {
    const r = buildReport(st({ direction: 'less' }), { ok: true, kind: 'one', x: 0, n: 30, p0: 0.1, missing: 0 });
    const c = r.stats.find(s => s.key === 'ci').value;
    assertTrue(c.startsWith('[0.0000,'), c);
    assertTrue(!c.includes('NaN'), c);
    assertTrue(r.notes.some(n => n.key === 'noteNormalApprox'));
  });
  test('x = n with a one-sided alternative ends at exactly 1', () => {
    const r = buildReport(st({ direction: 'greater' }), { ok: true, kind: 'one', x: 12, n: 12, p0: 0.5, missing: 0 });
    assertTrue(r.stats.find(s => s.key === 'ci').value.endsWith(', 1.0000]'));
  });
  test('missing values are reported', () => {
    const r = buildReport(st(), { ok: true, kind: 'one', x: 3, n: 4, p0: 0.5, missing: 2 });
    assertDeepEqual(r.notes.find(n => n.key === 'noteMissing').params, { count: 2 });
  });
  test('fmtP', () => {
    assertEqual(fmtP(0.00001), '< 0.0001');
    assertEqual(fmtP(0.5), '0.5000');
  });
});

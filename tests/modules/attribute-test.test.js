import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
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

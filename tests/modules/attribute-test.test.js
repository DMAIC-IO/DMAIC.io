import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import {
  parseCount, parseProportion, distinctValues, defaultEventValue,
  normalizeSummary, normalizeColumns, columnValuesOrNull, parsePositive,
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

import { State, TEST_KINDS } from '../../js/modules/attribute-test/attribute-test-model.js';
import { buildReport, fmtP } from '../../js/modules/attribute-test/attribute-test-report.js';

suite('attribute-test column ref resolution', () => {
  const sm = { getModuleState: (id) => id === 'w' ? { sheets: [{ id: 's', state: { columns: [{ id: 'c1', values: ['a', 'b'] }] } }] } : null };
  test('resolved ref returns the values', () => {
    assertDeepEqual(columnValuesOrNull(sm, { instanceId: 'w', sheetId: 's', columnId: 'c1' }), ['a', 'b']);
  });
  test('missing or dangling ref returns null (pick-columns hint)', () => {
    assertEqual(columnValuesOrNull(sm, null), null);
    assertEqual(columnValuesOrNull(sm, { instanceId: 'gone', sheetId: 's', columnId: 'c1' }), null);
    assertEqual(columnValuesOrNull(sm, { instanceId: 'w', sheetId: 's', columnId: 'zz' }), null);
  });
});

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
  test('two proportions: pooled z keeps H0 for similar rates', () => {
    // invented counts; reference values from scipy (pooled z two-sided, Fisher exact)
    const r = buildReport(st({ pooled: true }),
      { ok: true, kind: 'two', x1: 30, n1: 400, x2: 18, n2: 380, groups: null, missing: 0 });
    assertEqual(r.decision, 'keep');
    assertEqual(r.stats.find(s => s.key === 'pValue').value, '0.1085');
    assertEqual(r.stats.find(s => s.key === 'pFisher').value, '0.1356');
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

const nonEmpty = { response: null, group: null, rowVar: null, colVar: null, counts: null, before: null, after: null };
const st = (over = {}, summary = {}) => {
  const s = new State();
  Object.assign(s, over);
  Object.assign(s.summary, summary);
  return s;
};

suite('attribute-test part 2 — model', () => {
  test('old part-1 state opens on its old kind', () => {
    const s = State.fromJSON({ testKind: 'assoc', summary: { x1: '3' } });
    assertEqual(s.testKind, 'assoc');
    assertEqual(s.summary.x1, '3');
    assertEqual(s.summary.t, '');
    assertEqual(s.summary.diff0, '0');
    assertEqual(s.equiv.samples, 2);
    assertEqual(s.exposurePerRow, '1');
    assertEqual(s.ratePooled, false);
  });
  test('switching between all seven kinds keeps every input', () => {
    const s = new State();
    s.summary.x = '1'; s.summary.t = '2'; s.summary.t1 = '3'; s.summary.t2 = '4'; s.summary.lambda0 = '5';
    s.summary.diff0 = '6'; s.summary.pairs.counts[1][0] = '7'; s.summary.pairs.labels.before = 'vorher';
    s.equiv.delta = '8'; s.equiv.lower = '9'; s.equiv.upper = '10'; s.exposurePerRow = '2,5';
    s.colRefs.counts = { instanceId: 'w', columnId: 'c' };
    let cur = s;
    for (const k of TEST_KINDS) {
      cur.testKind = k;
      cur = State.fromJSON(JSON.parse(JSON.stringify(cur.toJSON())));
    }
    assertEqual(cur.testKind, 'assoc');
    assertEqual(cur.summary.t, '2'); assertEqual(cur.summary.t1, '3'); assertEqual(cur.summary.t2, '4');
    assertEqual(cur.summary.lambda0, '5'); assertEqual(cur.summary.diff0, '6');
    assertEqual(cur.summary.pairs.counts[1][0], '7');
    assertEqual(cur.summary.pairs.labels.before, 'vorher');
    assertEqual(cur.equiv.delta, '8'); assertEqual(cur.equiv.lower, '9'); assertEqual(cur.equiv.upper, '10');
    assertEqual(cur.exposurePerRow, '2,5');
    assertDeepEqual(cur.colRefs.counts, { instanceId: 'w', columnId: 'c' });
  });
  test('garbage pairs and equiv fall back to defaults', () => {
    const s = State.fromJSON({ summary: { pairs: { counts: [['1']] } }, equiv: { samples: 7, symmetric: 'x' } });
    assertDeepEqual(s.summary.pairs.counts, [['', ''], ['', '']]);
    assertEqual(s.equiv.samples, 2);
    assertEqual(s.equiv.symmetric, true);
  });
  test('hasContent sees the new fields', () => {
    assertEqual(new State().hasContent(), false);
    for (const set of [s => { s.summary.t = '1'; }, s => { s.summary.pairs.counts[0][1] = '1'; },
      s => { s.equiv.delta = '1'; }, s => { s.summary.diff0 = '2'; },
      s => { s.colRefs.before = { instanceId: 'w', columnId: 'c' }; }]) {
      const s = new State();
      set(s);
      assertEqual(s.hasContent(), true);
    }
  });
  test('switchToEquivalence keeps the counts and the column refs', () => {
    const s = new State();
    s.equiv.samples = 1; s.equiv.delta = '2';
    s.summary.x1 = '3'; s.summary.n1 = '10'; s.summary.x2 = '4'; s.summary.n2 = '12';
    s.colRefs.response = { instanceId: 'w', columnId: 'r' };
    s.colRefs.group = { instanceId: 'w', columnId: 'g' };
    s.switchToEquivalence();
    assertEqual(s.testKind, 'equiv');
    assertEqual(s.equiv.samples, 2);
    assertEqual(s.equiv.delta, '2');
    assertEqual(s.summary.x1, '3'); assertEqual(s.summary.n2, '12');
    assertEqual(s.colRefs.response.columnId, 'r');
    assertEqual(s.colRefs.group.columnId, 'g');
  });
});

suite('attribute-test part 2 — rates', () => {
  test('parsePositive', () => {
    assertEqual(parsePositive('12,5'), 12.5);
    assertEqual(parsePositive('0'), null);
    assertEqual(parsePositive('-1'), null);
    assertEqual(parsePositive(''), null);
  });
  test('rate1: comma exposure parses, decimal event count is rejected', () => {
    const ok = normalizeSummary(st({ testKind: 'rate1' }, { x: '37', t: '12,5', lambda0: '2' }));
    assertDeepEqual(ok, { ok: true, kind: 'rate1', x: 37, t: 12.5, lambda0: 2, missing: 0 });
    assertEqual(normalizeSummary(st({ testKind: 'rate1' }, { x: '3.5', t: '1', lambda0: '2' })).error, 'errCountInvalid');
    assertEqual(normalizeSummary(st({ testKind: 'rate1' }, { x: '3', t: '0', lambda0: '2' })).error, 'errExposure');
    assertEqual(normalizeSummary(st({ testKind: 'rate1' }, { x: '3', t: '1', lambda0: '0' })).error, 'errLambda0');
    assertEqual(normalizeSummary(st({ testKind: 'rate1' })).hint, true);
  });
  test('rate1 columns: exposure = rows × exposurePerRow, blanks skipped', () => {
    const s = st({ testKind: 'rate1', exposurePerRow: '2,5' }, { lambda0: '1' });
    const r = normalizeColumns(s, { ...nonEmpty, counts: [2, '', 0, 3] });
    assertDeepEqual(r, { ok: true, kind: 'rate1', x: 5, t: 7.5, lambda0: 1, missing: 1 });
  });
  test('rate1 columns: negative count and bad exposure', () => {
    const s = st({ testKind: 'rate1' }, { lambda0: '1' });
    assertEqual(normalizeColumns(s, { ...nonEmpty, counts: [2, -1] }).error, 'errCountInvalid');
    s.exposurePerRow = '0';
    assertEqual(normalizeColumns(s, { ...nonEmpty, counts: [2, 1] }).error, 'errExposure');
    assertEqual(normalizeColumns(s, nonEmpty).hint, true);
  });
  test('rate2 summary', () => {
    const s = st({ testKind: 'rate2' }, { x1: '10', t1: '2', x2: '4', t2: '3,5' });
    assertDeepEqual(normalizeSummary(s),
      { ok: true, kind: 'rate2', x1: 10, t1: 2, x2: 4, t2: 3.5, diff0: 0, groups: null, missing: 0 });
    s.summary.t2 = '0';
    assertEqual(normalizeSummary(s).error, 'errExposure');
  });
  test('rate2 columns: count column split by a two-level group', () => {
    const s = st({ testKind: 'rate2', exposurePerRow: '2' });
    const r = normalizeColumns(s, {
      ...nonEmpty, counts: [1, 2, 3, '', 4], group: ['A', 'A', 'B', 'B', 'B'],
    });
    assertDeepEqual(r, { ok: true, kind: 'rate2', x1: 3, t1: 4, x2: 7, t2: 4, diff0: 0, groups: ['A', 'B'], missing: 1 });
    assertEqual(normalizeColumns(s, { ...nonEmpty, counts: [1, 2, 3], group: ['A', 'B', 'C'] }).error, 'errGroupLevels');
  });
});

suite('attribute-test part 2 — McNemar', () => {
  test('summary: 2×2 pairs, blanks are an error once started', () => {
    const s = st({ testKind: 'mcnemar' });
    assertEqual(normalizeSummary(s).hint, true);
    s.summary.pairs.counts = [['10', '5'], ['', '20']];
    assertEqual(normalizeSummary(s).error, 'errCountInvalid');
    s.summary.pairs.counts = [['10', '5'], ['2', '20']];
    s.summary.pairs.labels.before = 'vorher';
    assertDeepEqual(normalizeSummary(s), {
      ok: true, kind: 'mcnemar', table: [[10, 5], [2, 20]], labels: { before: 'vorher', after: '' }, missing: 0,
    });
  });
  test('columns: raw lengths differ → errPairsLength', () => {
    const s = st({ testKind: 'mcnemar' });
    const r = normalizeColumns(s, { ...nonEmpty, before: ['a', 'b', 'a'], after: ['a', 'b'] });
    assertEqual(r.error, 'errPairsLength');
  });
  test('columns: trailing blanks are trimmed before comparing lengths', () => {
    const s = st({ testKind: 'mcnemar', eventValue: 'a' });
    const r = normalizeColumns(s, { ...nonEmpty, before: ['a', 'b', 'a', ''], after: ['a', 'b', 'b'] });
    assertEqual(r.ok, true);
    assertDeepEqual(r.table, [[1, 1], [0, 1]]);
  });
  test('columns: one column constant, union has two levels → ok', () => {
    const s = st({ testKind: 'mcnemar', eventValue: 'i.O.' });
    const r = normalizeColumns(s, {
      ...nonEmpty,
      before: ['n.i.O.', 'n.i.O.', 'n.i.O.', 'n.i.O.'],
      after: ['i.O.', 'n.i.O.', '', 'i.O.'],
    });
    assertDeepEqual(r, {
      ok: true, kind: 'mcnemar', table: [[0, 0], [2, 1]], labels: { before: '', after: '' }, missing: 1,
    });
  });
  test('columns: union with three levels → errPairLevels', () => {
    const s = st({ testKind: 'mcnemar' });
    assertEqual(normalizeColumns(s, { ...nonEmpty, before: ['a', 'b'], after: ['c', 'a'] }).error, 'errPairLevels');
  });
});

suite('attribute-test part 2 — equivalence', () => {
  test('bounds: symmetric delta is ± in percentage points', () => {
    const s = st({ testKind: 'equiv' }, { x1: '5', n1: '100', x2: '6', n2: '100' });
    s.equiv.delta = '1';
    assertDeepEqual(normalizeSummary(s), {
      ok: true, kind: 'equiv', samples: 2, x1: 5, n1: 100, x2: 6, n2: 100, lower: -0.01, upper: 0.01,
      groups: null, missing: 0,
    });
  });
  test('bounds: asymmetric empty, order, containment', () => {
    const s = st({ testKind: 'equiv' }, { x1: '5', n1: '100', x2: '6', n2: '100' });
    s.equiv.symmetric = false;
    assertEqual(normalizeSummary(s).error, 'errBoundsMissing');
    s.equiv.lower = '2'; s.equiv.upper = '1';
    assertEqual(normalizeSummary(s).error, 'errBoundsOrder');
    s.equiv.lower = '0,5'; s.equiv.upper = '1';
    assertEqual(normalizeSummary(s).error, 'errBoundsContain');
    s.equiv.lower = '-0,5';
    assertEqual(normalizeSummary(s).lower, -0.005);
  });
  test('1 sample: counts, p0 and bounds', () => {
    const s = st({ testKind: 'equiv', p0: '0,1' }, { x: '8', n: '100' });
    s.equiv.samples = 1; s.equiv.delta = '2';
    assertDeepEqual(normalizeSummary(s),
      { ok: true, kind: 'equiv', samples: 1, x: 8, n: 100, p0: 0.1, lower: -0.02, upper: 0.02, missing: 0 });
    s.p0 = '1.5';
    assertEqual(normalizeSummary(s).error, 'errP0Range');
  });
  test('columns reuse the 1/2 proportion rules', () => {
    const s = st({ testKind: 'equiv', eventValue: 'b' });
    s.equiv.delta = '10';
    const r = normalizeColumns(s, { ...nonEmpty, response: ['a', 'b', 'b', 'a'], group: ['x', 'x', 'y', 'y'] });
    assertDeepEqual(r, {
      ok: true, kind: 'equiv', samples: 2, x1: 1, n1: 2, x2: 1, n2: 2, lower: -0.1, upper: 0.1,
      groups: ['x', 'y'], missing: 0,
    });
    s.equiv.samples = 1;
    const r1 = normalizeColumns(s, { ...nonEmpty, response: ['a', 'b', 'b', 'a'] });
    assertEqual(r1.samples, 1);
    assertEqual(r1.x, 2);
  });
});

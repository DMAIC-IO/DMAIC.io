import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import {
  parseCount, parseProportion, distinctValues, defaultEventValue,
  normalizeSummary, normalizeColumns, columnValuesOrNull, parsePositive, withColumnLabels,
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
import { buildReport, fmtP, fmtRate } from '../../js/modules/attribute-test/attribute-test-report.js';

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
  const twoNorm = (over = {}) => ({ ok: true, kind: 'two', x1: 30, n1: 400, x2: 18, n2: 380, groups: null, missing: 0, ...over });
  test('two: p ≥ α shows the equivalence note and action, McNemar note always', () => {
    const keep = buildReport(st({ pooled: true }), twoNorm());
    assertTrue(keep.notes.some(n => n.key === 'noteNotEquivalentIsNotEqual'));
    assertTrue(keep.notes.some(n => n.key === 'notePairedUseMcNemar'));
    assertDeepEqual(keep.actions, [{ key: 'actionCheckEquivalence' }]);
    const rej = buildReport(st(), twoNorm({ x1: 30, n1: 200, x2: 10, n2: 200 }));
    assertEqual(rej.decision, 'reject');
    assertTrue(!rej.notes.some(n => n.key === 'noteNotEquivalentIsNotEqual'));
    assertTrue(rej.notes.some(n => n.key === 'notePairedUseMcNemar'));
    assertTrue(rej.actions === undefined);
  });
  test('two: one-sided alternative never shows the equivalence note', () => {
    const r = buildReport(st({ direction: 'greater', pooled: true }), twoNorm());
    assertEqual(r.decision, 'keep');
    assertTrue(!r.notes.some(n => n.key === 'noteNotEquivalentIsNotEqual'));
    assertTrue(r.actions === undefined);
    assertTrue(r.notes.some(n => n.key === 'notePairedUseMcNemar'));
  });
  test('rate1 zero events: CI lower 0, no NaN in any stat value', () => {
    const r = buildReport(st(), { ok: true, kind: 'rate1', x: 0, t: 10, lambda0: 0.2, missing: 0 });
    assertEqual(r.kind, 'rate1');
    assertTrue(r.stats.find(s => s.key === 'ci').value.startsWith('[0.0000,'));
    r.stats.forEach(s => assertTrue(!s.value.includes('NaN'), s.key + ': ' + s.value));
    assertEqual(r.basisKey, 'basisExactPoisson');
    assertTrue(r.notes.some(n => n.key === 'noteRateNormalApprox'));
    assertDeepEqual(r.stats.map(s => s.key), ['counts', 'rate', 'ci', 'pExact', 'z', 'pNormal']);
  });
  test('rate1: large λ₀t has no normal-approximation note', () => {
    const r = buildReport(st(), { ok: true, kind: 'rate1', x: 120, t: 100, lambda0: 1, missing: 0 });
    assertTrue(!r.notes.some(n => n.key === 'noteRateNormalApprox'));
  });
  test('rate2: stats, conditional test only for diff0 = 0, one-sided CI shows ∞', () => {
    const norm = { ok: true, kind: 'rate2', x1: 12, t1: 100, x2: 5, t2: 110, diff0: 0, groups: null, missing: 0 };
    const r = buildReport(st(), norm);
    assertEqual(r.basisKey, 'basisZRate');
    assertTrue(['rate1', 'rate2', 'diff', 'ci', 'z', 'pValue', 'pExactCond', 'ratio', 'ratioCi']
      .every(k => r.stats.some(s => s.key === k)));
    const shifted = buildReport(st(), { ...norm, diff0: 0.02 });
    assertTrue(!shifted.stats.some(s => s.key === 'pExactCond'));
    const one = buildReport(st({ direction: 'greater' }), norm);
    assertTrue(one.stats.find(s => s.key === 'ci').value.endsWith('∞]'));
  });
  test('mcnemar without discordant pairs is a hint', () => {
    const r = buildReport(st(), { ok: true, kind: 'mcnemar', table: [[5, 0], [0, 5]], labels: { before: '', after: '' }, missing: 0 });
    assertDeepEqual(r, { error: 'noteNoDiscordant', hint: true });
  });
  test('mcnemar: stats, small-discordant note, chi-square only two-sided', () => {
    const norm = { ok: true, kind: 'mcnemar', table: [[20, 9], [3, 18]], labels: { before: '', after: '' }, missing: 1 };
    const r = buildReport(st(), norm);
    assertEqual(r.kind, 'mcnemar');
    assertEqual(r.basisKey, 'basisExactMcNemar');
    assertTrue(r.stats.some(s => s.key === 'pChi2Cc'));
    assertTrue(r.notes.some(n => n.key === 'noteMissing'));
    assertTrue(!r.notes.some(n => n.key === 'noteSmallDiscordant'));
    const small = buildReport(st({ direction: 'greater' }), { ...norm, table: [[20, 4], [1, 18]] });
    assertTrue(small.notes.some(n => n.key === 'noteSmallDiscordant'));
    assertTrue(!small.stats.some(s => s.key === 'chi2'));
  });
  test('equiv 0 of 5 vs 0 of 5 is a hint, never equivalent', () => {
    const r = buildReport(st(), { ok: true, kind: 'equiv', samples: 2, x1: 0, n1: 5, x2: 0, n2: 5, lower: -0.01, upper: 0.01, groups: null });
    assertDeepEqual(r, { error: 'noteEquivDegenerate', hint: true });
  });
  test('equiv 2 samples passed: decision equivalent, CI label at 90 %', () => {
    const r = buildReport(st(), { ok: true, kind: 'equiv', samples: 2, x1: 470, n1: 10000, x2: 455, n2: 10000, lower: -0.01, upper: 0.01, groups: null });
    assertEqual(r.kind, 'equiv');
    assertEqual(r.decision, 'equivalent');
    assertEqual(r.basisKey, 'basisTost');
    assertEqual(r.stats.find(s => s.key === 'ci').params.level, 90);
    assertEqual(r.stats.find(s => s.key === 'estimate').value, '0.15');
    assertEqual(r.stats.find(s => s.key === 'bounds').value, '[-1.00; 1.00]');
    assertDeepEqual(r.decisionParams, { lower: '-1.00', upper: '1.00', unit: 'pp', alpha: 0.05 });
    assertTrue(r.notes.some(n => n.key === 'noteEquivBoundsPractical'));
    assertTrue(!r.notes.some(n => n.key === 'noteEquivCiOutside'));
  });
  test('equiv 1 sample: bounds are relative to p₀, failing test says not equivalent', () => {
    const r = buildReport(st(), { ok: true, kind: 'equiv', samples: 1, x: 8, n: 100, p0: 0.05, lower: -0.01, upper: 0.01 });
    assertEqual(r.decision, 'notEquivalent');
    assertEqual(r.stats.find(s => s.key === 'bounds').value, '[4.00; 6.00]');
    assertTrue(r.notes.some(n => n.key === 'noteEquivCiOutside'));
    assertEqual(r.decisionParams.unit, '%');
    assertEqual(r.stats.find(s => s.key === 'estimate').value, '8.00');
    assertDeepEqual(r.stats.find(s => s.key === 'counts'), { key: 'counts', labelKey: 'statCounts', value: '8 / 100' });
  });
  test('equiv 2 samples: group names and counts, unit pp', () => {
    const r = buildReport(st(), { ok: true, kind: 'equiv', samples: 2, x1: 470, n1: 10000, x2: 455, n2: 10000, lower: -0.01, upper: 0.01, groups: ['Lieferant A', 'Lieferant B'] });
    assertDeepEqual(r.stats.slice(0, 2), [
      { key: 'counts1', labelKey: 'statCountsGroup', params: { group: 'Lieferant A' }, value: '470 / 10000' },
      { key: 'counts2', labelKey: 'statCountsGroup', params: { group: 'Lieferant B' }, value: '455 / 10000' },
    ]);
    assertEqual(r.decisionParams.unit, 'pp');
    assertEqual(r.stats.find(s => s.key === 'bounds').params.unit, 'pp');
  });
  test('rate1: small rate keeps four significant digits, exposure has no float noise', () => {
    const r = buildReport(st(), { ok: true, kind: 'rate1', x: 2, t: 50000, lambda0: 0.0001, missing: 0 });
    assertEqual(r.stats.find(s => s.key === 'rate').value, '0.00004000');
    assertTrue(r.stats.find(s => s.key === 'ci').value.startsWith('[4.844e-6, 0.0001445]'));
    const noisy = buildReport(st(), { ok: true, kind: 'rate1', x: 3, t: 0.1 * 3, lambda0: 1, missing: 0 });
    assertEqual(noisy.stats.find(s => s.key === 'counts').value, '3 / 0.3');
  });
  test('fmtRate: decimals, exponent fallback, non-finite', () => {
    assertEqual(fmtRate(37 / 120), '0.3083');
    assertEqual(fmtRate(12.34567), '12.3457');
    assertEqual(fmtRate(0), '0.0000');
    assertEqual(fmtRate(2e-7), '2.000e-7');
    assertEqual(fmtRate(-0.00123456), '-0.001235');
    assertEqual(fmtRate(0.00456), '0.004560'); // [0.001, 0.01): mag -3 gives 6 decimals
    assertEqual(fmtRate(null), '–');
  });
  test('rate2: one-sided less CI shows −∞', () => {
    const r = buildReport(st({ direction: 'less' }), { ok: true, kind: 'rate2', x1: 12, t1: 100, x2: 5, t2: 110, diff0: 0, groups: null, missing: 0 });
    const v = r.stats.find(s => s.key === 'ci').value;
    assertTrue(v.startsWith('[−∞,'), v);
    assertTrue(r.stats.find(s => s.key === 'ratioCi').value.startsWith('[0'));
  });
  test('rate2: no events anywhere with a non-zero difference is a hint', () => {
    const r = buildReport(st(), { ok: true, kind: 'rate2', x1: 0, t1: 10, x2: 0, t2: 12, diff0: 0.05, groups: null, missing: 0 });
    assertDeepEqual(r, { error: 'noteRateNotTestable', hint: true });
    const zero = buildReport(st(), { ok: true, kind: 'rate2', x1: 0, t1: 10, x2: 0, t2: 12, diff0: 0, groups: null, missing: 0 });
    assertEqual(zero.kind, 'rate2');
  });
  test('i18n: every key used by buildReport exists in de and en', async () => {
    const reports = [
      buildReport(st({ pooled: true }), twoNorm()),
      buildReport(st(), { ok: true, kind: 'one', x: 0, n: 30, p0: 0.1, missing: 1 }),
      buildReport(st(), { ok: true, kind: 'rate1', x: 0, t: 10, lambda0: 0.2, missing: 0 }),
      buildReport(st(), { ok: true, kind: 'rate2', x1: 12, t1: 100, x2: 5, t2: 110, diff0: 0, groups: null, missing: 0 }),
      buildReport(st(), { ok: true, kind: 'mcnemar', table: [[20, 4], [1, 18]], labels: { before: '', after: '' }, missing: 0 }),
      buildReport(st(), { ok: true, kind: 'equiv', samples: 2, x1: 470, n1: 10000, x2: 455, n2: 10000, lower: -0.01, upper: 0.01, groups: null }),
      buildReport(st(), { ok: true, kind: 'equiv', samples: 1, x: 8, n: 100, p0: 0.05, lower: -0.01, upper: 0.01 }),
      buildReport(st(), { ok: true, kind: 'mcnemar', table: [[5, 0], [0, 5]], labels: {}, missing: 0 }),
      buildReport(st(), { ok: true, kind: 'rate2', x1: 0, t1: 10, x2: 0, t2: 12, diff0: 0.05, groups: null, missing: 0 }),
      buildReport(st(), { ok: true, kind: 'equiv', samples: 2, x1: 0, n1: 5, x2: 0, n2: 5, lower: -0.01, upper: 0.01, groups: null }),
    ];
    const keys = new Set([
      'decisionReject', 'decisionKeep', 'decisionEquivalent', 'decisionNotEquivalent',
      'h0Rate1', 'h1Rate1', 'h0Rate2', 'h1Rate2', 'h0McNemar', 'h1McNemar', 'h0Equiv', 'h1Equiv',
      'errExposure', 'errLambda0', 'errDiff0', 'errPairsLength', 'errPairLevels',
      'hintEnterBounds', 'errBoundsOrder', 'errBoundsContain', 'errBoundsContainOne',
      'deltaOne', 'boundLowerOne', 'boundUpperOne',
    ]);
    for (const r of reports) {
      if (r.error) keys.add(r.error);
      if (r.basisKey) keys.add(r.basisKey);
      (r.stats || []).forEach(s => keys.add(s.labelKey));
      (r.notes || []).forEach(n => keys.add(n.key));
      (r.actions || []).forEach(a => keys.add(a.key));
    }
    for (const lang of ['de', 'en']) {
      const dict = (await (await fetch(new URL(`../../i18n/${lang}.json`, import.meta.url))).json()).modules['attribute-test'];
      const missing = [...keys].filter(k => typeof dict[k] !== 'string' || dict[k] === '');
      assertDeepEqual(missing, [], `${lang} is missing keys`);
    }
  });
  test('fmtP', () => {
    assertEqual(fmtP(0.00001), '< 0.0001');
    assertEqual(fmtP(0.5), '0.5000');
  });
});

const noCols = { response: null, group: null, rowVar: null, colVar: null, counts: null, before: null, after: null };
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
    const r = normalizeColumns(s, { ...noCols, counts: [2, '', 0, 3] });
    assertDeepEqual(r, { ok: true, kind: 'rate1', x: 5, t: 7.5, lambda0: 1, missing: 1 });
  });
  test('rate1 columns: negative count and bad exposure', () => {
    const s = st({ testKind: 'rate1' }, { lambda0: '1' });
    assertEqual(normalizeColumns(s, { ...noCols, counts: [2, -1] }).error, 'errCountInvalid');
    s.exposurePerRow = '0';
    assertEqual(normalizeColumns(s, { ...noCols, counts: [2, 1] }).error, 'errExposure');
    assertEqual(normalizeColumns(s, noCols).hint, true);
  });
  test('rate1 columns: all-blank counts column is an exposure error', () => {
    const s = st({ testKind: 'rate1' }, { lambda0: '1' });
    assertEqual(normalizeColumns(s, { ...noCols, counts: ['', null] }).error, 'errExposure');
  });
  test('rate2: unparsable diff0 is errDiff0', () => {
    const s = st({ testKind: 'rate2' }, { x1: '1', t1: '1', x2: '1', t2: '1', diff0: 'abc' });
    assertEqual(normalizeSummary(s).error, 'errDiff0');
    assertEqual(normalizeColumns(s, { ...noCols, counts: [1, 2], group: ['A', 'B'] }).error, 'errDiff0');
    assertEqual(normalizeColumns(s, { ...noCols, counts: ['', ''], group: ['A', 'B'] }).error, 'errGroupLevels');
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
      ...noCols, counts: [1, 2, 3, '', 4], group: ['A', 'A', 'B', 'B', 'B'],
    });
    assertDeepEqual(r, { ok: true, kind: 'rate2', x1: 3, t1: 4, x2: 7, t2: 4, diff0: 0, groups: ['A', 'B'], missing: 1 });
    assertEqual(normalizeColumns(s, { ...noCols, counts: [1, 2, 3], group: ['A', 'B', 'C'] }).error, 'errGroupLevels');
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
    const r = normalizeColumns(s, { ...noCols, before: ['a', 'b', 'a'], after: ['a', 'b'] });
    assertEqual(r.error, 'errPairsLength');
  });
  test('columns: trailing blanks are trimmed before comparing lengths', () => {
    const s = st({ testKind: 'mcnemar', eventValue: 'a' });
    const r = normalizeColumns(s, { ...noCols, before: ['a', 'b', 'a', ''], after: ['a', 'b', 'b'] });
    assertEqual(r.ok, true);
    assertDeepEqual(r.table, [[1, 1], [0, 1]]);
  });
  test('columns: one column constant, union has two levels → ok', () => {
    const s = st({ testKind: 'mcnemar', eventValue: 'i.O.' });
    const r = normalizeColumns(s, {
      ...noCols,
      before: ['n.i.O.', 'n.i.O.', 'n.i.O.', 'n.i.O.'],
      after: ['i.O.', 'n.i.O.', '', 'i.O.'],
    });
    assertDeepEqual(r, {
      ok: true, kind: 'mcnemar', table: [[0, 0], [2, 1]], labels: { before: '', after: '' }, missing: 1,
    });
  });
  test('columns: union with three levels → errPairLevels', () => {
    const s = st({ testKind: 'mcnemar' });
    assertEqual(normalizeColumns(s, { ...noCols, before: ['a', 'b'], after: ['c', 'a'] }).error, 'errPairLevels');
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
    assertDeepEqual(normalizeSummary(s), { ok: false, error: 'hintEnterBounds', hint: true });
    s.equiv.lower = '2'; s.equiv.upper = '1';
    assertEqual(normalizeSummary(s).error, 'errBoundsOrder');
    s.equiv.lower = '0,5'; s.equiv.upper = '1';
    assertEqual(normalizeSummary(s).error, 'errBoundsContain');
    s.equiv.lower = '-0,5';
    assertEqual(normalizeSummary(s).lower, -0.005);
  });
  test('bounds: missing is a hint, 1 sample containment error names p₀', () => {
    const s = st({ testKind: 'equiv' }, { x1: '5', n1: '100', x2: '6', n2: '100' });
    assertEqual(normalizeSummary(s).hint, true);
    assertEqual(normalizeSummary(s).error, 'hintEnterBounds');
    const one = st({ testKind: 'equiv', p0: '0,1' }, { x: '8', n: '100' });
    one.equiv.samples = 1; one.equiv.symmetric = false; one.equiv.lower = '1'; one.equiv.upper = '2';
    assertEqual(normalizeSummary(one).error, 'errBoundsContainOne');
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
    const r = normalizeColumns(s, { ...noCols, response: ['a', 'b', 'b', 'a'], group: ['x', 'x', 'y', 'y'] });
    assertDeepEqual(r, {
      ok: true, kind: 'equiv', samples: 2, x1: 1, n1: 2, x2: 1, n2: 2, lower: -0.1, upper: 0.1,
      groups: ['x', 'y'], missing: 0,
    });
    s.equiv.samples = 1;
    const r1 = normalizeColumns(s, { ...noCols, response: ['a', 'b', 'b', 'a'] });
    assertEqual(r1.samples, 1);
    assertEqual(r1.x, 2);
  });
});

suite('attribute-test follow-ups — pooled note, McNemar labels', () => {
  const st = (over = {}) => ({ direction: 'two-sided', alpha: 0.05, pooled: false, ratePooled: false, ...over });
  const rate2 = { ok: true, kind: 'rate2', x1: 12, t1: 100, x2: 5, t2: 110, diff0: 0, groups: null, missing: 0 };
  const pair = (labels) => ({ ok: true, kind: 'mcnemar', table: [[20, 9], [3, 18]], labels, missing: 0 });
  const stat = (r, key) => r.stats.find(s => s.key === key);

  test('rate2: pooled note only when ratePooled and diff0 ≠ 0', () => {
    const has = (r) => r.notes.some(n => n.key === 'noteRatePooledIgnored');
    assertTrue(has(buildReport(st({ ratePooled: true }), { ...rate2, diff0: 0.02 })));
    assertTrue(!has(buildReport(st({ ratePooled: true }), rate2)));
    assertTrue(!has(buildReport(st({ ratePooled: false }), { ...rate2, diff0: 0.02 })));
  });
  test('mcnemar: empty labels keep the before/after keys', () => {
    const r = buildReport(st(), pair({ before: '', after: '' }));
    assertEqual(stat(r, 'pBefore').labelKey, 'statPBefore');
    assertEqual(stat(r, 'pAfter').labelKey, 'statPAfter');
  });
  test('mcnemar: labels become key params', () => {
    const r = buildReport(st(), pair({ before: 'Alt', after: ' Neu ' }));
    assertEqual(stat(r, 'pBefore').labelKey, 'statPBeforeLabeled');
    assertDeepEqual(stat(r, 'pBefore').params, { label: 'Alt' });
    assertEqual(stat(r, 'pAfter').labelKey, 'statPAfterLabeled');
    assertDeepEqual(stat(r, 'pAfter').params, { label: 'Neu' });
  });
  test('mcnemar: a label on one side only labels just that side', () => {
    const r = buildReport(st(), pair({ before: 'Alt', after: '' }));
    assertEqual(stat(r, 'pBefore').labelKey, 'statPBeforeLabeled');
    assertEqual(stat(r, 'pAfter').labelKey, 'statPAfter');
  });
  test('withColumnLabels: column names fill empty labels, explicit labels win', () => {
    const norm = pair({ before: '', after: 'X' });
    assertDeepEqual(withColumnLabels(norm, { before: 'Col A', after: 'Col B' }).labels, { before: 'Col A', after: 'X' });
    assertEqual(withColumnLabels({ error: 'e' }, { before: 'a', after: 'b' }).error, 'e');
    assertDeepEqual(withColumnLabels(norm, {}).labels, { before: '', after: 'X' });
  });
  test('i18n: new keys exist in de and en', async () => {
    const keys = ['noteRatePooledIgnored', 'statPBeforeLabeled', 'statPAfterLabeled', 'h0McNemarLabeled', 'h1McNemarLabeled', 'fallbackBefore', 'fallbackAfter'];
    for (const lang of ['de', 'en']) {
      const dict = (await (await fetch(new URL(`../../i18n/${lang}.json`, import.meta.url))).json()).modules['attribute-test'];
      assertDeepEqual(keys.filter(k => typeof dict[k] !== 'string' || dict[k] === ''), [], `${lang} is missing keys`);
    }
  });
  test('i18n: labeled keys carry their placeholders in de and en', async () => {
    const placeholders = {
      statPBeforeLabeled: ['{label}'],
      statPAfterLabeled: ['{label}'],
      h0McNemarLabeled: ['{before}', '{after}'],
      h1McNemarLabeled: ['{before}', '{after}', '{op}'],
    };
    for (const lang of ['de', 'en']) {
      const dict = (await (await fetch(new URL(`../../i18n/${lang}.json`, import.meta.url))).json()).modules['attribute-test'];
      const missing = Object.entries(placeholders).flatMap(([k, ps]) => ps.filter(p => !String(dict[k]).includes(p)).map(p => `${k} ${p}`));
      assertDeepEqual(missing, [], `${lang} lacks placeholders`);
    }
  });
});

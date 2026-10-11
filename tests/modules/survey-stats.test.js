/**
 * D.Mike — Survey statistics tests (survey-stats.test.js)
 * Counts, means, medians, "n/a", filter, grouping, ranking and Kano against
 * hand-computed values.
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md §6.2, §7
 */

import { suite, test, assertEqual, assertTrue, assertDeepEqual, assertClose } from '../test-utils.js';
import {
  mean, median, filterResponses, questionStats, responseRate, ratingRanking,
  kanoOverview, freeTextSummary, groupComparison,
} from '../../js/modules/survey-builder/survey-stats.js';

const q = (id, type, extra) => ({ id, type, text: id.toUpperCase(), hint: '', required: false, when: null, ...extra });
export const SURVEY = {
  id: 's1', version: 1, lang: 'de', title: 'T', intro: '', contact: '', anonymous: false,
  sections: [{
    id: 'sec', title: '', hint: '', when: null, questions: [
      q('g', 'single', { options: [{ id: 'ga', text: 'A' }, { id: 'gb', text: 'B' }], other: false }),
      q('m', 'multi', { options: [{ id: 'm1', text: 'M1' }, { id: 'm2', text: 'M2' }], other: true }),
      q('c', 'single', { options: [{ id: 'c1', text: 'C1' }], other: false, when: [{ questionId: 'g', optionIds: ['ga'] }] }),
      q('r', 'rating', { rows: [{ id: 'r1', text: 'R1' }, { id: 'r2', text: 'R2' }], noAnswer: true }),
      q('k', 'kano', { rows: [{ id: 'k1', text: 'K1' }], importance: true }),
      q('t', 'text', { multiline: true }),
      q('i', 'info', {}),
    ],
  }],
};
const resp = (id, answers, extra = {}) => ({
  id, surveyVersion: 1, recipientId: null, viaRecipient: false,
  submittedAt: `2026-10-0${id.slice(1)}T10:00:00Z`, answers, ...extra,
});
// x4 carries an answer to the hidden question c (g = gb) — stats must ignore it.
export const RESPONSES = [
  resp('x1', { g: 'ga', m: { ids: ['m1', 'm2'], other: null }, c: 'c1', r: { r1: 5, r2: 2 }, k: { k1: { f: 1, d: 5, w: 9 } }, t: 'Faster' },
    { recipientId: 'p1', viaRecipient: true }),
  resp('x2', { g: 'ga', m: { ids: ['m1'], other: 'Fax' }, r: { r1: 4, r2: 'na' }, k: { k1: { f: 1, d: 5, w: 7 } } }),
  resp('x3', { g: 'gb', m: { ids: [], other: 'Mail' }, r: { r1: 3, r2: 2 }, k: { k1: { f: 2, d: 3, w: 5 } }, t: '  ' }),
  resp('x4', { g: 'gb', c: 'c1', r: { r1: 2 }, k: { k1: { f: 2, d: 3, w: null } } }),
  resp('x5', { g: 'ga', r: { r1: 1 }, k: { k1: { f: 1, d: 5, w: 8 } } }),
];
const question = (id) => SURVEY.sections[0].questions.find((x) => x.id === id);
const stats = (id, list = RESPONSES) => questionStats(SURVEY, question(id), list);

suite('survey-stats — helpers', () => {
  test('mean and median', () => {
    assertEqual(mean([]), null);
    assertEqual(median([]), null);
    assertEqual(mean([1, 2, 6]), 3);
    assertEqual(median([5, 1, 3]), 3);
    assertEqual(median([4, 1, 3, 2]), 2.5);
  });
});

suite('survey-stats — questionStats', () => {
  test('single: counts and shares on all responses', () => {
    const s = stats('g');
    assertEqual(s.n, 5);
    assertEqual(s.answered, 5);
    assertDeepEqual(s.options.map((o) => [o.id, o.count]), [['ga', 3], ['gb', 2]]);
    assertClose(s.options[0].share, 0.6, 1e-9);
  });

  test('multi: counts, shares and other texts', () => {
    const s = stats('m');
    assertEqual(s.n, 5);
    assertEqual(s.answered, 3);
    assertDeepEqual(s.options.map((o) => o.count), [2, 1]);
    assertClose(s.options[1].share, 0.2, 1e-9);
    assertEqual(s.otherCount, 2);
    assertDeepEqual(s.otherTexts.map((o) => [o.responseId, o.text]), [['x2', 'Fax'], ['x3', 'Mail']]);
  });

  test('conditional question: base is only responses where it was visible', () => {
    const s = stats('c');
    assertEqual(s.n, 3, 'x1, x2, x5 saw c; x4 answered it while hidden');
    assertEqual(s.options[0].count, 1);
    assertClose(s.options[0].share, 1 / 3, 1e-9);
  });

  test('rating: n, mean, median, distribution, n/a, share of 4–5', () => {
    const [r1, r2] = stats('r').rows;
    assertEqual(r1.n, 5);
    assertEqual(r1.mean, 3);
    assertEqual(r1.median, 3);
    assertDeepEqual(r1.dist, [1, 1, 1, 1, 1]);
    assertEqual(r1.na, 0);
    assertClose(r1.topShare, 0.4, 1e-9);
    assertEqual(r2.n, 2);
    assertEqual(r2.mean, 2);
    assertDeepEqual(r2.dist, [0, 2, 0, 0, 0]);
    assertEqual(r2.na, 1);
    assertEqual(r2.topShare, 0);
  });

  test('kano: category, CS, DS, importance via the engine', () => {
    const s = stats('k');
    assertEqual(s.n, 5);
    const row = s.rows[0];
    assertEqual(row.id, 'k1');
    assertEqual(row.text, 'K1');
    assertEqual(row.category, 'O');
    assertDeepEqual(row.counts, { M: 0, O: 3, A: 0, I: 2, R: 0, Q: 0 });
    assertClose(row.cs, 0.6, 1e-9);
    assertClose(row.ds, -0.6, 1e-9);
    assertClose(row.importanceMean, 7.25, 1e-9);
  });

  test('text: blank answers are not listed', () => {
    const s = stats('t');
    assertEqual(s.n, 5);
    assertDeepEqual(s.answers, [{ responseId: 'x1', recipientId: 'p1', text: 'Faster' }]);
  });

  test('info has no stats', () => {
    assertEqual(stats('i'), null);
  });

  test('no responses: shares and means are null, not NaN', () => {
    const s = stats('g', []);
    assertEqual(s.n, 0);
    assertEqual(s.options[0].share, null);
    assertEqual(stats('r', []).rows[0].mean, null);
  });
});

suite('survey-stats — filter', () => {
  test('no filter returns all', () => {
    assertEqual(filterResponses(SURVEY, RESPONSES, null).length, 5);
  });
  test('filter by option', () => {
    assertDeepEqual(filterResponses(SURVEY, RESPONSES, { questionId: 'g', optionId: 'ga' }).map((r) => r.id), ['x1', 'x2', 'x5']);
  });
  test('a hidden answer never matches the filter', () => {
    assertDeepEqual(filterResponses(SURVEY, RESPONSES, { questionId: 'c', optionId: 'c1' }).map((r) => r.id), ['x1']);
  });
  test('filter on multi', () => {
    assertDeepEqual(filterResponses(SURVEY, RESPONSES, { questionId: 'm', optionId: 'm2' }).map((r) => r.id), ['x1']);
  });
});

suite('survey-stats — summary', () => {
  const recipients = [
    { id: 'p1', name: 'Anna', group: 'Kunde', sentAt: '2026-10-01', sentVersion: 1 },
    { id: 'p2', name: 'Ben', group: 'Kunde', sentAt: '2026-10-01', sentVersion: 1 },
    { id: 'p3', name: 'Cem', group: '', sentAt: null, sentVersion: null },
    { id: 'p4', name: 'Dora', group: ' Lieferant ', sentAt: '2026-10-02', sentVersion: 1 },
  ];

  test('response rate overall, per group, and without recipient', () => {
    const rate = responseRate({ recipients, responses: RESPONSES, answeredRecipientIds: ['p1'] });
    assertEqual(rate.sent, 3);
    assertEqual(rate.answered, 1);
    assertClose(rate.rate, 1 / 3, 1e-9);
    assertEqual(rate.withoutRecipient, 4);
    assertDeepEqual(rate.groups, [
      { group: 'Kunde', sent: 2, answered: 1, rate: 0.5 },
      { group: 'Lieferant', sent: 1, answered: 0, rate: 0 },
    ]);
  });

  test('response rate with nothing sent is null, not NaN', () => {
    assertEqual(responseRate({ recipients: [], responses: [], answeredRecipientIds: [] }).rate, null);
  });

  test('rating ranking by mean, descending', () => {
    const rank = ratingRanking(SURVEY, RESPONSES);
    assertDeepEqual(rank.map((r) => [r.rowId, r.mean, r.n]), [['r1', 3, 5], ['r2', 2, 2]]);
    assertEqual(rank[0].questionText, 'R');
    assertClose(rank[0].topShare, 0.4, 1e-9);
  });

  test('kano overview lists every kano row', () => {
    const rows = kanoOverview(SURVEY, RESPONSES);
    assertEqual(rows.length, 1);
    assertEqual(rows[0].questionId, 'k');
    assertEqual(rows[0].rowId, 'k1');
    assertEqual(rows[0].category, 'O');
    assertClose(rows[0].ds, -0.6, 1e-9);
  });

  test('free text: text answers plus other texts, taken ones counted', () => {
    assertDeepEqual(freeTextSummary(SURVEY, RESPONSES, ['x2:m', 'gone:t']), { total: 3, taken: 1 });
  });
});

suite('survey-stats — group comparison', () => {
  const cmp = () => groupComparison(SURVEY, RESPONSES, 'g');
  const part = (id) => cmp().questions.find((x) => x.questionId === id);

  test('groups are the options of the grouping question', () => {
    assertDeepEqual(cmp().groups, [
      { id: 'ga', text: 'A', n: 3, few: true },
      { id: 'gb', text: 'B', n: 2, few: true },
    ]);
  });

  test('the grouping question itself, text and info are not compared', () => {
    assertDeepEqual(cmp().questions.map((x) => x.questionId), ['m', 'c', 'r', 'k']);
  });

  test('choice shares per group; a group that never saw the question has null', () => {
    const m = part('m');
    assertClose(m.options[0].shares[0], 2 / 3, 1e-9);
    assertEqual(m.options[0].shares[1], 0);
    assertEqual(part('c').options[0].shares[1], null);
  });

  test('rating cells deviating by at least 0.5 are flagged', () => {
    const [r1, r2] = part('r').rows;
    assertEqual(r1.overall, 3);
    assertClose(r1.cells[0].mean, 10 / 3, 1e-9);
    assertEqual(r1.cells[0].deviates, false);
    assertEqual(r1.cells[1].mean, 2.5);
    assertEqual(r1.cells[1].deviates, true, 'exactly 0.5 counts');
    assertEqual(r2.cells[0].deviates, false);
  });

  test('kano category per group; differing rows are marked', () => {
    const row = part('k').rows[0];
    assertDeepEqual(row.categories, ['O', 'I']);
    assertEqual(row.differs, true);
  });

  test('grouping by a non-single question returns null', () => {
    assertEqual(groupComparison(SURVEY, RESPONSES, 'm'), null);
    assertEqual(groupComparison(SURVEY, RESPONSES, 'nope'), null);
  });

  test('few is false from five responses on', () => {
    const many = [...RESPONSES, resp('x6', { g: 'ga' }), resp('x7', { g: 'ga' })];
    assertTrue(!groupComparison(SURVEY, many, 'g').groups[0].few);
  });
});

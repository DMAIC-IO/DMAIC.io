/**
 * D.Mike — Survey statistics tests (survey-stats.test.js)
 * Counts, means, medians, "n/a", filter, grouping, ranking and Kano against
 * hand-computed values.
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md §6.2, §7
 */

import { suite, test, assertEqual, assertTrue, assertDeepEqual, assertClose } from '../test-utils.js';
import {
  mean, median, filterResponses, questionStats, responseRate, ratingRanking,
  kanoOverview, freeTextSummary, groupComparison, worksheetColumns,
} from '../../js/modules/survey-builder/survey-stats.js';
import { SURVEY, RESPONSES, q, resp } from './fixtures/survey-fixture.js';

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

  test('response rate: an answerer never marked sent counts as sent, rate stays <= 1', () => {
    const list = [
      { id: 'p1', name: 'Anna', group: 'Kunde', sentAt: '2026-10-01', sentVersion: 1 },
      { id: 'p2', name: 'Ben', group: 'Kunde', sentAt: null, sentVersion: null },
      { id: 'p3', name: 'Cem', group: '', sentAt: null, sentVersion: null },
    ];
    const rate = responseRate({ recipients: list, responses: [], answeredRecipientIds: ['p1', 'p2'] });
    assertEqual(rate.sent, 2);
    assertEqual(rate.answered, 2);
    assertEqual(rate.rate, 1);
    assertDeepEqual(rate.groups, [{ group: 'Kunde', sent: 2, answered: 2, rate: 1 }]);
    const lone = responseRate({ recipients: [list[1]], responses: [], answeredRecipientIds: ['p2'] });
    assertEqual(lone.sent, 1);
    assertTrue(lone.rate <= 1);
  });

  test('rating ranking: nulls last, document order on ties', () => {
    const survey = {
      ...SURVEY,
      sections: [{
        id: 'sec', title: '', hint: '', when: null, questions: [
          q('qa', 'rating', { rows: [{ id: 'a1', text: 'A1' }, { id: 'a2', text: 'A2' }], noAnswer: true }),
          q('r', 'rating', { rows: [{ id: 'r1', text: 'R1' }, { id: 'r2', text: 'R2' }], noAnswer: true }),
          q('qb', 'rating', { rows: [{ id: 'b1', text: 'B1' }], noAnswer: true }),
        ],
      }],
    };
    const responses = [resp('x1', { r: { r1: 3, r2: 3 } })];
    assertDeepEqual(ratingRanking(survey, responses).map((r) => r.rowId), ['r1', 'r2', 'a1', 'a2', 'b1']);
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

suite('survey-stats — worksheetColumns', () => {
  const STRINGS = {
    responseId: 'Antwort-ID', submittedAt: 'Eingang', recipient: 'Empfänger', other: 'Sonstiges',
    functional: 'F', dysfunctional: 'D', importance: 'W', category: 'Kategorie', question: 'Frage',
  };
  const recipients = [{ id: 'p1', name: 'Anna' }];
  const two = RESPONSES.slice(0, 2);
  const cols = (survey = SURVEY) => worksheetColumns(survey, two, recipients, STRINGS);

  test('column names in document order', () => {
    assertDeepEqual(cols().map((c) => c.name), [
      'Antwort-ID', 'Eingang', 'Empfänger', 'G', 'M: M1', 'M: M2', 'M: Sonstiges', 'C',
      'R: R1', 'R: R2', 'K1 (F)', 'K1 (D)', 'K1 (W)', 'K1 (Kategorie)', 'T',
    ]);
  });

  test('values per type', () => {
    const v = Object.fromEntries(cols().map((c) => [c.name, c.values]));
    assertDeepEqual(v['Antwort-ID'], ['x1', 'x2']);
    assertDeepEqual(v.Eingang, ['2026-10-01T10:00:00Z', '2026-10-02T10:00:00Z']);
    assertDeepEqual(v['Empfänger'], ['Anna', null]);
    assertDeepEqual(v.G, ['A', 'A']);
    assertDeepEqual(v['M: M1'], [1, 1]);
    assertDeepEqual(v['M: M2'], [1, 0]);
    assertDeepEqual(v['M: Sonstiges'], [null, 'Fax']);
    assertDeepEqual(v.C, ['C1', null]);
    assertDeepEqual(v['R: R2'], [2, null]);
    assertDeepEqual(v['K1 (W)'], [9, 7]);
    assertDeepEqual(v['K1 (Kategorie)'], ['O', 'O']);
    assertDeepEqual(v.T, ['Faster', null]);
  });

  test('types: 0/1, ratings and kano answers are numeric', () => {
    const t = Object.fromEntries(cols().map((c) => [c.name, c.type]));
    assertEqual(t['M: M1'], 'numeric');
    assertEqual(t['R: R1'], 'numeric');
    assertEqual(t['K1 (F)'], 'numeric');
    assertEqual(t.G, 'text');
    assertEqual(t['K1 (Kategorie)'], 'text');
  });

  test('a question hidden for a response gives null, not 0', () => {
    const hidden = worksheetColumns(SURVEY, [RESPONSES[3]], [], STRINGS);
    assertDeepEqual(hidden.find((c) => c.name === 'C').values, [null]);
  });

  test('anonymous survey has no recipient column', () => {
    const names = cols({ ...SURVEY, anonymous: true }).map((c) => c.name);
    assertTrue(!names.includes('Empfänger'));
    assertEqual(names.length, 14);
  });

  test('empty question text falls back to "Frage <n>"', () => {
    const s = JSON.parse(JSON.stringify(SURVEY));
    s.sections[0].questions[0].text = '  ';
    assertEqual(worksheetColumns(s, two, [], STRINGS)[3].name, 'Frage 1');
  });
});

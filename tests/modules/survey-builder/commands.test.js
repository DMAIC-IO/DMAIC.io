/**
 * Tests for the commands of js/modules/survey-builder/domain/model.js. Each
 * command has the effect of the method of the earlier model it replaces
 * (frozen in fixtures/legacy-oracles.json): both start from the same stored
 * state, the earlier result is loaded through the migration and compared by `toJSON()`
 * — including `dirtyStructure`. Plus the checks the earlier viewmodels made
 * (unknown ids, flags of the type) and the questions before deleting.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows } from '../../test-utils.js';
import { confirmOf } from '../../../js/core/model.js';
import { MIXED, EXAMPLE, copy, load, expected, both, swapId, canon, frozen } from './cases.js';

/** @param {() => void} fn @returns {any} the thrown error */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

/** A response file of MIXED's survey. */
function responseFile(over = {}) {
  return JSON.stringify({
    format: 'dmike-survey-response', formatVersion: 1, surveyId: 'sv-1', surveyVersion: 2,
    responseId: 'resp-new', submittedAt: '2026-11-01T10:00:00.000Z', recipientId: 'rec-b',
    answers: { q1: 'o2', q2: { ids: ['m1', 'zz'], other: '' }, q3: { r1: 3 }, q4: { k2: { f: 1, d: 2, w: 9 } }, q5: ' Hallo ', gone: 1 },
    ...over,
  });
}

suite('survey-builder commands — header', () => {
  test('setHeader writes title, intro, contact without marking the structure', () => {
    for (const field of ['title', 'intro', 'contact']) {
      const r = both(`setHeader ${field}`, MIXED, (l) => l.setHeader(field, 'Neu'), (m) => m.setHeader({ field, value: 'Neu' }));
      assertDeepEqual(r.got, r.want, field);
      assertEqual(r.m.dirtyStructure, false);
    }
  });

  test('setHeader rejects lang and anonymous (own commands)', () => {
    assertEqual(thrown(() => load(MIXED).setHeader({ field: 'lang', value: 'en' })).param, 'field');
  });

  test('setSurveyLanguage', () => {
    const r = both('setSurveyLanguage', MIXED, (l) => l.setHeader('lang', 'en'), (m) => m.setSurveyLanguage({ lang: 'en' }));
    assertDeepEqual(r.got, r.want);
    assertEqual(thrown(() => load(MIXED).setSurveyLanguage({ lang: 'fr' })).param, 'lang');
  });

  test('setAnonymous', () => {
    const r = both('setAnonymous', MIXED, (l) => l.setHeader('anonymous', true), (m) => m.setAnonymous({ anonymous: true }));
    assertDeepEqual(r.got, r.want);
    assertEqual(r.m.survey.anonymous, true);
  });
});

suite('survey-builder commands — sections', () => {
  test('addSection appends an empty section and marks the structure', () => {
    const r = both('addSection', MIXED, (l) => l.addSection(), (m) => m.addSection());
    assertDeepEqual(swapId(r.got, r.mr, r.lr), r.want);
    assertEqual(r.m.dirtyStructure, true);
  });

  test('setSectionField writes title and hint, never structural', () => {
    for (const field of ['title', 'hint']) {
      const r = both(`setSectionField ${field}`, MIXED, (l) => l.updateSection('s2', field, 'X'), (m) => m.setSectionField({ sectionId: 's2', field, value: 'X' }));
      assertDeepEqual(r.got, r.want, field);
      assertEqual(r.m.dirtyStructure, false);
    }
  });

  test('moveSection down drops the conditions that now point forward', () => {
    const r = both('moveSection down', MIXED, (l) => l.moveSection('s1', 1), (m) => m.moveSection({ sectionId: 's1', direction: 'down' }));
    assertDeepEqual(r.got, r.want);
    assertDeepEqual(r.mr, r.lr);
    assertEqual(r.mr.removedConditions, 1);
  });

  test('moveSection up at the start changes nothing', () => {
    const before = load(MIXED).toJSON();
    const m = load(MIXED);
    assertDeepEqual(m.moveSection({ sectionId: 's1', direction: 'up' }), { removedConditions: 0 });
    assertDeepEqual(m.toJSON(), before);
  });

  test('removeSection removes its questions, their conditions, selection, filter and grouping', () => {
    const r = both('removeSection', MIXED, (l) => l.deleteSection('s1'), (m) => m.removeSection({ sectionId: 's1' }));
    assertDeepEqual(r.got, r.want);
    assertDeepEqual(r.mr, r.lr);
    assertEqual(r.m.selectedQuestionId, null);
    assertEqual(r.m.ui.filter, null);
    assertEqual(r.m.ui.groupBy, null);
  });

  test('removeSection asks with the number of questions, an empty section without asking', () => {
    const m = load(MIXED);
    assertDeepEqual(confirmOf(m, 'removeSection', { sectionId: 's2' }), { key: 'confirmSectionDelete', params: { count: 4 } });
    const id = m.addSection();
    assertEqual(confirmOf(m, 'removeSection', { sectionId: id }), null);
  });
});

suite('survey-builder commands — questions', () => {
  test('addQuestion appends a question of the type with its fields and selects it', () => {
    for (const type of ['single', 'multi', 'rating', 'kano', 'text', 'info']) {
      const r = both(`addQuestion ${type}`, MIXED, (l) => l.addQuestion('s1', type), (m) => m.addQuestion({ sectionId: 's1', type }));
      assertDeepEqual(swapId(r.got, r.mr, r.lr), r.want, type);
      assertEqual(r.m.selectedQuestionId, r.mr);
    }
  });

  test('moveQuestion within a section and across the section boundary', () => {
    for (const [id, dir] of [['q2', 'up'], ['q2', 'down'], ['q3', 'up'], ['q4', 'down']]) {
      const r = both(`moveQuestion ${id} ${dir}`, MIXED, (l) => l.moveQuestion(id, dir === 'up' ? -1 : 1), (m) => m.moveQuestion({ questionId: id, direction: dir }));
      assertDeepEqual(r.got, r.want, `${id} ${dir}`);
      assertDeepEqual(r.mr, r.lr, `${id} ${dir}`);
    }
  });

  test('moveQuestion at the very start changes nothing', () => {
    const r = both('moveQuestion q1 up', MIXED, (l) => l.moveQuestion('q1', -1), (m) => m.moveQuestion({ questionId: 'q1', direction: 'up' }));
    assertDeepEqual(r.got, r.want);
    assertEqual(r.m.dirtyStructure, false);
  });

  test('removeQuestion clears selection, filter and grouping and drops conditions on it', () => {
    const r = both('removeQuestion q1', MIXED, (l) => l.deleteQuestion('q1'), (m) => m.removeQuestion({ questionId: 'q1' }));
    assertDeepEqual(r.got, r.want);
    assertDeepEqual(r.mr, r.lr);
    assertEqual(r.mr.removedConditions, 2);
    assertEqual(r.m.ui.filter, null);
    assertEqual(r.m.ui.groupBy, null);
    const s = both('removeQuestion q2', MIXED, (l) => l.deleteQuestion('q2'), (m) => m.removeQuestion({ questionId: 'q2' }));
    assertDeepEqual(s.got, s.want);
    assertEqual(s.m.selectedQuestionId, null);
  });

  test('removeQuestion asks only when responses answered it', () => {
    const m = load(MIXED);
    assertDeepEqual(confirmOf(m, 'removeQuestion', { questionId: 'q3' }), { key: 'confirmDeleteAffected', params: { count: 3 } });
    assertDeepEqual(confirmOf(m, 'removeQuestion', { questionId: 'q4' }), { key: 'confirmDeleteAffected', params: { count: 2 } });
    assertEqual(confirmOf(m, 'removeQuestion', { questionId: 'q6' }), null);
  });

  test('setQuestionField writes text and hint, never structural', () => {
    for (const field of ['text', 'hint']) {
      const r = both(`setQuestionField ${field}`, MIXED, (l) => l.updateQuestion('q3', field, 'Neu'), (m) => m.setQuestionField({ questionId: 'q3', field, value: 'Neu' }));
      assertDeepEqual(r.got, r.want, field);
      assertEqual(r.m.dirtyStructure, false);
    }
  });

  test('setQuestionFlag switches the flags the type has', () => {
    for (const [id, flag, on] of [['q1', 'required', false], ['q1', 'other', false], ['q3', 'noAnswer', false],
      ['q4', 'importance', false], ['q5', 'multiline', false], ['q3', 'required', true]]) {
      const r = both(`setQuestionFlag ${id} ${flag} ${on}`, MIXED, (l) => l.updateQuestion(id, flag, on), (m) => m.setQuestionFlag({ questionId: id, flag, on }));
      assertDeepEqual(r.got, r.want, `${id} ${flag}`);
      assertEqual(r.m.dirtyStructure, false);
    }
  });

  test("setQuestionFlag rejects a flag the type does not have with param 'flag'", () => {
    const m = load(MIXED);
    const before = m.toJSON();
    assertEqual(thrown(() => m.setQuestionFlag({ questionId: 'q3', flag: 'other', on: true })).param, 'flag');
    assertEqual(thrown(() => m.setQuestionFlag({ questionId: 'q6', flag: 'required', on: true })).param, 'flag');
    assertDeepEqual(m.toJSON(), before);
  });

  test('changeQuestionType keeps id, texts, required and conditions and drops conditions on its options', () => {
    const r = both('changeQuestionType q1 text', MIXED, (l) => l.changeType('q1', 'text'), (m) => m.changeQuestionType({ questionId: 'q1', type: 'text' }));
    assertDeepEqual(r.got, r.want);
    assertDeepEqual(r.mr, r.lr);
    assertEqual(r.m.ui.groupBy, null);
    const s = both('changeQuestionType q3 kano', MIXED, (l) => l.changeType('q3', 'kano'), (m) => m.changeQuestionType({ questionId: 'q3', type: 'kano' }));
    assertDeepEqual(s.got, s.want);
  });

  test('changeQuestionType to the same type changes nothing', () => {
    const r = both('changeQuestionType q3 rating', MIXED, (l) => l.changeType('q3', 'rating'), (m) => m.changeQuestionType({ questionId: 'q3', type: 'rating' }));
    assertDeepEqual(r.got, r.want);
    assertDeepEqual(r.mr, { removedConditions: 0 });
  });

  test('changeQuestionType asks only when responses answered it', () => {
    const m = load(MIXED);
    assertDeepEqual(confirmOf(m, 'changeQuestionType', { questionId: 'q5', type: 'info' }), { key: 'confirmChangeType', params: { count: 1 } });
    assertEqual(confirmOf(m, 'changeQuestionType', { questionId: 'q6', type: 'text' }), null);
  });
});

suite('survey-builder commands — options and rows', () => {
  test('addItem appends an option or a row by type', () => {
    for (const [id, kind] of [['q1', 'options'], ['q2', 'options'], ['q3', 'rows'], ['q4', 'rows']]) {
      const r = both(`addItem ${id}`, MIXED, (l) => l.addItem(id, kind), (m) => m.addItem({ questionId: id }));
      assertDeepEqual(swapId(r.got, r.mr, r.lr), r.want, id);
    }
  });

  test("addItem rejects a question without options or rows with param 'questionId'", () => {
    assertEqual(thrown(() => load(MIXED).addItem({ questionId: 'q5' })).param, 'questionId');
  });

  test('setItemField writes the text; group only on options, an empty group drops the key', () => {
    for (const [q, kind, item, field, value] of [['q3', 'rows', 'r2', 'text', 'Neu'], ['q1', 'options', 'o1', 'text', 'Neu'],
      ['q2', 'options', 'm2', 'group', 'Analog'], ['q2', 'options', 'm1', 'group', '']]) {
      const r = both(`setItemField ${item} ${field} ${value}`, MIXED, (l) => l.updateItem(q, kind, item, field, value),
        (m) => m.setItemField({ questionId: q, itemId: item, field, value }));
      assertDeepEqual(r.got, r.want, `${item} ${field}`);
      assertEqual(r.m.dirtyStructure, false);
    }
    const m = load(MIXED);
    m.setItemField({ questionId: 'q2', itemId: 'm1', field: 'group', value: '' });
    assertEqual('group' in m.survey.sections[0].questions[1].options[0], false);
  });

  test("setItemField rejects a group on a row with param 'field'", () => {
    assertEqual(thrown(() => load(MIXED).setItemField({ questionId: 'q3', itemId: 'r1', field: 'group', value: 'x' })).param, 'field');
  });

  test('moveItem moves within the list; at the edge nothing changes', () => {
    for (const [item, dir] of [['r2', 'up'], ['r1', 'down'], ['r1', 'up'], ['r2', 'down']]) {
      const r = both(`moveItem ${item} ${dir}`, MIXED, (l) => l.moveItem('q3', 'rows', item, dir === 'up' ? -1 : 1),
        (m) => m.moveItem({ questionId: 'q3', itemId: item, direction: dir }));
      assertDeepEqual(r.got, r.want, `${item} ${dir}`);
    }
  });

  test('removeItem drops the option, the conditions on it and a filter on it', () => {
    const r = both('removeItem o1', MIXED, (l) => l.deleteItem('q1', 'options', 'o1'), (m) => m.removeItem({ questionId: 'q1', itemId: 'o1' }));
    assertDeepEqual(r.got, r.want);
    assertDeepEqual(r.mr, r.lr);
    assertEqual(r.m.ui.filter, null);
    const s = both('removeItem r1', MIXED, (l) => l.deleteItem('q3', 'rows', 'r1'), (m) => m.removeItem({ questionId: 'q3', itemId: 'r1' }));
    assertDeepEqual(s.got, s.want);
  });

  test('removeItem asks only when responses chose the option or rated the row', () => {
    const m = load(MIXED);
    assertDeepEqual(confirmOf(m, 'removeItem', { questionId: 'q2', itemId: 'm2' }), { key: 'confirmDeleteAffected', params: { count: 2 } });
    assertDeepEqual(confirmOf(m, 'removeItem', { questionId: 'q4', itemId: 'k1' }), { key: 'confirmDeleteAffected', params: { count: 2 } });
    assertEqual(confirmOf(m, 'removeItem', { questionId: 'q4', itemId: 'k2' }) !== null, true);
    m.addItem({ questionId: 'q3' });
    const fresh = m.survey.sections[1].questions[0].rows[2].id;
    assertEqual(confirmOf(m, 'removeItem', { questionId: 'q3', itemId: fresh }), null);
  });
});

suite('survey-builder commands — conditions', () => {
  test('setConditions keeps the valid conditions and drops the rest silently', () => {
    const when = [
      { questionId: 'q1', optionIds: ['o1', 'zz'] },
      { questionId: 'q2', optionIds: ['m1'] },
      { questionId: 'q5', optionIds: ['x'] },
      { questionId: 'q1', optionIds: [] },
    ];
    // The earlier model dropped the condition on q5 (no choice question), the
    // unknown option zz and the empty one; the agent call rejected them (next
    // tests), so the new command gets only what the earlier model kept.
    const known = [{ questionId: 'q1', optionIds: ['o1'] }, { questionId: 'q2', optionIds: ['m1'] }];
    const r = both('setConditions q3', MIXED, (l) => l.setConditions('q3', copy(when)), (m) => m.setConditions({ nodeId: 'q3', conditions: copy(known) }));
    assertDeepEqual(r.got, r.want);
    assertEqual(r.mr, 2);
    assertEqual(r.m.dirtyStructure, true);
  });

  test('setConditions rejects a source that is no earlier choice question, naming the condition', () => {
    for (const [conditions, param] of [
      [[{ questionId: 'q1', optionIds: ['o1'] }, { questionId: 'q5', optionIds: ['x'] }], 'conditions[1].questionId'],
      [[{ questionId: 'zz', optionIds: ['o1'] }], 'conditions[0].questionId'],
    ]) {
      const m = load(MIXED);
      const before = JSON.stringify(m.toJSON());
      const err = thrown(() => m.setConditions({ nodeId: 'q3', conditions }));
      assertEqual(err.param, 'conditions');
      assertEqual(err.message.startsWith(`unknown ${param} `), true, err.message);
      assertEqual(JSON.stringify(m.toJSON()), before);
    }
  });

  test('setConditions rejects empty and unknown options, naming the condition and the option', () => {
    for (const [conditions, path] of [
      [[{ questionId: 'q1', optionIds: [] }], 'invalid conditions[0].optionIds'],
      [[{ questionId: 'q1', optionIds: ['o1'] }, { questionId: 'q2', optionIds: ['m1', 'zz'] }], 'unknown conditions[1].optionIds[1]'],
    ]) {
      const m = load(MIXED);
      const before = JSON.stringify(m.toJSON());
      const err = thrown(() => m.setConditions({ nodeId: 'q3', conditions }));
      assertEqual(err.param, 'conditions');
      assertEqual(err.message.startsWith(`${path} `), true, err.message);
      assertEqual(JSON.stringify(m.toJSON()), before);
    }
  });

  test('setConditions rejects conditions that are no list', () => {
    for (const conditions of ['q1', { questionId: 'q1', optionIds: ['o1'] }, null]) {
      const m = load(MIXED);
      const err = thrown(() => m.setConditions({ nodeId: 'q3', conditions }));
      assertEqual(err?.param, 'conditions', JSON.stringify(conditions));
      assertEqual(/conditions/.test(err.message), true, err.message);
    }
  });

  test('setConditions with an empty list clears them; works on sections', () => {
    const r = both('setConditions s2', MIXED, (l) => l.setConditions('s2', []), (m) => m.setConditions({ nodeId: 's2', conditions: [] }));
    assertDeepEqual(r.got, r.want);
    assertEqual(r.m.survey.sections[1].when, null);
  });
});

suite('survey-builder commands — export version', () => {
  test('markExported bumps the version only after the questionnaire left the house', () => {
    const fresh = { survey: { id: 'x', sections: [] } };
    const r = both('markExported fresh', fresh, (l) => { l.addSection(); return l.markExported(); }, (m) => { m.addSection(); return m.markExported(); });
    assertEqual(r.mr, 1);
    assertEqual(r.mr, r.lr);
    const s = both('markExported mixed', MIXED, (l) => { l.addSection(); return [l.nextExportVersion(), l.markExported()]; },
      (m) => { m.addSection(); return [m.nextExportVersion, m.markExported()]; });
    assertDeepEqual(s.mr, [3, 3]);
    assertDeepEqual(s.mr, s.lr);
    assertEqual(s.m.dirtyStructure, false);
    assertEqual(s.m.exportedOnce, true);
  });
});

suite('survey-builder commands — recipients', () => {
  test('addRecipient appends an empty recipient, not structural', () => {
    const r = both('addRecipient', MIXED, (l) => l.addRecipient(), (m) => m.addRecipient());
    assertDeepEqual(swapId(r.got, r.mr, r.lr), r.want);
    assertEqual(r.m.dirtyStructure, false);
  });

  test('setRecipientField writes each field', () => {
    for (const field of ['name', 'organisation', 'group', 'email', 'note']) {
      const r = both(`setRecipientField ${field}`, MIXED, (l) => l.updateRecipient('rec-b', field, 'X'), (m) => m.setRecipientField({ recipientId: 'rec-b', field, value: 'X' }));
      assertDeepEqual(r.got, r.want, field);
    }
  });

  test('removeRecipient keeps their responses without recipient', () => {
    const r = both('removeRecipient', MIXED, (l) => l.deleteRecipient('rec-a'), (m) => m.removeRecipient({ recipientId: 'rec-a' }));
    assertDeepEqual(r.got, r.want);
    assertEqual(r.m.responses[0].recipientId, null);
  });

  test('removeRecipient asks only for an answered recipient', () => {
    const m = load(MIXED);
    assertDeepEqual(confirmOf(m, 'removeRecipient', { recipientId: 'rec-a' }), { key: 'confirmRecipientDelete', params: { name: 'Anna' } });
    assertEqual(confirmOf(m, 'removeRecipient', { recipientId: 'rec-b' }), null);
    m.setRecipientField({ recipientId: 'rec-a', field: 'name', value: '  ' });
    assertDeepEqual(confirmOf(m, 'removeRecipient', { recipientId: 'rec-a' }), { key: 'confirmRecipientDeleteUnnamed' });
  });

  test('markSent stamps time and version', () => {
    const m = load(MIXED);
    m.markSent({ recipientId: 'rec-c' });
    const r = m.recipients[2];
    assertEqual(r.sentVersion, 2);
    assertEqual(typeof r.sentAt, 'string');
    const o = frozen('markSent rec-c', ({ Legacy }) => {
      const l = Legacy.fromJSON(copy(MIXED));
      l.markSent('rec-c', '2026-11-15T12:00:00.000Z');
      return l.toJSON();
    });
    assertDeepEqual(swapId(canon(m.toJSON()), r.sentAt, '2026-11-15T12:00:00.000Z'), expected(o));
  });
});

suite('survey-builder commands — responses', () => {
  test('importResponse stores the cleaned answers in the stored form and reports orphans', () => {
    const json = responseFile();
    const m = load(MIXED);
    const out = m.importResponse({ json, fileName: 'a.json' });
    assertDeepEqual(out, { status: 'ok', orphanIds: ['zz', 'gone'], unknownRecipient: false });
    // The earlier viewmodel ran parseResponse, then addResponse.
    const o = frozen('importResponse ok', ({ Legacy, parseResponse }) => {
      const l = Legacy.fromJSON(copy(MIXED));
      const parsed = parseResponse(json, copy(l.survey), l.responseIds());
      l.addResponse(parsed.response);
      return l.toJSON();
    });
    assertDeepEqual(canon(m.toJSON()), expected(o));
    assertDeepEqual(m.answeredRecipientIds, ['rec-a', 'rec-b']);
  });

  test('importResponse of an older version and of an unknown recipient', () => {
    const m = load(MIXED);
    assertDeepEqual(m.importResponse({ json: responseFile({ surveyVersion: 1, recipientId: 'rec-zz' }), fileName: 'b.json' }),
      { status: 'older', orphanIds: ['zz', 'gone'], unknownRecipient: true });
    assertEqual(m.responses.at(-1).recipientId, null);
  });

  test('importResponse of another survey stores nothing', () => {
    const m = load(MIXED);
    const before = m.toJSON();
    assertDeepEqual(m.importResponse({ json: responseFile({ surveyId: 'other' }), fileName: 'c.json' }),
      { status: 'foreign', orphanIds: [], unknownRecipient: false });
    assertDeepEqual(m.importResponse({ json: '{', fileName: 'd.json' }), { status: 'invalid', orphanIds: [], unknownRecipient: false });
    assertDeepEqual(m.importResponse({ json: responseFile({ responseId: 'resp-a' }), fileName: 'e.json' }),
      { status: 'duplicate', orphanIds: [], unknownRecipient: false });
    assertDeepEqual(m.toJSON(), before);
  });

  test('removeResponse drops the response and its VoC marks and resets the recipient', () => {
    const r = both('removeResponse', MIXED, (l) => l.deleteResponse('resp-a'), (m) => m.removeResponse({ responseId: 'resp-a' }));
    assertDeepEqual(r.got, r.want);
    assertDeepEqual(r.m.answeredRecipientIds, []);
    assertDeepEqual(r.m.transfers.vocTree.responseKeys, []);
  });

  test('removeResponse always asks', () => {
    assertDeepEqual(confirmOf(load(MIXED), 'removeResponse', { responseId: 'resp-b' }), { key: 'confirmResponseDelete' });
  });
});

suite('survey-builder commands — evaluation', () => {
  test('setFilter on an option of a choice question; both null clears it', () => {
    const m = load(MIXED);
    m.setFilter({ questionId: 'q2', optionId: 'm2' });
    assertDeepEqual(m.ui.filter, { questionId: 'q2', optionId: 'm2' });
    m.setFilter({ questionId: null, optionId: null });
    assertEqual(m.ui.filter, null);
  });

  test('setFilter rejects a question that is no choice question and an option of another question', () => {
    const m = load(MIXED);
    assertEqual(thrown(() => m.setFilter({ questionId: 'q3', optionId: 'r1' })).param, 'questionId');
    assertEqual(thrown(() => m.setFilter({ questionId: 'q1', optionId: 'm1' })).param, 'optionId');
    assertEqual(thrown(() => m.setFilter({ questionId: 'q1', optionId: null })).param, 'optionId');
  });

  test('setGroupBy only on single choice questions; null clears it', () => {
    const m = load(MIXED);
    m.setGroupBy({ questionId: null });
    assertEqual(m.ui.groupBy, null);
    m.setGroupBy({ questionId: 'q1' });
    assertEqual(m.ui.groupBy, 'q1');
    assertEqual(thrown(() => m.setGroupBy({ questionId: 'q2' })).param, 'questionId');
  });
});

suite('survey-builder commands — hand-over marks', () => {
  test('setKanoTarget with another instance empties the id lists; the same keeps them; null drops the target', () => {
    const m = load(MIXED);
    m.setKanoTransfer({ questionId: 'q4', transfer: { instanceId: 'kano-1', itemIds: ['i1'], respondentIds: ['p1'] } });
    m.setKanoTarget({ questionId: 'q4', instanceId: 'kano-1' });
    assertDeepEqual(m.transfers.kano.q4, { instanceId: 'kano-1', itemIds: ['i1'], respondentIds: ['p1'] });
    m.setKanoTarget({ questionId: 'q4', instanceId: 'kano-2' });
    assertDeepEqual(m.transfers.kano.q4, { instanceId: 'kano-2', itemIds: [], respondentIds: [] });
    m.setKanoTarget({ questionId: 'q4', instanceId: null });
    assertEqual('q4' in m.transfers.kano, false);
  });

  test('setKanoTarget accepts an instance id it cannot check, only Kano questions', () => {
    const m = load(MIXED);
    m.setKanoTarget({ questionId: 'q4', instanceId: 'unbekannt' });
    assertEqual(m.transfers.kano.q4.instanceId, 'unbekannt');
    assertEqual(thrown(() => m.setKanoTarget({ questionId: 'q3', instanceId: 'k' })).param, 'questionId');
  });

  test('markVocTaken adds keys once', () => {
    const r = both('markVocTaken', MIXED, (l) => l.markVocTaken(['resp-b:q5', 'resp-a:q5']), (m) => m.markVocTaken({ keys: ['resp-b:q5', 'resp-a:q5'] }));
    assertDeepEqual(r.got, r.want);
  });
});

suite('survey-builder commands — unknown ids', () => {
  const CALLS = [
    ['setSectionField', { sectionId: 'zz', field: 'title', value: '' }, 'sectionId'],
    ['moveSection', { sectionId: 'zz', direction: 'up' }, 'sectionId'],
    ['removeSection', { sectionId: 'zz' }, 'sectionId'],
    ['addQuestion', { sectionId: 'zz', type: 'text' }, 'sectionId'],
    ['moveQuestion', { questionId: 'zz', direction: 'up' }, 'questionId'],
    ['removeQuestion', { questionId: 'zz' }, 'questionId'],
    ['setQuestionField', { questionId: 'zz', field: 'text', value: '' }, 'questionId'],
    ['setQuestionFlag', { questionId: 'zz', flag: 'required', on: true }, 'questionId'],
    ['changeQuestionType', { questionId: 'zz', type: 'text' }, 'questionId'],
    ['addItem', { questionId: 'zz' }, 'questionId'],
    ['setItemField', { questionId: 'q1', itemId: 'zz', field: 'text', value: '' }, 'itemId'],
    ['moveItem', { questionId: 'q1', itemId: 'zz', direction: 'up' }, 'itemId'],
    ['removeItem', { questionId: 'q1', itemId: 'zz' }, 'itemId'],
    ['setConditions', { nodeId: 'zz', conditions: [] }, 'nodeId'],
    ['setRecipientField', { recipientId: 'zz', field: 'name', value: '' }, 'recipientId'],
    ['removeRecipient', { recipientId: 'zz' }, 'recipientId'],
    ['markSent', { recipientId: 'zz' }, 'recipientId'],
    ['removeResponse', { responseId: 'zz' }, 'responseId'],
    ['setFilter', { questionId: 'zz', optionId: 'o1' }, 'questionId'],
    ['setGroupBy', { questionId: 'zz' }, 'questionId'],
    ['setKanoTarget', { questionId: 'zz', instanceId: null }, 'questionId'],
    ['setKanoTransfer', { questionId: 'zz', transfer: { instanceId: 'k', itemIds: [], respondentIds: [] } }, 'questionId'],
  ];
  for (const [name, args, param] of CALLS) {
    test(`${name} names the unknown ${param} and the available ones`, () => {
      const m = load(MIXED);
      const before = m.toJSON();
      const err = thrown(() => m[name](copy(args)));
      assertEqual(err?.param, param);
      assertEqual(/unknown .*"zz"; available: /.test(err.message), true, err.message);
      assertDeepEqual(m.toJSON(), before);
    });
  }
});

suite('survey-builder commands — example', () => {
  test('a command on the example has the effect of the earlier method', () => {
    const r = both('removeQuestion example', EXAMPLE, (l) => l.deleteQuestion('q-group'), (m) => m.removeQuestion({ questionId: 'q-group' }));
    assertDeepEqual(r.got, r.want);
    assertThrows(() => load(EXAMPLE).execute({ type: 'nope' }), /unknown command/);
  });
});

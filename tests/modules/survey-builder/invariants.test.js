/**
 * Tests for the invariants of js/modules/survey-builder/domain/model.js: per
 * invariant a valid 1.0 state stays as it is, an invalid one is repaired the
 * way the earlier `fromJSON` cleaned it, and a write that breaks it is rolled
 * back.
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { setFields } from '../../../js/core/model.js';
import { SurveyModel } from '../../../js/modules/survey-builder/domain/model.js';
import { MIXED, CORNERS, EXAMPLE, copy, load } from './cases.js';

/** MIXED in the 1.0 form. */
const VALID = load(MIXED).toJSON();

/** @param {(j: any) => void} edit change on a copy of VALID @returns {any} the edited 1.0 state */
function broken(edit) {
  const j = copy(VALID);
  edit(j);
  return j;
}

/** @param {object} json 1.0 state @returns {{ m: any, reports: string[] }} */
function repaired(json) {
  const reports = [];
  const m = SurveyModel.fromJSON(copy(json), { repair: true, onRepair: (name) => reports.push(name) });
  return { m, reports };
}

/** @param {() => void} fn @returns {any} the thrown error */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

suite('survey-builder invariants — valid states stay', () => {
  for (const [name, json] of [['mixed', MIXED], ['example', EXAMPLE], ['corners', CORNERS]]) {
    test(`${name}: strict and repairing load give the same state`, () => {
      const once = load(json).toJSON();
      const { m, reports } = repaired(once);
      assertDeepEqual(m.toJSON(), once);
      assertDeepEqual(reports, []);
      assertDeepEqual(SurveyModel.fromJSON(copy(once)).toJSON(), once);
    });
  }
});

suite('survey-builder invariants — repair', () => {
  test('uniqueIds: the later duplicate of a section, question, option, recipient and response goes', () => {
    const j = broken((s) => {
      s.survey.sections.push({ ...copy(s.survey.sections[0]), title: 'Doppel' });
      s.survey.sections[1].questions.push({ ...copy(s.survey.sections[1].questions[2]), text: 'Doppel' });
      s.survey.sections[0].questions[0].options.push({ id: 'o1', text: 'Doppel' });
      s.recipients.push({ ...copy(s.recipients[1]), name: 'Doppel' });
      s.responses.push({ ...copy(s.responses[1]), submittedAt: 'x' });
    });
    assertEqual(thrown(() => SurveyModel.fromJSON(copy(j)))?.invariant, 'uniqueIds');
    const { m, reports } = repaired(j);
    assertDeepEqual(m.toJSON(), VALID);
    assert(reports.length > 0);
  });

  test('uniqueIds: a question with the id of a section goes', () => {
    const j = broken((s) => { s.survey.sections[1].questions[3].id = 's1'; });
    const { m } = repaired(j);
    assertDeepEqual(m.survey.sections[1].questions.map((q) => q.id), ['q3', 'q4', 'q5']);
  });

  test('questionShape: missing flags get their default, keys foreign to the type go', () => {
    const j = broken((s) => {
      const rating = s.survey.sections[1].questions[0];
      delete rating.noAnswer;
      rating.options = [{ id: 'x', text: 'X' }];
      rating.multiline = true;
      s.survey.sections[1].questions[3].other = true;
    });
    assertEqual(thrown(() => SurveyModel.fromJSON(copy(j)))?.invariant, 'questionShape');
    const { m } = repaired(j);
    assertDeepEqual(m.toJSON(), VALID);
  });

  test('questionShape: a single question without options gets an empty list', () => {
    const j = broken((s) => { delete s.survey.sections[0].questions[0].options; });
    const { m } = repaired(j);
    assertDeepEqual(m.survey.sections[0].questions[0].options, []);
  });

  test('validConditions: a condition on a later question or an unknown option is cleaned like cleanConditions', () => {
    const j = broken((s) => {
      s.survey.sections[0].questions[0].when = [{ questionId: 'q2', optionIds: ['m1'] }];
      s.survey.sections[1].when = [{ questionId: 'q1', optionIds: ['o1', 'zz'] }, { questionId: 'q1', optionIds: ['zz'] }];
    });
    assertEqual(thrown(() => SurveyModel.fromJSON(copy(j)))?.invariant, 'validConditions');
    const { m } = repaired(j);
    assertEqual(m.survey.sections[0].questions[0].when, null);
    assertDeepEqual(m.survey.sections[1].when, [{ questionId: 'q1', optionIds: ['o1'] }]);
  });

  test('validUi: a filter on a deleted question and a grouping by a multiple choice question become null', () => {
    const j = broken((s) => {
      s.ui.filter = { questionId: 'gone', optionId: 'o1' };
      s.ui.groupBy = 'q2';
    });
    assertEqual(thrown(() => SurveyModel.fromJSON(copy(j)))?.invariant, 'validUi');
    const { m } = repaired(j);
    assertDeepEqual(m.ui, { filter: null, groupBy: null, reportWithNames: true });
  });

  test('validUi: a filter with an option the question lacks stays, as before', () => {
    const j = broken((s) => { s.ui.filter = { questionId: 'q1', optionId: 'zz' }; });
    assertDeepEqual(load(j).ui.filter, { questionId: 'q1', optionId: 'zz' });
  });

  test('validSelection: a selection of a deleted question heals silently, also on strict load', () => {
    const j = broken((s) => { s.selectedQuestionId = 'gone'; });
    assertEqual(SurveyModel.fromJSON(copy(j)).selectedQuestionId, null);
    const { reports } = repaired(j);
    assertDeepEqual(reports, []);
  });

  test('answeredRecipients: ids of deleted recipients go', () => {
    const j = broken((s) => { s.answeredRecipientIds = ['rec-a', 'gone']; });
    assertEqual(thrown(() => SurveyModel.fromJSON(copy(j)))?.invariant, 'answeredRecipients');
    assertDeepEqual(repaired(j).m.answeredRecipientIds, ['rec-a']);
  });
});

suite('survey-builder invariants — writes that break one roll back', () => {
  test("instance.set of a filter on an unknown question is rejected, nothing written", () => {
    const m = load(MIXED);
    const before = m.toJSON();
    const err = thrown(() => setFields(m, { ui: { filter: { questionId: 'x', optionId: '' }, groupBy: null, reportWithNames: false } }));
    assertEqual(err?.invariant, 'validUi');
    assertDeepEqual(m.toJSON(), before);
  });

  test('instance.set of reportWithNames passes', () => {
    const m = load(MIXED);
    setFields(m, { ui: { ...copy(m.ui), reportWithNames: false } });
    assertEqual(m.ui.reportWithNames, false);
  });

  test('instance.set of a duplicate recipient and of an unknown answered recipient is rejected', () => {
    const m = load(MIXED);
    const before = m.toJSON();
    assertEqual(thrown(() => setFields(m, { recipients: [...copy(m.recipients), copy(m.recipients[0])] }))?.invariant, 'uniqueIds');
    assertEqual(thrown(() => setFields(m, { answeredRecipientIds: ['zz'] }))?.invariant, 'answeredRecipients');
    assertDeepEqual(m.toJSON(), before);
  });

  test('instance.set of a survey with a forward condition is rejected', () => {
    const m = load(MIXED);
    const survey = copy(m.survey);
    survey.sections[0].questions[0].when = [{ questionId: 'q2', optionIds: ['m1'] }];
    assertEqual(thrown(() => setFields(m, { survey }))?.invariant, 'validConditions');
    assertDeepEqual(m.toJSON(), VALID);
  });
});

/**
 * Tests for js/modules/survey-builder/domain/migrations.js — step '0→1.0'
 * from the stored form of the earlier model: the example project, garbage,
 * the Kano targets and the corners of old projects. Reference is the earlier
 * `fromJSON` (legacy/survey-builder-model.js), compared after mapping its
 * result to the 1.0 form by hand.
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { from0 } from '../../../js/modules/survey-builder/domain/migrations.js';
import { SurveyModel } from '../../../js/modules/survey-builder/domain/model.js';
import { storedAnswers, toLegacy } from '../../../js/modules/survey-builder/domain/answers.js';
import { findQuestion } from '../../../js/modules/survey-builder/domain/conditions.js';
import { EXAMPLE, MIXED, CORNERS, copy, load, legacy } from './cases.js';

/**
 * The earlier model's state in the 1.0 form, mapped by hand: answers in the
 * stored form, Kano targets with empty id lists, `ui.tab` and
 * `ui.selectedQuestionId` as view fields.
 * @param {any} l earlier model @returns {object}
 */
function mapped(l) {
  const j = l.toJSON();
  const { tab, selectedQuestionId, ...ui } = j.ui;
  return {
    _schema: { version: '1.0' },
    survey: j.survey,
    recipients: j.recipients,
    responses: j.responses.map((r) => ({ ...r, answers: storedAnswers(j.survey, r.answers) })),
    answeredRecipientIds: j.answeredRecipientIds,
    transfers: {
      kano: Object.fromEntries(Object.entries(j.transfers.kano)
        .map(([q, instanceId]) => [q, { instanceId, itemIds: [], respondentIds: [] }])),
      vocTree: j.transfers.vocTree,
    },
    ui,
    dirtyStructure: j.dirtyStructure,
    exportedOnce: j.exportedOnce,
    tab,
    selectedQuestionId,
  };
}

/** @param {object} json earlier form @returns {{ m: any, reports: string[] }} strict load and what repair would report */
function strict(json) {
  const m = SurveyModel.fromJSON(copy(json));
  const reports = [];
  SurveyModel.fromJSON(copy(json), { repair: true, onRepair: (name) => reports.push(name) });
  return { m, reports };
}

suite('survey-builder migration 0→1.0 — example and reference', () => {
  test('the example loads strictly and equals the earlier fromJSON in the 1.0 form', () => {
    const { m, reports } = strict(EXAMPLE);
    assertDeepEqual(reports, []);
    assertDeepEqual(m.toJSON(), mapped(legacy(EXAMPLE)));
  });

  test('the mixed state loads strictly and equals the earlier fromJSON in the 1.0 form', () => {
    const { m, reports } = strict(MIXED);
    assertDeepEqual(reports, []);
    assertDeepEqual(m.toJSON(), mapped(legacy(MIXED)));
  });

  test('the example keeps its ids, conditions, recipients and responses', () => {
    const m = load(EXAMPLE);
    assertEqual(m.survey.id, EXAMPLE.survey.id);
    assertDeepEqual(m.survey.sections[1].when, [{ questionId: 'q-group', optionIds: ['o-industrie'] }]);
    assertEqual(m.recipients.length, 3);
    assertEqual(m.responses.length, 6);
    assertDeepEqual(m.responses[3].answers['q-erp'], { other: 'Sage' });
  });

  test('ui.tab and ui.selectedQuestionId become the view fields tab and selectedQuestionId', () => {
    const m = load(MIXED);
    assertEqual(m.tab, 'results');
    assertEqual(m.selectedQuestionId, 'q2');
    assertDeepEqual(m.ui, { filter: { questionId: 'q1', optionId: 'o1' }, groupBy: 'q1', reportWithNames: true });
  });

  test('a stored state with _schema 1.0 does not run the migration', () => {
    const once = load(MIXED).toJSON();
    assertDeepEqual(load(once).toJSON(), once);
  });
});

suite('survey-builder migration 0→1.0 — transfers', () => {
  test("transfers.kano[q] = 'k1' becomes { instanceId: 'k1', itemIds: [], respondentIds: [] }", () => {
    const m = load({ ...copy(MIXED), transfers: { kano: { q4: 'k1' }, vocTree: { responseKeys: [] } } });
    assertDeepEqual(m.transfers.kano, { q4: { instanceId: 'k1', itemIds: [], respondentIds: [] } });
  });

  test('Kano targets and VoC keys that are no text are dropped as before', () => {
    const out = from0(copy(CORNERS));
    assertDeepEqual(out.transfers.kano, { 'q-geloescht': { instanceId: 'kano-9', itemIds: [], respondentIds: [] } });
    assertDeepEqual(out.transfers.vocTree, { responseKeys: ['resp-1:q3'] });
  });

  test('missing or broken transfers become empty', () => {
    assertDeepEqual(from0({ transfers: 'x' }).transfers, { kano: {}, vocTree: { responseKeys: [] } });
    assertDeepEqual(from0({ transfers: { vocTree: { responseKeys: 'x' } } }).transfers, { kano: {}, vocTree: { responseKeys: [] } });
  });
});

suite('survey-builder migration 0→1.0 — corners of old projects', () => {
  test('loads strictly without an exception and equals the earlier fromJSON in the 1.0 form', () => {
    const { m, reports } = strict(CORNERS);
    assertDeepEqual(reports, []);
    assertDeepEqual(m.toJSON(), mapped(legacy(CORNERS)));
  });

  test('filter on a deleted question and grouping by a multiple choice question are cleared', () => {
    const m = load(CORNERS);
    assertEqual(m.ui.filter, null);
    assertEqual(m.ui.groupBy, null);
    assertEqual(m.selectedQuestionId, null);
    assertEqual(m.tab, 'recipients');
  });

  test('no answer data is lost that the earlier model kept', () => {
    const m = load(CORNERS);
    const before = CORNERS.responses[0].answers;
    const stored = m.responses[0].answers;
    assertDeepEqual(Object.keys(stored).sort(), Object.keys(before).sort());
    for (const qid of ['q1', 'q2', 'q3', 'q4']) {
      assertDeepEqual(toLegacy(findQuestion(m.survey, qid), stored[qid]), before[qid], qid);
    }
    assertDeepEqual(stored['q-geloescht'], { text: before['q-geloescht'] });
  });

  test('an answered recipient that is gone is dropped, the survey id and version stay', () => {
    const m = load(CORNERS);
    assertDeepEqual(m.answeredRecipientIds, ['rec-a']);
    assertEqual(m.survey.id, 'sv-old');
    assertEqual(m.survey.version, 3);
    assertEqual(m.dirtyStructure, true);
    assertEqual(m.exportedOnce, false);
  });
});

suite('survey-builder migration 0→1.0 — tolerant like the earlier fromJSON', () => {
  test('garbage loads as an empty survey with a fresh id', () => {
    for (const junk of [{}, { survey: 5 }, { survey: { sections: 'x' } }, { recipients: 'x', responses: 7, ui: 3 }]) {
      const m = load(junk);
      assert(typeof m.survey.id === 'string' && m.survey.id !== '', JSON.stringify(junk));
      assertEqual(m.survey.version, 1);
      assertDeepEqual(m.survey.sections, []);
      assertDeepEqual(m.recipients, []);
      assertDeepEqual(m.responses, []);
      assertEqual(m.tab, 'draft');
    }
  });

  test('unknown question types, nodes without id and dangling conditions are dropped', () => {
    const json = {
      survey: {
        id: 'x', sections: [
          { id: 's1', questions: [
            { id: 'a', type: 'single', options: [{ id: 'o1', text: 'A' }, { text: 'ohne id' }] },
            { id: 'b', type: 'matrix' },
            { type: 'text' },
            { id: 'c', type: 'text', when: [{ questionId: 'a', optionIds: ['o1', 'o9'] }, { questionId: 'zz', optionIds: ['o1'] }] },
          ] },
          { title: 'ohne id' },
          { id: 's2', when: [{ questionId: 'c', optionIds: ['x'] }], questions: [] },
        ],
      },
    };
    const m = load(json);
    assertDeepEqual(m.toJSON(), mapped(legacy(json)));
    assertDeepEqual(m.survey.sections.map((s) => s.id), ['s1', 's2']);
    assertDeepEqual(m.survey.sections[0].questions.map((q) => q.id), ['a', 'c']);
    assertDeepEqual(m.survey.sections[0].questions[1].when, [{ questionId: 'a', optionIds: ['o1'] }]);
    assertEqual(m.survey.sections[1].when, null);
  });

  test('missing flags get their defaults, foreign keys of the type are dropped', () => {
    const json = { survey: { id: 'x', sections: [{ id: 's1', questions: [
      { id: 'r', type: 'rating', rows: [{ id: 'r1', text: 'A' }], options: [{ id: 'o1', text: 'B' }], multiline: true },
      { id: 'k', type: 'kano', importance: 'ja' },
    ] }] } };
    const m = load(json);
    assertDeepEqual(m.toJSON(), mapped(legacy(json)));
    assertDeepEqual(m.survey.sections[0].questions[0],
      { id: 'r', type: 'rating', text: '', hint: '', required: false, when: null, rows: [{ id: 'r1', text: 'A' }], noAnswer: true });
    assertEqual(m.survey.sections[0].questions[1].importance, true);
  });
});

/**
 * D.Mike — Survey builder model tests (survey-builder-model.test.js)
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md §3, §4.2, §5.3
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { State } from '../../js/modules/survey-builder/survey-builder-model.js';

/** Section with a single (2 options) and a text question conditional on option 1. */
function built() {
  const s = new State();
  const sec = s.addSection();
  const q1 = s.addQuestion(sec, 'single');
  const o1 = s.addItem(q1, 'options');
  const o2 = s.addItem(q1, 'options');
  const q2 = s.addQuestion(sec, 'text');
  s.setConditions(q2, [{ questionId: q1, optionIds: [o1] }]);
  s.dirtyStructure = false;
  return { s, sec, q1, o1, o2, q2 };
}

suite('survey-model — defaults', () => {
  test('fresh state has an id, version 1, no content', () => {
    const s = new State();
    assertTrue(typeof s.survey.id === 'string' && s.survey.id.length > 0);
    assertEqual(s.survey.version, 1);
    assertEqual(s.survey.lang, 'de');
    assertEqual(s.hasContent(), false);
    assertEqual(s.ui.tab, 'draft');
  });
});

suite('survey-model — editing', () => {
  test('addQuestion creates type-specific fields', () => {
    const s = new State();
    const sec = s.addSection();
    const r = s.question(s.addQuestion(sec, 'rating'));
    assertDeepEqual(r.rows, []);
    assertEqual(r.noAnswer, true);
    const k = s.question(s.addQuestion(sec, 'kano'));
    assertEqual(k.importance, true);
    const m = s.question(s.addQuestion(sec, 'multi'));
    assertDeepEqual(m.options, []);
    assertEqual(m.other, false);
    assertEqual(s.hasContent(), true);
  });

  test('moveQuestion within and across sections', () => {
    const s = new State();
    const a = s.addSection();
    const b = s.addSection();
    const q1 = s.addQuestion(a, 'text');
    const q2 = s.addQuestion(b, 'text');
    s.moveQuestion(q2, -1);
    assertDeepEqual(s.survey.sections[0].questions.map((q) => q.id), [q1, q2]);
    s.moveQuestion(q1, 1);
    assertDeepEqual(s.survey.sections[0].questions.map((q) => q.id), [q2, q1]);
    s.moveQuestion(q1, 1);
    assertDeepEqual(s.survey.sections[1].questions.map((q) => q.id), [q1]);
  });

  test('text edits do not mark the structure dirty', () => {
    const { s, q1, o1 } = built();
    s.updateQuestion(q1, 'text', 'Neu');
    s.updateItem(q1, 'options', o1, 'text', 'Kunde');
    s.setHeader('title', 'X');
    assertEqual(s.dirtyStructure, false);
  });

  test('structural edits mark the structure dirty', () => {
    const { s, q1 } = built();
    s.addItem(q1, 'options');
    assertEqual(s.dirtyStructure, true);
  });
});

suite('survey-model — condition clean-up', () => {
  test('deleting the source question removes the condition', () => {
    const { s, q1, q2 } = built();
    assertEqual(s.deleteQuestion(q1).removedConditions, 1);
    assertEqual(s.question(q2).when, null);
  });

  test('deleting a referenced option drops it; empty condition is removed', () => {
    const { s, q1, o1, q2 } = built();
    assertEqual(s.deleteItem(q1, 'options', o1).removedConditions, 1);
    assertEqual(s.question(q2).when, null);
  });

  test('deleting one of two referenced options keeps the condition', () => {
    const { s, q1, o1, o2, q2 } = built();
    s.setConditions(q2, [{ questionId: q1, optionIds: [o1, o2] }]);
    assertEqual(s.deleteItem(q1, 'options', o1).removedConditions, 0);
    assertDeepEqual(s.question(q2).when, [{ questionId: q1, optionIds: [o2] }]);
  });

  test('moving the source below its dependant removes the condition', () => {
    const { s, q1, q2 } = built();
    assertEqual(s.moveQuestion(q1, 1).removedConditions, 1);
    assertEqual(s.question(q2).when, null);
  });

  test('changing the source type to text removes the condition', () => {
    const { s, q1, q2 } = built();
    assertEqual(s.changeType(q1, 'text').removedConditions, 1);
    assertEqual(s.question(q2).when, null);
  });

  test('setConditions rejects later or non-choice sources', () => {
    const { s, q1, q2 } = built();
    s.setConditions(q1, [{ questionId: q2, optionIds: ['x'] }]);
    assertEqual(s.question(q1).when, null);
  });
});

suite('survey-model — versioning', () => {
  test('markExported bumps once per dirty structure after a send', () => {
    const { s, q1 } = built();
    assertEqual(s.markExported(), 1);
    s.markSent(s.addRecipient(), 't');
    s.addItem(q1, 'options');
    assertEqual(s.markExported(), 2);
    assertEqual(s.markExported(), 2);
    assertEqual(s.dirtyStructure, false);
  });

  test('structure edits before anything was sent keep version 1', () => {
    const { s, q1 } = built();
    s.addItem(q1, 'options');
    assertEqual(s.markExported(), 1);
  });

  test('countAffectedResponses counts responses referencing an option', () => {
    const { s, q1, o1, o2 } = built();
    s.addResponse({ id: 'r1', surveyVersion: 1, recipientId: null, submittedAt: 'x', answers: { [q1]: o1 } });
    s.addResponse({ id: 'r2', surveyVersion: 1, recipientId: null, submittedAt: 'x', answers: { [q1]: o2 } });
    assertEqual(s.countAffectedResponses(q1, o1), 1);
    assertEqual(s.countAffectedResponses(q1), 2);
  });
});

suite('survey-model — recipients and responses', () => {
  test('status is derived: not-sent, sent, answered, outdated', () => {
    const s = new State();
    const r = s.addRecipient();
    assertEqual(s.recipientStatus(r), 'not-sent');
    s.markSent(r, '2026-10-10T10:00:00.000Z');
    assertEqual(s.recipientStatus(r), 'sent');
    assertEqual(s.isOutdated(r), false);
    s.survey.version = 2;
    assertEqual(s.isOutdated(r), true);
    s.addResponse({ id: 'x', surveyVersion: 2, recipientId: r, submittedAt: 'y', answers: {} });
    assertEqual(s.recipientStatus(r), 'answered');
  });

  test('anonymous import marks answered but stores no recipient id', () => {
    const s = new State();
    s.survey.anonymous = true;
    const r = s.addRecipient();
    s.addResponse({ id: 'x', surveyVersion: 1, recipientId: r, submittedAt: 'y', answers: {} });
    assertEqual(s.responses[0].recipientId, null);
    assertEqual(s.responses[0].viaRecipient, true);
    assertEqual(s.recipientStatus(r), 'answered');
  });

  test('unknown recipient id is cleared and reported', () => {
    const s = new State();
    const res = s.addResponse({ id: 'x', surveyVersion: 1, recipientId: 'ghost', submittedAt: 'y', answers: {} });
    assertEqual(res.unknownRecipient, true);
    assertEqual(s.responses[0].recipientId, null);
    assertEqual(s.responses[0].viaRecipient, false);
  });

  test('deleteRecipient keeps response and clears ids', () => {
    const s = new State();
    const r = s.addRecipient();
    s.addResponse({ id: 'x', surveyVersion: 1, recipientId: r, submittedAt: 'y', answers: {} });
    s.deleteRecipient(r);
    assertEqual(s.recipients.length, 0);
    assertEqual(s.responses.length, 1);
    assertEqual(s.responses[0].recipientId, null);
    assertDeepEqual(s.answeredRecipientIds, []);
  });

  test('deleteResponse removes only that response and only its VoC-tree marks', () => {
    const s = new State();
    for (const id of ['x', 'x1', 'y']) {
      s.addResponse({ id, surveyVersion: 1, recipientId: null, submittedAt: 't', answers: {} });
    }
    s.markVocTaken(['x:q1', 'x:q2', 'x1:q1', 'y:q1']);
    s.deleteResponse('x');
    assertDeepEqual(s.responseIds(), ['x1', 'y']);
    // 'x1' shares the prefix 'x' — its mark must survive.
    assertDeepEqual([...s.transfers.vocTree.responseKeys].sort(), ['x1:q1', 'y:q1']);
  });

  test('deleteResponse with an unknown id changes nothing', () => {
    const s = new State();
    s.addResponse({ id: 'x', surveyVersion: 1, recipientId: null, submittedAt: 't', answers: {} });
    s.markVocTaken(['x:q1']);
    s.deleteResponse('ghost');
    assertDeepEqual(s.responseIds(), ['x']);
    assertDeepEqual(s.transfers.vocTree.responseKeys, ['x:q1']);
  });

  test('recipientCounts', () => {
    const s = new State();
    const a = s.addRecipient();
    const b = s.addRecipient();
    s.addRecipient();
    s.markSent(a, 't');
    s.markSent(b, 't');
    s.addResponse({ id: 'x', surveyVersion: 1, recipientId: a, submittedAt: 'y', answers: {} });
    assertDeepEqual(s.recipientCounts(), { sent: 2, answered: 1, rate: 0.5 });
  });

  test('recipientCounts counts an answering recipient without sentAt as sent', () => {
    const s = new State();
    const a = s.addRecipient();
    const b = s.addRecipient();
    s.markSent(b, 't');
    s.addResponse({ id: 'x', surveyVersion: 1, recipientId: a, submittedAt: 'y', answers: {} });
    assertDeepEqual(s.recipientCounts(), { sent: 2, answered: 1, rate: 0.5 });
  });
});

suite('survey-model — serialisation', () => {
  test('round trip keeps everything', () => {
    const { s } = built();
    s.addRecipient();
    const copy = State.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
    assertDeepEqual(copy.toJSON(), s.toJSON());
  });

  test('fromJSON tolerates garbage', () => {
    for (const bad of [null, 42, 'x', { survey: 'x' }, { survey: { sections: [null, { questions: 'x' }] } }]) {
      const s = State.fromJSON(bad);
      assertTrue(Array.isArray(s.survey.sections));
      assertTrue(typeof s.survey.id === 'string');
    }
  });

  test('fromJSON drops unknown question types and dangling conditions', () => {
    const d = new State().toJSON();
    d.survey.sections = [{ id: 's', title: '', hint: '', when: null, questions: [
      { id: 'a', type: 'bogus', text: '' },
      { id: 'b', type: 'text', text: '', when: [{ questionId: 'gone', optionIds: ['x'] }] },
    ] }];
    const s = State.fromJSON(d);
    assertDeepEqual(s.survey.sections[0].questions.map((q) => q.id), ['b']);
    assertEqual(s.question('b').when, null);
  });
});

suite('survey-model — nextExportVersion', () => {
  test('a general export counts as having left the house', () => {
    const { s, q1 } = built();
    assertEqual(s.markExported(), 1);
    s.addItem(q1, 'options');
    assertEqual(s.nextExportVersion(), 2);
    assertEqual(s.markExported(), 2);
    assertEqual(s.markExported(), 2);
  });

  test('the exported flag survives serialisation; old state defaults to false', () => {
    const { s } = built();
    s.markExported();
    assertEqual(State.fromJSON(s.toJSON()).exportedOnce, true);
    assertEqual(State.fromJSON({}).exportedOnce, false);
  });

  test('stays at the current version until something was sent or answered', () => {
    const { s, q1 } = built();
    s.addItem(q1, 'options');
    assertEqual(s.nextExportVersion(), 1);
    assertEqual(s.markExported(), 1);
    s.markSent(s.addRecipient(), 't');
    assertEqual(s.nextExportVersion(), 1);
  });

  test('announces the bump after a structural edit once something was sent', () => {
    const { s, q1 } = built();
    s.markSent(s.addRecipient(), 't');
    s.addItem(q1, 'options');
    assertEqual(s.nextExportVersion(), 2);
    assertEqual(s.markExported(), 2);
    assertEqual(s.nextExportVersion(), 2);
  });

  test('an imported response counts like a send', () => {
    const { s, q1 } = built();
    s.addResponse({ id: 'r', surveyVersion: 1, recipientId: null, submittedAt: 'x', answers: {} });
    s.addItem(q1, 'options');
    assertEqual(s.nextExportVersion(), 2);
  });
});

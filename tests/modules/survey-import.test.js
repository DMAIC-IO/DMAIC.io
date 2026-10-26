/**
 * D.Mike — Survey import tests (survey-import.test.js)
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { parseResponse } from '../../js/modules/survey-builder/survey-import.js';

const q = (id, type, extra) => ({ id, type, text: '', hint: '', required: false, when: null, ...extra });
const SURVEY = {
  id: 'sv', version: 2, lang: 'de', title: 'T', intro: '', contact: '', anonymous: false,
  sections: [{ id: 's1', title: '', hint: '', when: null, questions: [
    q('q1', 'single', { other: true, options: [{ id: 'g1', text: 'A' }, { id: 'g2', text: 'B' }] }),
    q('q2', 'multi', { other: false, options: [{ id: 'm1', text: 'A' }, { id: 'm2', text: 'B' }] }),
    q('q3', 'rating', { noAnswer: true, rows: [{ id: 'r1', text: 'A' }, { id: 'r2', text: 'B' }] }),
    q('q4', 'kano', { importance: true, rows: [{ id: 'k1', text: 'A' }] }),
    q('q5', 'text', { multiline: true }),
    q('q6', 'info', {}),
  ] }],
};
const ANSWERS = {
  q1: 'g1', q2: { ids: ['m1'], other: null }, q3: { r1: 4, r2: 'na' }, q4: { k1: { f: 1, d: 5, w: 7 } }, q5: 'Mehr Schulungen',
};
function file(over = {}) {
  return JSON.stringify({
    format: 'dmike-survey-response', formatVersion: 1, surveyId: 'sv', surveyVersion: 2,
    recipientId: 'rec', responseId: 'resp-1', submittedAt: '2026-10-10T12:00:00.000Z', answers: ANSWERS, ...over,
  });
}

suite('survey-import — statuses', () => {
  test('ok', () => {
    const r = parseResponse(file(), SURVEY, []);
    assertEqual(r.status, 'ok');
    assertDeepEqual(r.response, {
      id: 'resp-1', surveyVersion: 2, recipientId: 'rec', submittedAt: '2026-10-10T12:00:00.000Z', answers: ANSWERS,
    });
    assertDeepEqual(r.orphanIds, []);
  });

  const invalid = [
    ['not JSON', '{nope'],
    ['JSON null', 'null'],
    ['wrong format', file({ format: 'other' })],
    ['unknown formatVersion', file({ formatVersion: 2 })],
    ['missing responseId', file({ responseId: undefined })],
    ['empty responseId', file({ responseId: '' })],
    ['surveyVersion not an integer', file({ surveyVersion: '2' })],
    ['answers is an array', file({ answers: [] })],
    ['recipientId of wrong type', file({ recipientId: 7 })],
  ];
  for (const [name, text] of invalid) {
    test(`invalid: ${name}`, () => assertEqual(parseResponse(text, SURVEY, []).status, 'invalid'));
  }

  test('foreign survey is rejected, even if the id is known', () => {
    assertEqual(parseResponse(file({ surveyId: 'other' }), SURVEY, ['resp-1']).status, 'foreign');
  });

  test('duplicate response is skipped', () => {
    const r = parseResponse(file(), SURVEY, ['resp-1']);
    assertEqual(r.status, 'duplicate');
    assertEqual(r.response, undefined);
  });

  test('a newer version than the project is treated as ok', () => {
    assertEqual(parseResponse(file({ surveyVersion: 5 }), SURVEY, []).status, 'ok');
  });

  test('missing recipient id becomes null', () => {
    assertEqual(parseResponse(file({ recipientId: null }), SURVEY, []).response.recipientId, null);
  });
});

suite('survey-import — older versions and sanitising', () => {
  test('older: unknown ids are dropped and counted', () => {
    const r = parseResponse(file({
      surveyVersion: 1,
      answers: {
        qx: 'gone', q1: 'gx', q2: { ids: ['m1', 'mx'], other: null },
        q3: { r1: 2, rx: 3 }, q4: { k1: { f: 2, d: 2, w: null }, kx: { f: 1, d: 1, w: 1 } },
      },
    }), SURVEY, []);
    assertEqual(r.status, 'older');
    assertDeepEqual([...r.orphanIds].sort(), ['gx', 'kx', 'mx', 'qx', 'rx']);
    assertDeepEqual(r.response.answers, {
      q2: { ids: ['m1'], other: null }, q3: { r1: 2 }, q4: { k1: { f: 2, d: 2, w: null } },
    });
  });

  test('values of the wrong shape are dropped silently', () => {
    const r = parseResponse(file({
      answers: { q1: 42, q2: 'm1', q3: { r1: 9, r2: 'x' }, q4: { k1: { f: 7, d: 2, w: 10 } }, q5: 42, q6: 'info' },
    }), SURVEY, []);
    assertDeepEqual(r.response.answers, { q4: { k1: { f: null, d: 2, w: null } } });
    assertDeepEqual(r.orphanIds, []);
  });

  test('single "other" text is trimmed; blank other is dropped', () => {
    const r = parseResponse(file({ answers: { q1: { other: '  Partner ' }, q2: { ids: [], other: ' ' } } }), SURVEY, []);
    assertDeepEqual(r.response.answers, { q1: { other: 'Partner' } });
  });

  test('"na" is only accepted when the question allows it', () => {
    const survey = JSON.parse(JSON.stringify(SURVEY));
    survey.sections[0].questions[2].noAnswer = false;
    const r = parseResponse(file({ answers: { q3: { r1: 'na', r2: 3 } } }), survey, []);
    assertDeepEqual(r.response.answers, { q3: { r2: 3 } });
  });

  test('"other" text is dropped when the question has no other option', () => {
    const survey = JSON.parse(JSON.stringify(SURVEY));
    survey.sections[0].questions[0].other = false;
    const r = parseResponse(file({
      answers: { q1: { other: 'Partner' }, q2: { ids: ['m1'], other: 'Foo' } },
    }), survey, []);
    assertDeepEqual(r.response.answers, { q2: { ids: ['m1'], other: null } });
  });

  test('multi with only "other" text on a question without other is not stored', () => {
    const r = parseResponse(file({ answers: { q2: { ids: [], other: 'Foo' } } }), SURVEY, []);
    assertDeepEqual(r.response.answers, {});
  });
});

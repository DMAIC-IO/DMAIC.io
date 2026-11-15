/**
 * Tests for js/modules/survey-builder/domain/answers.js — the stored form of
 * an answer (one object with fixed optional keys) and the way back to the
 * form the pure modules read (text, `{ other }`, `{ ids, other }`, row map).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import {
  toStored, toLegacy, storedAnswers, legacyAnswers, legacyResponses,
} from '../../../js/modules/survey-builder/domain/answers.js';
import { MIXED, CORNERS, copy } from './cases.js';

const single = { id: 'q1', type: 'single', options: [{ id: 'o1', text: 'A' }], other: true };
const multi = { id: 'q2', type: 'multi', options: [{ id: 'm1', text: 'A' }], other: true };
const multiPlain = { id: 'q2b', type: 'multi', options: [{ id: 'm1', text: 'A' }], other: false };
const rating = { id: 'q3', type: 'rating', rows: [{ id: 'r1', text: 'A' }, { id: 'r2', text: 'B' }], noAnswer: true };
const kano = { id: 'q4', type: 'kano', rows: [{ id: 'k1', text: 'A' }], importance: true };
const text = { id: 'q5', type: 'text', multiline: true };

/** Each case: question, earlier form, stored form. */
const CASES = [
  ['single option', single, 'o1', { option: 'o1' }],
  ['single other', single, { other: 'Sonst' }, { other: 'Sonst' }],
  ['multi with other', multi, { ids: ['m1'], other: 'Fax' }, { ids: ['m1'], other: 'Fax' }],
  ['multi without other', multiPlain, { ids: ['m1'], other: null }, { ids: ['m1'], other: null }],
  ['rating with na', rating, { r1: 4, r2: 'na' }, { ratings: { r1: 4, r2: 'na' } }],
  ['kano with w null', kano, { k1: { f: 1, d: 5, w: null } }, { kano: { k1: { f: 1, d: 5, w: null } } }],
  ['text', text, 'Schneller bitte', { text: 'Schneller bitte' }],
];

suite('survey-builder answers — one form per type, there and back', () => {
  for (const [name, q, before, stored] of CASES) {
    test(`${name}: toStored`, () => {
      assertDeepEqual(toStored(q, copy(before)), stored);
    });
    test(`${name}: toLegacy(toStored(a)) is a`, () => {
      assertDeepEqual(toLegacy(q, toStored(q, copy(before))), before);
    });
  }
});

suite('survey-builder answers — corners', () => {
  test('an answer of an unknown question is kept as text; toLegacy gives undefined', () => {
    const stored = toStored(undefined, 'Freitext');
    assertDeepEqual(stored, { text: 'Freitext' });
    assertEqual(toLegacy(undefined, stored), undefined);
  });

  test('a Kano answer on a question that became a rating question survives the way there and back', () => {
    const a = { k1: { f: 1, d: 5, w: null } };
    assertDeepEqual(toLegacy(rating, toStored(rating, copy(a))), a);
  });

  test('an option id on a question that became a text question survives', () => {
    assertDeepEqual(toLegacy(text, toStored(text, 'o-alt')), 'o-alt');
  });

  test('a free text on a question that became a single choice question survives', () => {
    assertDeepEqual(toLegacy(single, toStored(single, 'frei')), 'frei');
  });

  test('a row key the question does not have survives', () => {
    const a = { r1: 3, 'r-gone': 5 };
    assertDeepEqual(toLegacy(rating, toStored(rating, copy(a))), a);
  });

  test('an empty row map stays an empty object', () => {
    assertDeepEqual(toStored(rating, {}), {});
    assertDeepEqual(toLegacy(rating, {}), {});
  });

  test('values no answer form holds are dropped', () => {
    assertEqual(toStored(single, 7), undefined);
    assertEqual(toStored(single, null), undefined);
    assertEqual(toStored(single, ['o1']), undefined);
  });
});

suite('survey-builder answers — whole responses', () => {
  test('storedAnswers and legacyAnswers are inverse for the answers of known questions', () => {
    for (const r of MIXED.responses) {
      const stored = storedAnswers(MIXED.survey, copy(r.answers));
      assertDeepEqual(legacyAnswers(MIXED.survey, stored), r.answers, r.id);
    }
  });

  test('legacyAnswers leaves out the answer of a deleted question; storedAnswers keeps it', () => {
    const answers = CORNERS.responses[0].answers;
    const stored = storedAnswers(CORNERS.survey, copy(answers));
    assertDeepEqual(stored['q-geloescht'], { text: 'Freitext einer gelöschten Frage' });
    const back = legacyAnswers(CORNERS.survey, stored);
    const { 'q-geloescht': _gone, ...known } = answers;
    assertDeepEqual(back, known);
  });

  test('legacyResponses gives every response with its answers in the earlier form', () => {
    const responses = MIXED.responses.map((r) => ({ ...copy(r), answers: storedAnswers(MIXED.survey, copy(r.answers)) }));
    assertDeepEqual(legacyResponses({ survey: MIXED.survey, responses }), copy(MIXED.responses));
  });
});

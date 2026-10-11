/**
 * D.Mike — Survey conditions tests (survey-conditions.test.js)
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md §3.2
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import {
  isVisible, availableSources, answerHasOption, documentOrder, CONDITION_CASES,
} from '../../js/modules/survey-builder/survey-conditions.js';

suite('survey-conditions — answerHasOption', () => {
  test('single answer string', () => assertEqual(answerHasOption('o1', ['o1']), true));
  test('single other answer never matches', () => assertEqual(answerHasOption({ other: 'x' }, ['o1']), false));
  test('multi answer ids', () => assertEqual(answerHasOption({ ids: ['o2', 'o3'], other: null }, ['o3']), true));
  test('missing answer', () => assertEqual(answerHasOption(undefined, ['o1']), false));
});

suite('survey-conditions — shared case table', () => {
  for (const c of CONDITION_CASES) {
    test(c.name, () => {
      const node = c.nodeId.startsWith('s')
        ? c.survey.sections.find((s) => s.id === c.nodeId)
        : documentOrder(c.survey).find((e) => e.question.id === c.nodeId).question;
      assertEqual(isVisible(node, c.answers, c.survey), c.expected);
    });
  }
});

suite('survey-conditions — availableSources', () => {
  const survey = CONDITION_CASES[0].survey;
  test('only earlier single/multi questions', () => {
    assertDeepEqual(availableSources(survey, 'q3').map((q) => q.id), ['q1', 'q2']);
  });
  test('a section sees questions of earlier sections only', () => {
    assertDeepEqual(availableSources(survey, 's2').map((q) => q.id), ['q1', 'q2']);
    assertDeepEqual(availableSources(survey, 's1').map((q) => q.id), []);
  });
  test('first question has no sources', () => {
    assertDeepEqual(availableSources(survey, 'q1'), []);
  });
});

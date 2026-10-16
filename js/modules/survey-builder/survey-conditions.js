/**
 * D.Mike — Survey conditions (survey-conditions.js)
 *
 * Visibility rules shared by the model and the stats. The exported runner
 * (survey-runner.js) carries its own copy because it cannot import; the
 * CONDITION_CASES table below is run against both so they cannot drift.
 *
 * A condition list is OR-combined. A condition holds when its source
 * question is visible and its answer contains one of the option ids.
 * A question inside a hidden section is hidden.
 *
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md §3.2
 */

/** All question types a survey may contain. @type {string[]} */
export const QUESTION_TYPES = ['single', 'multi', 'rating', 'kano', 'text', 'info'];
/** Question types that may serve as a condition source. @type {string[]} */
export const SOURCE_TYPES = ['single', 'multi'];

/**
 * @param {*} answer stored answer of a single/multi question
 * @param {string[]} optionIds
 * @returns {boolean}
 */
export function answerHasOption(answer, optionIds) {
  if (answer == null) return false;
  if (typeof answer === 'string') return optionIds.includes(answer);
  if (Array.isArray(answer.ids)) return answer.ids.some((id) => optionIds.includes(id));
  return false;
}

/**
 * All questions in document order with their section.
 * @param {object} survey
 * @returns {Array<{section: object, question: object}>}
 */
export function documentOrder(survey) {
  const out = [];
  for (const section of survey?.sections || []) {
    for (const question of section.questions || []) out.push({ section, question });
  }
  return out;
}

/**
 * @param {object} survey
 * @param {string} questionId
 * @returns {object|null} the question, or null if unknown
 */
export function findQuestion(survey, questionId) {
  return documentOrder(survey).find((e) => e.question.id === questionId)?.question || null;
}

/**
 * @param {object} survey
 * @param {string} questionId
 * @returns {object|null} the section holding the question, or null if unknown
 */
export function sectionOfQuestion(survey, questionId) {
  return documentOrder(survey).find((e) => e.question.id === questionId)?.section || null;
}

function conditionsHold(when, answers, survey) {
  if (!Array.isArray(when) || when.length === 0) return true;
  return when.some((c) => {
    const source = findQuestion(survey, c.questionId);
    return Boolean(source)
      && isVisible(source, answers, survey)
      && answerHasOption(answers?.[c.questionId], c.optionIds || []);
  });
}

/**
 * @param {object} node section (has `questions`) or question
 * @param {object} answers { [questionId]: answer }
 * @param {object} survey
 * @returns {boolean}
 */
export function isVisible(node, answers, survey) {
  if (!node) return false;
  if (!Array.isArray(node.questions)) {
    const section = sectionOfQuestion(survey, node.id);
    if (section && !conditionsHold(section.when, answers, survey)) return false;
  }
  return conditionsHold(node.when, answers, survey);
}

/**
 * Questions a node may reference in a condition: single/multi questions
 * that come earlier in document order. For a section, "earlier" means in an
 * earlier section.
 * @param {object} survey
 * @param {string} nodeId section or question id
 * @returns {object[]} questions
 */
export function availableSources(survey, nodeId) {
  const order = documentOrder(survey);
  const sectionIndex = (survey?.sections || []).findIndex((s) => s.id === nodeId);
  let earlier;
  if (sectionIndex >= 0) {
    const ids = new Set(survey.sections.slice(0, sectionIndex).flatMap((s) => s.questions.map((q) => q.id)));
    earlier = order.filter((e) => ids.has(e.question.id));
  } else {
    const i = order.findIndex((e) => e.question.id === nodeId);
    earlier = i < 0 ? [] : order.slice(0, i);
  }
  return earlier.map((e) => e.question).filter((q) => SOURCE_TYPES.includes(q.type));
}

const CASE_SURVEY = {
  id: 'sv', version: 1, lang: 'de', title: 'T', intro: '', contact: '', anonymous: false,
  sections: [
    { id: 's1', title: 'A', hint: '', when: null, questions: [
      { id: 'q1', type: 'single', text: 'Gruppe', hint: '', required: true, when: null, other: false,
        options: [{ id: 'g1', text: 'Kunde' }, { id: 'g2', text: 'Partner' }] },
      { id: 'q2', type: 'multi', text: 'Methoden', hint: '', required: false,
        when: [{ questionId: 'q1', optionIds: ['g1'] }], other: true,
        options: [{ id: 'm1', text: 'SPC' }, { id: 'm2', text: 'DoE' }] },
      { id: 'q3', type: 'text', text: 'Warum DoE?', hint: '', required: false, multiline: false,
        when: [{ questionId: 'q2', optionIds: ['m2'] }] },
    ] },
    { id: 's2', title: 'B', hint: '', when: [{ questionId: 'q1', optionIds: ['g2'] }, { questionId: 'q2', optionIds: ['m1'] }], questions: [
      { id: 'q4', type: 'text', text: 'Partnerfrage', hint: '', required: true, multiline: true, when: null },
    ] },
  ],
};

/**
 * Shared case table: run against survey-conditions.js and the runner copy.
 * @type {Array<{name: string, survey: object, nodeId: string, answers: object, expected: boolean}>}
 */
export const CONDITION_CASES = [
  { name: 'no condition is visible', survey: CASE_SURVEY, nodeId: 'q1', answers: {}, expected: true },
  { name: 'single condition met', survey: CASE_SURVEY, nodeId: 'q2', answers: { q1: 'g1' }, expected: true },
  { name: 'single condition not met', survey: CASE_SURVEY, nodeId: 'q2', answers: { q1: 'g2' }, expected: false },
  { name: 'unanswered source hides', survey: CASE_SURVEY, nodeId: 'q2', answers: {}, expected: false },
  { name: 'multi source contains option', survey: CASE_SURVEY, nodeId: 'q3', answers: { q1: 'g1', q2: { ids: ['m2'], other: null } }, expected: true },
  { name: 'hidden source never counts', survey: CASE_SURVEY, nodeId: 'q3', answers: { q1: 'g2', q2: { ids: ['m2'], other: null } }, expected: false },
  { name: 'section OR: first condition', survey: CASE_SURVEY, nodeId: 's2', answers: { q1: 'g2' }, expected: true },
  { name: 'section OR: second condition', survey: CASE_SURVEY, nodeId: 's2', answers: { q1: 'g1', q2: { ids: ['m1'], other: null } }, expected: true },
  { name: 'section OR: none', survey: CASE_SURVEY, nodeId: 's2', answers: { q1: 'g1', q2: { ids: ['m2'], other: null } }, expected: false },
  { name: 'question in hidden section is hidden', survey: CASE_SURVEY, nodeId: 'q4', answers: { q1: 'g1' }, expected: false },
  { name: 'question in visible section', survey: CASE_SURVEY, nodeId: 'q4', answers: { q1: 'g2' }, expected: true },
  { name: 'other text does not match an option', survey: CASE_SURVEY, nodeId: 'q2', answers: { q1: { other: 'g1' } }, expected: false },
];

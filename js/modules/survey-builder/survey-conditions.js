/**
 * D.Mike — Survey conditions (survey-conditions.js)
 *
 * Visibility rules shared by the model and the stats. The exported runner
 * (survey-runner.js) carries its own copy because it cannot import; the
 * shared case table in tests/modules/fixtures/survey-condition-cases.js is
 * run against both so they cannot drift.
 *
 * A condition list is OR-combined. A condition holds when its source
 * question is visible and its answer contains one of the option ids.
 * A question inside a hidden section is hidden.
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

function conditionsHold(when, answers, survey, path) {
  if (!Array.isArray(when) || when.length === 0) return true;
  return when.some((c) => {
    const source = findQuestion(survey, c.questionId);
    return Boolean(source)
      && visibleOnPath(source, answers, survey, path)
      && answerHasOption(answers?.[c.questionId], c.optionIds || []);
  });
}

// `path` holds the ids already under evaluation. The editor rules out cycles,
// but a hand-edited definition may contain one; a node met again on its own
// path counts as hidden instead of recursing forever.
function visibleOnPath(node, answers, survey, path) {
  if (!node || path.includes(node.id)) return false;
  const next = [...path, node.id];
  if (!Array.isArray(node.questions)) {
    const section = sectionOfQuestion(survey, node.id);
    if (section && !conditionsHold(section.when, answers, survey, next)) return false;
  }
  return conditionsHold(node.when, answers, survey, next);
}

/**
 * @param {object} node section (has `questions`) or question
 * @param {object} answers { [questionId]: answer }
 * @param {object} survey
 * @returns {boolean}
 */
export function isVisible(node, answers, survey) {
  return visibleOnPath(node, answers, survey, []);
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

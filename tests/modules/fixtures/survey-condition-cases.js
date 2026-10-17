/**
 * D.Mike — Shared condition cases (survey-condition-cases.js)
 * One case table for survey-conditions.js and the copy inside the exported
 * runner (survey-runner.js), so the two implementations cannot drift.
 * Not a test file: run-node.mjs only collects *.test.js.
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md §3.2
 */

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

const EDGE_SURVEY = {
  id: 'sv-edge', version: 1, lang: 'de', title: 'E', intro: '', contact: '', anonymous: false,
  sections: [
    { id: 'se', title: 'E', hint: '', when: [], questions: [
      { id: 'e1', type: 'single', text: 'Quelle', hint: '', required: false, when: null, other: false,
        options: [{ id: 'x1', text: 'Ja' }] },
      { id: 'e2', type: 'text', text: 'Verwaist', hint: '', required: false, multiline: false,
        when: [{ questionId: 'gone', optionIds: ['x1'] }] },
      { id: 'e3', type: 'text', text: 'Ohne Optionen', hint: '', required: false, multiline: false,
        when: [{ questionId: 'e1' }] },
      { id: 'e4', type: 'text', text: 'Leere Liste', hint: '', required: false, multiline: false, when: [] },
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
  { name: 'missing answers object', survey: CASE_SURVEY, nodeId: 'q1', answers: null, expected: true },
  { name: 'missing answers hide a conditional question', survey: CASE_SURVEY, nodeId: 'q2', answers: null, expected: false },
  { name: 'unknown source question hides', survey: EDGE_SURVEY, nodeId: 'e2', answers: { gone: 'x1' }, expected: false },
  { name: 'condition without option ids hides', survey: EDGE_SURVEY, nodeId: 'e3', answers: { e1: 'x1' }, expected: false },
  { name: 'empty condition list is visible', survey: EDGE_SURVEY, nodeId: 'e4', answers: {}, expected: true },
  { name: 'condition-free question in visible section', survey: EDGE_SURVEY, nodeId: 'e1', answers: {}, expected: true },
];

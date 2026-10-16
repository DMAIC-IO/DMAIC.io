/**
 * D.Mike — Shared survey fixture (survey-fixture.js)
 * Questionnaire and responses for the survey-stats and survey-report tests.
 * Not a test file: run-node.mjs only collects *.test.js.
 */

export const q = (id, type, extra) => ({ id, type, text: id.toUpperCase(), hint: '', required: false, when: null, ...extra });
export const SURVEY = {
  id: 's1', version: 1, lang: 'de', title: 'T', intro: '', contact: '', anonymous: false,
  sections: [{
    id: 'sec', title: '', hint: '', when: null, questions: [
      q('g', 'single', { options: [{ id: 'ga', text: 'A' }, { id: 'gb', text: 'B' }], other: false }),
      q('m', 'multi', { options: [{ id: 'm1', text: 'M1' }, { id: 'm2', text: 'M2' }], other: true }),
      q('c', 'single', { options: [{ id: 'c1', text: 'C1' }], other: false, when: [{ questionId: 'g', optionIds: ['ga'] }] }),
      q('r', 'rating', { rows: [{ id: 'r1', text: 'R1' }, { id: 'r2', text: 'R2' }], noAnswer: true }),
      q('k', 'kano', { rows: [{ id: 'k1', text: 'K1' }], importance: true }),
      q('t', 'text', { multiline: true }),
      q('i', 'info', {}),
    ],
  }],
};
export const resp = (id, answers, extra = {}) => ({
  id, surveyVersion: 1, recipientId: null, viaRecipient: false,
  submittedAt: `2026-10-0${id.slice(1)}T10:00:00Z`, answers, ...extra,
});
// x4 carries an answer to the hidden question c (g = gb) — stats must ignore it.
export const RESPONSES = [
  resp('x1', { g: 'ga', m: { ids: ['m1', 'm2'], other: null }, c: 'c1', r: { r1: 5, r2: 2 }, k: { k1: { f: 1, d: 5, w: 9 } }, t: 'Faster' },
    { recipientId: 'p1', viaRecipient: true }),
  resp('x2', { g: 'ga', m: { ids: ['m1'], other: 'Fax' }, r: { r1: 4, r2: 'na' }, k: { k1: { f: 1, d: 5, w: 7 } } }),
  resp('x3', { g: 'gb', m: { ids: [], other: 'Mail' }, r: { r1: 3, r2: 2 }, k: { k1: { f: 2, d: 3, w: 5 } }, t: '  ' }),
  resp('x4', { g: 'gb', c: 'c1', r: { r1: 2 }, k: { k1: { f: 2, d: 3, w: null } } }),
  resp('x5', { g: 'ga', r: { r1: 1 }, k: { k1: { f: 1, d: 5, w: 8 } } }),
];

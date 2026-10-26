/**
 * D.Mike — Survey runner DOM tests (survey-runner-dom.test.js)
 * Browser only (listed in SKIP of tests/run-node.mjs).
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import { runSurvey } from '../../js/modules/survey-builder/survey-runner.js';
import { CONDITION_CASES } from './fixtures/survey-condition-cases.js';

const SURVEY = CONDITION_CASES[0].survey;
const STRINGS = {
  progress: '{answered}/{total}', save: 'Speichern', reset: 'Neu', resetConfirm: 'Sicher?',
  missingOne: '{count} fehlt', missingOther: '{count} fehlen', saved: 'Gespeichert: {file}',
  fileAnswers: 'Antworten', other: 'Sonstiges', noAnswer: 'k. A.', untitled: 'Fragebogen',
  contact: 'Kontakt: {contact}', draftOutdated: 'Geändert – bitte prüfen',
};
const detached = new Function(`return (${runSurvey.toString()});`)();

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    has: (k) => m.has(k),
  };
}

function mount({ def = SURVEY, ...extra } = {}) {
  const root = document.createElement('div');
  const downloads = [];
  detached(def, STRINGS, {
    root,
    storage: memoryStorage(),
    download: (name, text) => downloads.push({ name, text }),
    confirm: () => true,
    now: () => new Date(2026, 9, 10, 14, 3),
    recipientId: 'r1',
    ...extra,
  });
  return { root, downloads };
}

const q = (root, id) => root.querySelector(`[data-question-id="${id}"]`);
function pick(root, qid, value) {
  const input = q(root, qid).querySelector(`input[value="${value}"]`);
  input.checked = true;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
function type(root, qid, text) {
  const input = q(root, qid).querySelector('textarea.sv-text, input.sv-text');
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
const save = (root) => root.querySelector('.sv-save').click();

suite('survey-runner — DOM', () => {
  test('renders and numbers visible questions only', () => {
    const { root } = mount();
    assertEqual(q(root, 'q1').querySelector('.sv-q__num').textContent, '1.');
    assertEqual(q(root, 'q2').hidden, true);
    assertEqual(root.querySelector('[data-section-id="s2"]').hidden, true);
  });

  test('answering a source reveals the dependent section', () => {
    const { root } = mount();
    pick(root, 'q1', 'g2');
    assertEqual(root.querySelector('[data-section-id="s2"]').hidden, false);
    assertEqual(q(root, 'q4').querySelector('.sv-q__num').textContent, '2.');
  });

  test('saving with a missing required answer marks it and downloads nothing', () => {
    const { root, downloads } = mount();
    pick(root, 'q1', 'g2');
    save(root);
    assertEqual(downloads.length, 0);
    assertTrue(q(root, 'q4').classList.contains('sv-q--missing'));
    assertEqual(root.querySelector('.sv-message').textContent, '1 fehlt');
  });

  test('hidden answers are not written to the answer file', () => {
    const { root, downloads } = mount();
    pick(root, 'q1', 'g1');
    pick(root, 'q2', 'm2');
    type(root, 'q3', 'Weil');
    pick(root, 'q1', 'g2');
    type(root, 'q4', 'Hallo');
    save(root);
    assertEqual(downloads.length, 1);
    assertEqual(downloads[0].name, 'Antworten_T_20261010_1403.json');
    const file = JSON.parse(downloads[0].text);
    assertEqual(file.format, 'dmike-survey-response');
    assertEqual(file.formatVersion, 1);
    assertEqual(file.surveyId, 'sv');
    assertEqual(file.surveyVersion, 1);
    assertEqual(file.recipientId, 'r1');
    assertDeepEqual(file.answers, { q1: 'g2', q4: 'Hallo' });
    assertTrue(typeof file.responseId === 'string' && file.responseId.length > 8);
  });

  test('typing an "other" text ticks its box', () => {
    const { root } = mount();
    pick(root, 'q1', 'g1');
    const text = q(root, 'q2').querySelector('.sv-other');
    text.value = 'Kaizen';
    text.dispatchEvent(new Event('input', { bubbles: true }));
    assertEqual(q(root, 'q2').querySelector('input[value="__other"]').checked, true);
  });

  test('the draft is restored on the next load', () => {
    const storage = memoryStorage();
    pick(mount({ storage }).root, 'q1', 'g2');
    assertTrue(storage.has('dmike-survey:sv:r1'));
    const second = mount({ storage });
    assertEqual(q(second.root, 'q1').querySelector('input[value="g2"]').checked, true);
  });

  test('a draft of the same version shows no notice', () => {
    const storage = memoryStorage();
    pick(mount({ storage }).root, 'q1', 'g2');
    assertEqual(mount({ storage }).root.querySelector('.sv-notice').hidden, true);
  });

  test('a draft of an older version is restored with a notice to check the answers', () => {
    const storage = memoryStorage();
    pick(mount({ storage }).root, 'q1', 'g2');
    const { root } = mount({ storage, def: { ...SURVEY, version: 2 } });
    assertEqual(q(root, 'q1').querySelector('input[value="g2"]').checked, true);
    const notice = root.querySelector('.sv-notice');
    assertEqual(notice.hidden, false);
    assertEqual(notice.textContent, 'Geändert – bitte prüfen');
  });

  test('reset hides the outdated-draft notice', () => {
    const storage = memoryStorage();
    pick(mount({ storage }).root, 'q1', 'g2');
    const { root } = mount({ storage, def: { ...SURVEY, version: 2 } });
    root.querySelector('.sv-reset').click();
    assertEqual(root.querySelector('.sv-notice').hidden, true);
  });

  test('storage that throws does not break the runner', () => {
    const boom = () => { throw new Error('SecurityError'); };
    const { root, downloads } = mount({ storage: { getItem: boom, setItem: boom, removeItem: boom } });
    pick(root, 'q1', 'g2');
    type(root, 'q4', 'x');
    save(root);
    assertEqual(downloads.length, 1);
  });

  test('reset clears answers and the draft', () => {
    const storage = memoryStorage();
    const { root } = mount({ storage });
    pick(root, 'q1', 'g2');
    root.querySelector('.sv-reset').click();
    assertEqual(q(root, 'q1').querySelector('input[value="g2"]').checked, false);
    assertEqual(storage.has('dmike-survey:sv:r1'), false);
  });
});

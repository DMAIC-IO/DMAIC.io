/**
 * D.Mike — Survey runner logic tests (survey-runner.test.js)
 * Runs the runner rebuilt from its own source text, exactly as the exported
 * page does, so a reference to an outer identifier fails here.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { runSurvey, RUNNER_CSS } from '../../js/modules/survey-builder/survey-runner.js';
import { documentOrder } from '../../js/modules/survey-builder/survey-conditions.js';
import { CONDITION_CASES } from './fixtures/survey-condition-cases.js';

const detached = new Function(`return (${runSurvey.toString()});`)();
const logic = (survey) => detached(survey, {}, { logicOnly: true });

suite('survey-runner — self-contained source', () => {
  test('source contains no closing script tag', () => {
    assertEqual(/<\/script/i.test(runSurvey.toString()), false);
  });
  test('stylesheet contains no closing style tag', () => {
    assertEqual(/<\/style/i.test(RUNNER_CSS), false);
  });
  test('rebuilt from its source it still runs', () => {
    assertEqual(typeof logic(CONDITION_CASES[0].survey).isVisible, 'function');
  });
});

suite('survey-runner — shared condition cases', () => {
  for (const c of CONDITION_CASES) {
    test(c.name, () => {
      const node = c.nodeId.startsWith('s')
        ? c.survey.sections.find((s) => s.id === c.nodeId)
        : documentOrder(c.survey).find((e) => e.question.id === c.nodeId).question;
      assertEqual(logic(c.survey).isVisible(node, c.answers), c.expected);
    });
  }
});

const Q = {
  single: { id: 'a', type: 'single', required: true, other: true, options: [{ id: 'o1', text: 'x' }] },
  multi: { id: 'b', type: 'multi', required: true, other: false, options: [{ id: 'o1', text: 'x' }] },
  rating: { id: 'c', type: 'rating', required: true, noAnswer: true, rows: [{ id: 'r1', text: 'x' }, { id: 'r2', text: 'y' }] },
  kano: { id: 'd', type: 'kano', required: true, importance: true, rows: [{ id: 'k1', text: 'x' }] },
  text: { id: 'e', type: 'text', required: true, multiline: false },
};
const L = logic({ id: 'x', version: 1, sections: [] });

suite('survey-runner — isAnswered', () => {
  const cases = [
    ['single option', Q.single, 'o1', true],
    ['single unknown option', Q.single, 'zz', false],
    ['single other with text', Q.single, { other: 'Etwas' }, true],
    ['single other blank', Q.single, { other: '  ' }, false],
    ['multi with ids', Q.multi, { ids: ['o1'], other: null }, true],
    ['multi empty', Q.multi, { ids: [], other: null }, false],
    ['rating all rows, na counts', Q.rating, { r1: 3, r2: 'na' }, true],
    ['rating one row missing', Q.rating, { r1: 3 }, false],
    ['rating out of scale', Q.rating, { r1: 6, r2: 1 }, false],
    ['kano f, d, w', Q.kano, { k1: { f: 1, d: 5, w: 9 } }, true],
    ['kano without w when importance is on', Q.kano, { k1: { f: 1, d: 5, w: null } }, false],
    ['text blank', Q.text, '   ', false],
    ['text filled', Q.text, 'ok', true],
    ['nothing', Q.text, undefined, false],
  ];
  for (const [name, q, a, expected] of cases) {
    test(name, () => assertEqual(L.isAnswered(q, a), expected));
  }
  test('kano without importance needs only f and d', () => {
    assertEqual(L.isAnswered({ ...Q.kano, importance: false }, { k1: { f: 2, d: 2, w: null } }), true);
  });
  test('rating "na" without noAnswer is not an answer', () => {
    assertEqual(L.isAnswered({ ...Q.rating, noAnswer: false }, { r1: 'na', r2: 1 }), false);
  });
});

suite('survey-runner — missing and visibleAnswers', () => {
  const survey = CONDITION_CASES[0].survey;

  test('hidden answers are dropped and never required', () => {
    const run = logic(survey);
    // s2 (with required q4) is hidden: q1 = g1 and q2 lacks m1
    const answers = { q1: 'g1', q2: { ids: ['m2'], other: null }, q3: 'Weil', q4: 'stale' };
    assertDeepEqual(run.missing(answers), []);
    assertDeepEqual(Object.keys(run.visibleAnswers(answers)), ['q1', 'q2', 'q3']);
    // changing q2 hides q3 and reveals s2
    const changed = { ...answers, q2: { ids: ['m1'], other: null } };
    assertDeepEqual(Object.keys(run.visibleAnswers(changed)), ['q1', 'q2', 'q4']);
    assertDeepEqual(run.missing({ q1: 'g2' }), ['q4']);
  });

  test('unanswered required source is reported', () => {
    assertDeepEqual(logic(survey).missing({}), ['q1']);
  });
});

/**
 * Kano: Auswertung mit Merker (domain/evaluate.js) — gleiche Eingaben liefern
 * dasselbe Objekt ohne zweiten Engine-Lauf, jede Änderung rechnet neu, der
 * Merker gilt je Model.
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { evaluation, evaluationRuns } from '../../../js/modules/kano/domain/evaluate.js';

const input = () => ({
  items: [{ id: 'i1', nodeId: null, label: 'A', path: '', missing: false }],
  respondents: [{ id: 'r1', name: 'R' }],
  answers: { r1: { i1: { f: 1, d: 5, w: 3 } } },
  options: { importance: true },
});

suite('kano Auswertung — Merker', () => {
  test('gleiche Eingaben: dasselbe Ergebnis, ein Engine-Lauf', () => {
    const m = input();
    const before = evaluationRuns();
    const a = evaluation(m);
    const b = evaluation(m);
    assertTrue(a === b);
    assertEqual(evaluationRuns() - before, 1);
    assertEqual(a.rows[0].category, 'O');
  });
  test('jede der vier Eingaben rechnet neu', () => {
    const m = input();
    const first = evaluation(m);
    m.answers = { r1: { i1: { f: 1, d: 3, w: 3 } } };
    const second = evaluation(m);
    assertTrue(first !== second);
    assertEqual(second.rows[0].category, 'A');
    m.options = { importance: false };
    assertEqual(evaluation(m).rows[0].importanceMean, null);
    m.respondents = [];
    assertEqual(evaluation(m).totals.respondents, 0);
    m.items = [];
    assertEqual(evaluation(m).rows.length, 0);
  });
  test('der Merker gilt je Model', () => {
    const a = input();
    const b = input();
    const before = evaluationRuns();
    evaluation(a);
    evaluation(b);
    assertEqual(evaluationRuns() - before, 2);
  });
});

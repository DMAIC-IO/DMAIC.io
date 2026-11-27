/**
 * Activity-Flowchart: Bandzeilen und Rasterlayout (domain/layout.js) — die
 * Layoutfälle der Altsuite und der Merker je Model.
 */
import { suite, test, assertEqual, assertDeepEqual, assert } from '../../test-utils.js';
import {
  bandRows, bandLabel, bandFlow, layoutOf, layoutFor,
} from '../../../js/modules/activity-flowchart/domain/layout.js';

const a = (id, branchId = 'main') => ({ id, kind: 'activity', branchId, decision: null });
const d = (id, noTarget = 'end', branchId = 'main', label = '') => ({ id, kind: 'decision', branchId, decision: { label, noTarget } });
const col = (steps, id) => layoutOf(steps).colOf.get(id);
const T = (key, p) => ({ mainPath: 'Main path', unnamedDecision: '(no question)', bandLabel: `No: ${p?.q}` })[key] ?? key;

suite('Activity-Flowchart Bandzeilen', () => {
  test('ohne Rauten nur der Hauptpfad', () => {
    assertDeepEqual(bandRows([a('a'), a('b')], (o) => bandLabel(o, T)), [{ id: 'main', ownerId: null, label: 'Main path', depth: 0 }]);
  });

  test('je Raute ein Band, tiefenzuerst unter dem Band der Raute', () => {
    const steps = [d('D', 'end', 'main', 'Q?'), d('E', 'end', 'no:D'), a('x', 'no:E'), d('F')];
    assertDeepEqual(bandRows(steps, (o) => bandLabel(o, T)).map((r) => [r.id, r.ownerId, r.label, r.depth]), [
      ['main', null, 'Main path', 0], ['no:D', 'D', 'No: Q?', 1], ['no:E', 'E', 'No: (no question)', 2], ['no:F', 'F', 'No: (no question)', 1],
    ]);
  });
});

suite('Activity-Flowchart Layout', () => {
  test('bandFlow: rückwärts, vorwärts, Sackgasse, unbekanntes Ziel', () => {
    const steps = [a('A'), d('D', 'A'), a('B'), d('E', 'B'), d('F', 'zz')];
    assertEqual(bandFlow(steps, steps[1]).backward, true);
    assertEqual(bandFlow(steps, steps[1]).target.id, 'A');
    assertEqual(bandFlow(steps, steps[3]).backward, true);
    assertEqual(bandFlow([d('D', 'B'), a('B')], d('D', 'B')).backward, false);
    assertEqual(bandFlow(steps, d('X')), null);
    assertEqual(bandFlow(steps, steps[4]), null);
  });

  test('der Umweg beginnt direkt unter seiner Raute', () => {
    const steps = [a('A'), d('D'), a('u', 'no:D')];
    assertEqual(col(steps, 'u'), col(steps, 'D'));
  });

  test('eine Sackgasse lässt den Hauptpfad dicht', () => {
    const steps = [a('A'), d('D'), a('u', 'no:D'), a('B')];
    assertDeepEqual([col(steps, 'A'), col(steps, 'D'), col(steps, 'B')], [1, 2, 3]);
  });

  test('ein Vorwärts-Wiedereinstieg schiebt den Hauptpfad hinter den Ausgang', () => {
    const steps = [a('A'), d('D', 'B'), a('u1', 'no:D'), a('u2', 'no:D'), a('B')];
    const dc = col(steps, 'D');
    assertEqual(col(steps, 'u1'), dc);
    assertEqual(col(steps, 'u2'), dc + 1);
    assertEqual(col(steps, 'B'), dc + 3);
  });

  test('ein Umweg hält seine Karten zusammen, auch wenn die Kette sie trennt', () => {
    const steps = [a('A'), d('D', 'B'), a('u1', 'no:D'), a('B'), a('C'), a('u2', 'no:D')];
    const u1 = col(steps, 'u1');
    assertEqual(col(steps, 'u2'), u1 + 1);
    assert(col(steps, 'B') > u1 + 2, 'Wiedereinstieg hinter Karten und Ausgang');
  });

  test('ein Rückwärtsband wächst nach links, der Hauptpfad rückt ab der Zielkarte', () => {
    const one = [a('A'), a('B'), d('D', 'A'), a('u1', 'no:D')];
    const two = [...one, a('u2', 'no:D')];
    assertEqual(col(two, 'u2'), col(two, 'u1') - 1);
    assertEqual(col(two, 'A'), col(one, 'A'));
    assert(col(two, 'B') > col(one, 'B'), 'B rückt nach rechts');
    // Zwischen Zielkarte und letzter Umwegkarte bleibt eine Spalte für den Ausgang.
    assertEqual(col(two, 'u2'), col(two, 'A') + 2);
  });

  test('count ist die größte Spalte', () => {
    const steps = [a('A'), d('D', 'B'), a('u1', 'no:D'), a('u2', 'no:D'), a('B')];
    assertEqual(layoutOf(steps).count, col(steps, 'B'));
    assertEqual(layoutOf([]).count, 0);
  });
});

suite('Activity-Flowchart Layout — Merker je Model', () => {
  test('dieselbe Kette liefert dasselbe Objekt, eine Änderung ein neues; Texte zählen nicht', () => {
    const m = { steps: [a('A'), d('D', 'A', 'main', 'Q'), a('u', 'no:D')] };
    const first = layoutFor(m);
    assert(layoutFor(m) === first, 'Treffer');
    m.steps = m.steps.map((s) => (s.id === 'D' ? { ...s, decision: { label: 'Neu', noTarget: 'A' } } : s));
    assert(layoutFor(m) === first, 'Text ändert die Signatur nicht');
    m.steps = [...m.steps, a('B')];
    assert(layoutFor(m) !== first, 'neue Kette, neues Layout');
  });

  test('zwei Models mit verschiedenen Ketten zeichnen je ihr Layout', () => {
    const m1 = { steps: [a('A'), a('B')] };
    const m2 = { steps: [a('A'), d('D', 'A'), a('u', 'no:D'), a('B')] };
    const l1 = layoutFor(m1);
    const l2 = layoutFor(m2);
    assertEqual(l1.colOf.get('B'), 2);
    assert(l2.colOf.get('B') > 3, 'm2 hat Rückwärtsband');
    assert(layoutFor(m1) === l1 && layoutFor(m2) === l2, 'beide Merker bleiben');
  });
});

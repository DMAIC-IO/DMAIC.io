import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/opportunity-flowchart/domain/model.js';

const V1 = { version: '1.0' };

/** @param {() => any} fn @returns {any} der geworfene Fehler */
function errorOf(fn) {
  try { fn(); } catch (err) { return err; }
  throw new Error('Expected function to throw');
}

/** Drei Schritte a, b, c (a nva). */
function three() {
  return State.fromJSON({
    _schema: V1,
    steps: [
      { id: 'a', title: 'A', description: '', side: 'nva', substeps: [{ id: 'x', title: 'X' }, { id: 'y', title: 'Y' }] },
      { id: 'b', title: 'B', description: '', side: 'va', substeps: [] },
      { id: 'c', title: 'C', description: '', side: 'va', substeps: [] },
    ],
  });
}

suite('Opportunity-Flowchart Model — Kommandos', () => {
  test('Vorgaben: leer, ohne Inhalt', () => {
    const s = new State();
    assertDeepEqual(s.steps, []);
    assertDeepEqual(s.expanded, []);
    assertEqual(s.hasContent(), false);
  });

  test('addStep ohne Index hängt an, liefert id mit Präfix s; hasContent wird wahr', () => {
    const s = new State();
    const id = s.addStep({ side: 'va' });
    assert(id.startsWith('s'), 'Präfix s');
    assertEqual(s.steps.length, 1);
    assertEqual(s.steps[0].id, id);
    assertEqual(s.hasContent(), true);
  });

  test('addStep mit Index fügt vorn ein; falsche Seite wird abgelehnt', () => {
    const s = three();
    const id = s.addStep({ side: 'nva', index: 0 });
    assertEqual(s.steps[0].id, id);
    assertEqual(s.steps[0].side, 'nva');
    assertEqual(s.steps.length, 4);
    assertEqual(errorOf(() => s.addStep({ side: 'x' })).param, 'side');
  });

  test('removeStep entfernt den Schritt und die id aus expanded', () => {
    const s = three();
    s.setExpanded({ id: 'a', expanded: true });
    s.setExpanded({ id: 'b', expanded: true });
    s.removeStep({ id: 'a' });
    assertDeepEqual(s.steps.map((x) => x.id), ['b', 'c']);
    assertDeepEqual(s.expanded, ['b']);
  });

  test('moveStep mit Endindex; Index gleich der Länge wird abgelehnt', () => {
    const s = three();
    s.moveStep({ id: 'a', index: 2 });
    assertDeepEqual(s.steps.map((x) => x.id), ['b', 'c', 'a']);
    assertEqual(errorOf(() => s.moveStep({ id: 'a', index: 3 })).param, 'index');
  });

  test('moveStep mit side setzt Index und Seite', () => {
    const s = three();
    s.moveStep({ id: 'b', index: 0, side: 'nva' });
    assertDeepEqual(s.steps.map((x) => [x.id, x.side]), [['b', 'nva'], ['a', 'nva'], ['c', 'va']]);
  });

  test('setSide setzt die Seite', () => {
    const s = three();
    s.setSide({ id: 'a', side: 'va' });
    assertEqual(s.steps[0].side, 'va');
    assertEqual(errorOf(() => s.setSide({ id: 'a', side: 'q' })).param, 'side');
  });

  test('addSubstep liefert id mit Präfix ss; removeSubstep und moveSubstep', () => {
    const s = three();
    const id = s.addSubstep({ stepId: 'b' });
    assert(id.startsWith('ss'), 'Präfix ss');
    assertDeepEqual(s.steps[1].substeps, [{ id, title: '' }]);
    s.moveSubstep({ stepId: 'a', substepId: 'x', index: 1 });
    assertDeepEqual(s.steps[0].substeps.map((x) => x.id), ['y', 'x']);
    assertEqual(errorOf(() => s.moveSubstep({ stepId: 'a', substepId: 'x', index: 2 })).param, 'index');
    s.removeSubstep({ stepId: 'a', substepId: 'y' });
    assertDeepEqual(s.steps[0].substeps.map((x) => x.id), ['x']);
    assertEqual(errorOf(() => s.removeSubstep({ stepId: 'a', substepId: 'nope' })).param, 'substepId');
  });

  test('setExpanded nimmt die id einmal auf, false entfernt sie', () => {
    const s = three();
    s.setExpanded({ id: 'a', expanded: true });
    s.setExpanded({ id: 'a', expanded: true });
    assertDeepEqual(s.expanded, ['a']);
    s.setExpanded({ id: 'a', expanded: false });
    assertDeepEqual(s.expanded, []);
  });

  test('appendSteps ergibt neue ids mit leeren Unterschritten', () => {
    const s = new State();
    const n = s.appendSteps({ steps: [
      { title: 'P', description: 'd', side: 'va' },
      { title: 'Q', description: '', side: 'nva' },
    ] });
    assertEqual(n, 2);
    assertEqual(s.steps.length, 2);
    assert(s.steps[0].id !== s.steps[1].id, 'ids verschieden');
    assertDeepEqual(s.steps.map((x) => x.substeps), [[], []]);
    assertDeepEqual(s.steps.map((x) => x.title), ['P', 'Q']);
  });
});

suite('Opportunity-Flowchart Model — Reparatur beim Laden', () => {
  const step = (id, extra = {}) => ({ id, title: id, description: '', side: 'va', substeps: [], ...extra });

  test('doppelte Schritt-ids: das erste Vorkommen bleibt', () => {
    const m = State.fromJSON({ _schema: V1, steps: [step('a'), step('b'), step('a', { title: 'dup' })] }, { repair: true });
    assertDeepEqual(m.steps.map((x) => x.title), ['a', 'b']);
  });

  test('doppelte Unterschritt-ids je Schritt: das erste bleibt', () => {
    const m = State.fromJSON({
      _schema: V1,
      steps: [step('a', { substeps: [{ id: 'x', title: '1' }, { id: 'x', title: '2' }] }),
        step('b', { substeps: [{ id: 'x', title: '3' }] })],
    }, { repair: true });
    assertDeepEqual(m.steps[0].substeps, [{ id: 'x', title: '1' }]);
    assertDeepEqual(m.steps[1].substeps, [{ id: 'x', title: '3' }]);
  });

  test('expanded mit unbekannter id: still entfernt, auch beim strengen Laden', () => {
    const m = State.fromJSON({ _schema: V1, steps: [step('a')], expanded: ['a', 'gone'] });
    assertDeepEqual(m.expanded, ['a']);
  });
});

suite('Opportunity-Flowchart Model — Invariantennamen', () => {
  test('die drei Invarianten heißen uniqueStepIds, uniqueSubstepIds, validExpanded', () => {
    assertDeepEqual(Object.keys(State.schema.invariants), ['uniqueStepIds', 'uniqueSubstepIds', 'validExpanded']);
  });
});

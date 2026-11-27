/**
 * Deployment-Flowchart: Model-Kommandos samt Ablehnungen, die sechs
 * Invarianten beim Schreiben und `instance.set`-artiges Schreiben ganzer
 * Felder (`setFields`).
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State, UNASSIGNED_ID } from '../../../js/modules/deployment-flowchart/domain/model.js';
import { setFields } from '../../../js/core/model.js';

const V1 = { version: '1.0' };
const plain = (v) => JSON.parse(JSON.stringify(v));

/** @param {() => any} fn @returns {any} der geworfene Fehler */
function errorOf(fn) {
  try { fn(); } catch (err) { return err; }
  throw new Error('Expected function to throw');
}

/** Bahnen v, f; Schritte a (v, zwei Unterschritte), b (f), c (v). */
function three() {
  return State.fromJSON({
    _schema: V1,
    lanes: [{ id: 'v', name: 'Vertrieb' }, { id: 'f', name: 'Fertigung' }],
    steps: [
      { id: 'a', title: 'A', description: '', laneId: 'v', substeps: [{ id: 'x', title: 'X' }, { id: 'y', title: 'Y' }] },
      { id: 'b', title: 'B', description: '', laneId: 'f', substeps: [] },
      { id: 'c', title: 'C', description: '', laneId: 'v', substeps: [] },
    ],
    expanded: [],
  });
}

const ids = (s) => s.steps.map((x) => x.id);
const laneIds = (s) => s.lanes.map((l) => l.id);

suite('Deployment-Flowchart Model — Kommandos', () => {
  test('Vorgaben: leer, ohne Inhalt; UNASSIGNED_ID', () => {
    const s = new State();
    assertDeepEqual(plain(s.steps), []);
    assertDeepEqual(plain(s.lanes), []);
    assertDeepEqual(plain(s.expanded), []);
    assertEqual(s.hasContent(), false);
    assertEqual(UNASSIGNED_ID, 'unassigned');
  });

  test('addStep ohne Angaben: hinten, in unassigned; die Bahn entsteht hinten', () => {
    const s = three();
    const id = s.addStep({});
    assert(id.startsWith('s'), 'Präfix s');
    assertEqual(s.steps[3].id, id);
    assertEqual(s.steps[3].laneId, 'unassigned');
    assertDeepEqual(laneIds(s), ['v', 'f', 'unassigned']);
    assertEqual(s.hasContent(), true);
    s.addStep({});
    assertDeepEqual(laneIds(s), ['v', 'f', 'unassigned'], 'die Bahn entsteht nur einmal');
  });

  test('addStep mit index und laneId fügt in der Bahn ein; Ablehnungen mit param', () => {
    const s = three();
    const id = s.addStep({ index: 1, laneId: 'f' });
    assertDeepEqual(ids(s), ['a', id, 'b', 'c']);
    assertEqual(s.steps[1].laneId, 'f');
    assertEqual(errorOf(() => s.addStep({ laneId: 'weg' })).param, 'laneId');
    assertEqual(errorOf(() => s.addStep({ index: 9 })).param, 'index');
    assertEqual(s.steps.length, 4);
  });

  test('removeStep entfernt den Schritt und die id aus expanded', () => {
    const s = three();
    s.setExpanded({ id: 'a', expanded: true });
    s.setExpanded({ id: 'b', expanded: true });
    s.removeStep({ id: 'a' });
    assertDeepEqual(ids(s), ['b', 'c']);
    assertDeepEqual(plain(s.expanded), ['b']);
    assertEqual(errorOf(() => s.removeStep({ id: 'a' })).param, 'id');
  });

  test('moveStep mit Endindex; ohne laneId bleibt die Bahn; Index gleich der Länge abgelehnt', () => {
    const s = three();
    s.moveStep({ id: 'a', index: 2 });
    assertDeepEqual(ids(s), ['b', 'c', 'a']);
    assertEqual(s.steps[2].laneId, 'v');
    assertEqual(errorOf(() => s.moveStep({ id: 'a', index: 3 })).param, 'index');
  });

  test('moveStep mit laneId setzt Position und Bahn; unassigned legt die Bahn an; unbekannt abgelehnt', () => {
    const s = three();
    s.moveStep({ id: 'c', index: 0, laneId: 'f' });
    assertDeepEqual(s.steps.map((x) => [x.id, x.laneId]), [['c', 'f'], ['a', 'v'], ['b', 'f']]);
    s.moveStep({ id: 'a', index: 1, laneId: 'unassigned' });
    assertEqual(s.steps[1].laneId, 'unassigned');
    assertDeepEqual(laneIds(s), ['v', 'f', 'unassigned']);
    assertEqual(errorOf(() => s.moveStep({ id: 'a', index: 0, laneId: 'weg' })).param, 'laneId');
    assertDeepEqual(ids(s), ['c', 'a', 'b'], 'abgelehnt: nichts verschoben');
  });

  test('setLaneForStep: Position bleibt; unassigned legt die Bahn an; unbekannt abgelehnt', () => {
    const s = three();
    s.setLaneForStep({ stepId: 'b', laneId: 'v' });
    assertDeepEqual(s.steps.map((x) => x.laneId), ['v', 'v', 'v']);
    s.setLaneForStep({ stepId: 'b', laneId: 'unassigned' });
    assertEqual(s.steps[1].laneId, 'unassigned');
    assertDeepEqual(laneIds(s), ['v', 'f', 'unassigned']);
    assertEqual(errorOf(() => s.setLaneForStep({ stepId: 'b', laneId: 'weg' })).param, 'laneId');
    assertEqual(errorOf(() => s.setLaneForStep({ stepId: 'q', laneId: 'v' })).param, 'stepId');
  });

  test('addLane hängt eine unbenannte Bahn hinten an und liefert ihre id', () => {
    const s = three();
    const id = s.addLane({});
    assert(id.startsWith('lane-'), 'Präfix lane-');
    assertDeepEqual(plain(s.lanes[2]), { id, name: '' });
  });

  test('removeLane: Schritte nach unassigned, nie gelöscht; die Bahn entsteht hinten', () => {
    const s = three();
    s.removeLane({ laneId: 'v' });
    assertDeepEqual(laneIds(s), ['f', 'unassigned']);
    assertDeepEqual(s.steps.map((x) => x.laneId), ['unassigned', 'f', 'unassigned']);
    assertEqual(s.steps.length, 3);
  });

  test('removeLane legt unassigned auch ohne betroffene Schritte an (wie die Altform)', () => {
    const s = three();
    const id = s.addLane({});
    s.removeLane({ laneId: id });
    assertDeepEqual(laneIds(s), ['v', 'f', 'unassigned']);
  });

  test('removeLane lehnt unassigned und unbekannte Bahnen ab (param laneId)', () => {
    const s = three();
    s.addStep({});
    assertEqual(errorOf(() => s.removeLane({ laneId: 'unassigned' })).param, 'laneId');
    assertEqual(errorOf(() => s.removeLane({ laneId: 'weg' })).param, 'laneId');
    assertDeepEqual(laneIds(s), ['v', 'f', 'unassigned']);
  });

  test('addSubstep liefert id mit Präfix ss; removeSubstep und moveSubstep mit Endindex', () => {
    const s = three();
    const id = s.addSubstep({ stepId: 'b' });
    assert(id.startsWith('ss'), 'Präfix ss');
    assertDeepEqual(plain(s.steps[1].substeps), [{ id, title: '' }]);
    s.moveSubstep({ stepId: 'a', substepId: 'x', index: 1 });
    assertDeepEqual(s.steps[0].substeps.map((x) => x.id), ['y', 'x']);
    s.removeSubstep({ stepId: 'a', substepId: 'y' });
    assertDeepEqual(s.steps[0].substeps.map((x) => x.id), ['x']);
    assertEqual(errorOf(() => s.removeSubstep({ stepId: 'a', substepId: 'q' })).param, 'substepId');
  });

  test('setExpanded schaltet die id in expanded', () => {
    const s = three();
    s.setExpanded({ id: 'a', expanded: true });
    s.setExpanded({ id: 'a', expanded: true });
    assertDeepEqual(plain(s.expanded), ['a']);
    s.setExpanded({ id: 'a', expanded: false });
    assertDeepEqual(plain(s.expanded), []);
  });

  test('appendSteps: alle nach unassigned, Anzahl zurück; leere Liste legt keine Bahn an', () => {
    const s = three();
    assertEqual(s.appendSteps({ steps: [] }), 0);
    assertDeepEqual(laneIds(s), ['v', 'f']);
    assertEqual(s.appendSteps({ steps: [{ title: 'P', description: 'd' }, { title: 'Q', description: '' }] }), 2);
    assertDeepEqual(s.steps.slice(3).map((x) => [x.title, x.description, x.laneId]), [['P', 'd', 'unassigned'], ['Q', '', 'unassigned']]);
    assertDeepEqual(laneIds(s), ['v', 'f', 'unassigned']);
  });
});

suite('Deployment-Flowchart Model — Invarianten beim Schreiben', () => {
  test('lanes ohne die Bahn eines Schritts: knownLanes lehnt ab, Zustand bleibt', () => {
    const s = three();
    const err = errorOf(() => setFields(s, { lanes: [{ id: 'f', name: 'Fertigung' }] }));
    assertEqual(err.invariant, 'knownLanes');
    assertDeepEqual(laneIds(s), ['v', 'f']);
  });

  test('umbenannte Bahn-id, auf die ein Schritt zeigt: abgelehnt', () => {
    const s = three();
    assertEqual(errorOf(() => setFields(s, { lanes: [{ id: 'v2', name: 'V' }, { id: 'f', name: 'F' }] })).invariant, 'knownLanes');
  });

  test('steps mit unbekannter laneId: abgelehnt', () => {
    const s = three();
    const steps = plain(s.steps);
    steps[0].laneId = 'weg';
    assertEqual(errorOf(() => setFields(s, { steps })).invariant, 'knownLanes');
    assertEqual(s.steps[0].laneId, 'v');
  });

  test('Name an unassigned: reservedLane lehnt ab', () => {
    const s = three();
    s.addStep({});
    const lanes = plain(s.lanes);
    lanes[2].name = 'Frei';
    assertEqual(errorOf(() => setFields(s, { lanes })).invariant, 'reservedLane');
    assertEqual(s.lanes[2].name, '');
  });

  test('doppelte Bahn-, Schritt- und Unterschritt-ids: abgelehnt', () => {
    const s = three();
    assertEqual(errorOf(() => setFields(s, { lanes: [...plain(s.lanes), { id: 'v', name: 'X' }] })).invariant, 'uniqueLaneIds');
    const steps = plain(s.steps);
    assertEqual(errorOf(() => setFields(s, { steps: [...steps, { ...steps[0] }] })).invariant, 'uniqueStepIds');
    steps[0].substeps[1].id = 'x';
    assertEqual(errorOf(() => setFields(s, { steps })).invariant, 'uniqueSubstepIds');
  });

  test('expanded nur mit vorhandenen Schritten: heilt beim strengen Laden still', () => {
    const s = State.fromJSON({ ...plain(three().toJSON()), expanded: ['q', 'a'] });
    assertDeepEqual(plain(s.expanded), ['a']);
  });

  test('Name einer eigenen Bahn ist frei schreibbar', () => {
    const s = three();
    const lanes = plain(s.lanes);
    lanes[0].name = 'Sales';
    setFields(s, { lanes });
    assertEqual(s.lanes[0].name, 'Sales');
  });
});

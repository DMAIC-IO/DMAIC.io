/**
 * Tests for core/agent/agent-revisions.js — der Merker „was hat der Agent
 * gesehen" für Lesen vor Schreiben (contract 2).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { createRevisionTracker } from '../../../js/core/agent/agent-revisions.js';
import { ERRORS } from '../../../js/core/agent/agent-contract.js';

/** Ein stateManager-Ersatz, dessen Revisionen der Test von Hand dreht. */
function fakeState() {
  const revs = new Map();
  let structure = 1;
  return {
    revs,
    bump: () => { structure += 1; },
    getModuleRevision: (id) => revs.get(id),
    getStructureRevision: () => structure,
  };
}

suite('agent-revisions — Lesen vor Schreiben', () => {

  test('der Resolver liefert die Pfade, die beim Merken und Vergleichen nicht zählen', () => {
    const asked = [];
    const sm = { getModuleRevision: (id, paths) => { asked.push([id, paths]); return 1; }, getStructureRevision: () => 1 };
    const tracker = createRevisionTracker(sm, (id) => (id === 'a' ? ['activeTab'] : []));
    tracker.markInstance('a');
    tracker.isInstanceCurrent('a');
    tracker.markInstance('b');
    assertDeepEqual(asked, [['a', ['activeTab']], ['a', ['activeTab']], ['b', []]]);
  });

  test('ohne Resolver zählt alles', () => {
    const asked = [];
    const sm = { getModuleRevision: (id, paths) => { asked.push(paths); return 1; }, getStructureRevision: () => 1 };
    createRevisionTracker(sm).markInstance('a');
    assertDeepEqual(asked, [[]]);
  });
  test('nie gelesen heißt veraltet — Instanz und Struktur', () => {
    const tracker = createRevisionTracker(fakeState());
    assertEqual(tracker.isInstanceCurrent('ws-1'), false);
    assertEqual(tracker.isStructureCurrent(), false);
  });

  test('gelesen und unverändert heißt aktuell, auch ohne gespeicherten Zustand', () => {
    const sm = fakeState();
    const tracker = createRevisionTracker(sm);
    tracker.markInstance('ws-1');                 // Revision undefined: noch kein Zustand
    assertEqual(tracker.isInstanceCurrent('ws-1'), true);
    sm.revs.set('ws-1', 5);
    assertEqual(tracker.isInstanceCurrent('ws-1'), false, 'eine Änderung danach macht veraltet');
    tracker.markInstance('ws-1');
    assertEqual(tracker.isInstanceCurrent('ws-1'), true);
  });

  test('die Struktur folgt markStructure und getStructureRevision', () => {
    const sm = fakeState();
    const tracker = createRevisionTracker(sm);
    tracker.markStructure();
    assertEqual(tracker.isStructureCurrent(), true);
    sm.bump();
    assertEqual(tracker.isStructureCurrent(), false);
  });

  test('forgetInstance macht eine gelesene Instanz wieder unbekannt', () => {
    const tracker = createRevisionTracker(fakeState());
    tracker.markInstance('ws-1');
    tracker.forgetInstance('ws-1');
    assertEqual(tracker.isInstanceCurrent('ws-1'), false);
  });

  test('der Vertrag kennt stale_revision', () => {
    assertEqual(ERRORS.STALE_REVISION, 'stale_revision');
  });
});

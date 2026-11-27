/**
 * Deployment-Flowchart: Import aus der `read()`-Form (domain/import.js) —
 * die zwei Mapper-Fälle der Altsuite (Process Map, SIPOC); die Schritte
 * landen über `appendSteps` in „Nicht zugeordnet“.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { IMPORT_SOURCES, seedsFromRead } from '../../../js/modules/deployment-flowchart/domain/import.js';
import { State } from '../../../js/modules/deployment-flowchart/domain/model.js';

suite('Deployment-Flowchart Import aus read()', () => {
  test('Quellen', () => assertDeepEqual([...IMPORT_SOURCES], ['process-map', 'sipoc']));

  test('PM → Deployment: Titel und Beschreibung, Fremdfelder entfallen; alle in unassigned', () => {
    const seeds = seedsFromRead('process-map', { steps: [
      { id: 's1', title: 'A', valueType: 'va' },
      { id: 's2', title: 'B', description: 'zweiter Schritt' },
    ] });
    assertDeepEqual(seeds, [{ title: 'A', description: '' }, { title: 'B', description: 'zweiter Schritt' }]);
    const m = new State();
    assertEqual(m.appendSteps({ steps: seeds }), 2);
    assertEqual(m.steps.every((s) => s.laneId === 'unassigned'), true);
    assertEqual(m.lanes.some((l) => l.id === 'unassigned'), true);
    assertEqual(m.steps[1].description, 'zweiter Schritt');
    assertEqual('valueType' in m.steps[0], false);
  });

  test('SIPOC → Deployment: Prozessnamen getrimmt, leere entfallen', () => {
    const seeds = seedsFromRead('sipoc', { columns: { process: ['P1', ' P2 ', '', 3] } });
    assertDeepEqual(seeds, [{ title: 'P1', description: '' }, { title: 'P2', description: '' }]);
    const m = new State();
    m.appendSteps({ steps: seeds });
    assertEqual(m.steps.map((s) => s.title).join(','), 'P1,P2');
  });

  test('leere oder fehlende Quellen und unbekanntes Modul ergeben []', () => {
    assertDeepEqual(seedsFromRead('sipoc', {}), []);
    assertDeepEqual(seedsFromRead('process-map', null), []);
    assertDeepEqual(seedsFromRead('fmea', { steps: [{ title: 'x' }] }), []);
  });
});

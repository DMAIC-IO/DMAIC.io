/**
 * Activity-Flowchart: Import-Mapper aus der `read()`-Form (domain/import.js) —
 * die Fälle der alten Mapper `sipocToActivity`/`pmToActivity`.
 */
import { suite, test, assertDeepEqual } from '../../test-utils.js';
import { IMPORT_SOURCES, seedsFromRead } from '../../../js/modules/activity-flowchart/domain/import.js';
import { State } from '../../../js/modules/activity-flowchart/domain/model.js';

suite('Activity-Flowchart Import', () => {
  test('Quellen: process-map und sipoc', () => {
    assertDeepEqual([...IMPORT_SOURCES], ['process-map', 'sipoc']);
  });

  test('SIPOC: nicht leere Prozesseinträge werden Aktivitäten (getrimmt)', () => {
    assertDeepEqual(seedsFromRead('sipoc', { columns: { process: [' Anfrage ', '', 7, 'Angebot'] } }),
      [{ title: 'Anfrage', description: '' }, { title: 'Angebot', description: '' }]);
    assertDeepEqual(seedsFromRead('sipoc', {}), []);
  });

  test('Process Map: Titel und Beschreibung, PM-eigene Felder entfallen', () => {
    assertDeepEqual(seedsFromRead('process-map', { steps: [
      { title: 'A', description: 'a', valueType: 'nva', inputs: ['x'] }, { title: 3 }, null,
    ] }), [{ title: 'A', description: 'a' }, { title: '', description: '' }, { title: '', description: '' }]);
    assertDeepEqual(seedsFromRead('process-map', { steps: 'kaputt' }), []);
    assertDeepEqual(seedsFromRead('fmea', { steps: [{ title: 'A' }] }), []);
  });

  test('die Startschritte passen zu appendSteps: Aktivitäten im Hauptpfad', () => {
    const m = new State();
    m.appendSteps({ steps: seedsFromRead('sipoc', { columns: { process: ['A', 'B'] } }) });
    assertDeepEqual(m.steps.map((s) => [s.title, s.kind, s.branchId]), [['A', 'activity', 'main'], ['B', 'activity', 'main']]);
  });
});

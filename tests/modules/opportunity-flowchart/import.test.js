import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { IMPORT_SOURCES, seedsFromRead } from '../../../js/modules/opportunity-flowchart/domain/import.js';

suite('Opportunity-Flowchart Import aus read()', () => {
  test('Quellen', () => assertDeepEqual([...IMPORT_SOURCES], ['process-map', 'sipoc']));

  test('process-map: va, nva, bnva → nva, null → va; Beschreibung bleibt, Fremdfelder entfallen', () => {
    const out = seedsFromRead('process-map', { steps: [
      { id: 's1', title: 'A', description: 'a', valueType: 'va', inputs: ['x'] },
      { id: 's2', title: 'B', valueType: 'nva' },
      { id: 's3', title: 'C', valueType: 'bnva' },
      { id: 's4', title: 'D', valueType: null },
    ] });
    assertEqual(out.map((s) => s.side).join(','), 'va,nva,nva,va');
    assertDeepEqual(out[0], { title: 'A', description: 'a', side: 'va' });
    assertEqual(out[1].description, '');
  });

  test('sipoc: columns.process → VA-Schritte', () => {
    const out = seedsFromRead('sipoc', { columns: { process: ['Anfrage', ' Prüfung ', ''] } });
    assertDeepEqual(out, [
      { title: 'Anfrage', description: '', side: 'va' },
      { title: 'Prüfung', description: '', side: 'va' },
    ]);
  });

  test('leere oder fehlende Quellen und unbekanntes Modul ergeben []', () => {
    assertDeepEqual(seedsFromRead('sipoc', { columns: { process: [] } }), []);
    assertDeepEqual(seedsFromRead('sipoc', {}), []);
    assertDeepEqual(seedsFromRead('process-map', null), []);
    assertDeepEqual(seedsFromRead('fmea', { steps: [{ title: 'x' }] }), []);
  });
});

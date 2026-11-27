/**
 * Process Map Übernahme aus SIPOC: Zahl und Vorschau der Prozessschritte,
 * Startschritte aus der Spalte P (`read()`-Form des SIPOC).
 */
import { suite, test, assertDeepEqual } from '../../test-utils.js';
import { sipocSummary, seedsFromSipoc, PREVIEW_MAX } from '../../../js/modules/process-map/domain/import.js';

suite('Process Map Import — SIPOC', () => {
  test('sipocSummary zählt getrimmte, nicht leere Einträge; die Vorschau hat höchstens vier', () => {
    const read = { columns: { process: [' A ', '', 'B', '  ', 'C', 'D', 'E', 7] } };
    assertDeepEqual(sipocSummary(read), { processCount: 5, processPreview: ['A', 'B', 'C', 'D'] });
    assertDeepEqual(PREVIEW_MAX, 4);
  });

  test('ohne Spalte oder ohne Lesestand: null Schritte', () => {
    for (const read of [undefined, null, {}, { columns: {} }, { columns: { process: 'x' } }]) {
      assertDeepEqual(sipocSummary(read), { processCount: 0, processPreview: [] });
      assertDeepEqual(seedsFromSipoc(read), []);
    }
  });

  test('seedsFromSipoc: je Eintrag ein Startschritt mit Titel', () => {
    assertDeepEqual(seedsFromSipoc({ columns: { process: ['Bestellen', ' ', ' Backen '] } }),
      [{ title: 'Bestellen' }, { title: 'Backen' }]);
  });
});

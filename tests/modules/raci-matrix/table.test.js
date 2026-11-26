/**
 * Tests for modules/raci-matrix/io/table.js — die Zeilen für `exports.table()`:
 * gleich den Zeilen der Byte-Fixture der Altform (ohne BOM) am Altprojekt,
 * `null` ohne Aktivitäten oder ohne Beteiligte.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { toRows } from '../../../js/modules/raci-matrix/io/table.js';
import { State } from '../../../js/modules/raci-matrix/domain/model.js';
import { toCsvText } from '../../../js/core/exporter.js';
import { setModelName } from '../../../js/core/model.js';

setModelName(State, 'raci-matrix');

/** Zustand der Instanz aus der Fixture „Altprojekt“ (`legacy-project.json`), ohne `_schema`. */
const LEGACY_STATE = {
  activities: [
    'Anforderungen aufnehmen',
    'Lieferantenbewertung für alle Zulieferer der Baugruppe Getriebegehäuse durchführen',
    'Prüfplan für Öl & Späne <Größe "M3"> freigeben',
    'Abschlussbericht schreiben',
  ],
  stakeholders: ['Projektleitung', 'Qualitätssicherung Werk Süd (Leitung Messtechnik)', 'Einkauf'],
  assignments: {
    '2:2': 'A', '0:1': 'A', '1:2': 'I', '0:0': 'R', '2:0': 'R', '1:1': 'A', '0:2': 'C', '2:1': 'A',
  },
};

/** Die Zeilen der Byte-Fixture `legacy-export.csv` (ohne BOM, Trenner `;`, ohne Schluss-Zeilenende). */
const LEGACY_CSV_LINES = [
  '"Aktivität";"Projektleitung";"Qualitätssicherung Werk Süd (Leitung Messtechnik)";"Einkauf"',
  '"Anforderungen aufnehmen";"R";"A";"C"',
  '"Lieferantenbewertung für alle Zulieferer der Baugruppe Getriebegehäuse durchführen";"";"A";"I"',
  '"Prüfplan für Öl & Späne <Größe ""M3""> freigeben";"R";"A";"A"',
  '"Abschlussbericht schreiben";"";"";""',
];

/** Stub-Übersetzer mit dem deutschen Kopftext der Altform. @param {string} key */
const T = (key) => (key === 'activity' ? 'Aktivität' : `T:${key}`);
const plain = (v) => JSON.parse(JSON.stringify(v));

suite('raci-matrix table — toRows', () => {
  test('Altprojekt: Kopf und Zeilen wie die Altform', () => {
    const rows = toRows(State.fromJSON(plain(LEGACY_STATE)), T);
    assertDeepEqual(rows, [
      ['Aktivität', 'Projektleitung', 'Qualitätssicherung Werk Süd (Leitung Messtechnik)', 'Einkauf'],
      ['Anforderungen aufnehmen', 'R', 'A', 'C'],
      ['Lieferantenbewertung für alle Zulieferer der Baugruppe Getriebegehäuse durchführen', '', 'A', 'I'],
      ['Prüfplan für Öl & Späne <Größe "M3"> freigeben', 'R', 'A', 'A'],
      ['Abschlussbericht schreiben', '', '', ''],
    ]);
  });
  test('als CSV des Kerns: die Zeilen der Byte-Fixture, dazu sep=; und das Schluss-Zeilenende', () => {
    const csv = toCsvText(toRows(State.fromJSON(plain(LEGACY_STATE)), T), 'de');
    assertEqual(csv, `sep=;\n${LEGACY_CSV_LINES.join('\n')}\n`);
  });
  test('ohne Aktivitäten: null', () => {
    const m = new State();
    m.addStakeholder({ text: 'P' });
    assertEqual(toRows(m, T), null);
  });
  test('ohne Beteiligte: null', () => {
    const m = new State();
    m.addActivity({ text: 'A' });
    assertEqual(toRows(m, T), null);
  });
  test('leere Matrix: null', () => {
    assertEqual(toRows(new State(), T), null);
  });
  test('Reihenfolge folgt den Listen, nicht den Schlüsseln', () => {
    const m = State.fromJSON(plain(LEGACY_STATE));
    m.moveActivity({ activityId: 'a4', to: 0 });
    const rows = /** @type {string[][]} */ (toRows(m, T));
    assertDeepEqual(rows.map((r) => r[0]).slice(0, 2), ['Aktivität', 'Abschlussbericht schreiben']);
    assertDeepEqual(rows[2], ['Anforderungen aufnehmen', 'R', 'A', 'C']);
  });
});

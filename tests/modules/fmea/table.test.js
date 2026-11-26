/**
 * FMEA Export (io/table.js): die Zeilen gegen den CSV-Download der Altform
 * am Altprojekt. Abweichungen nur aus der Umstellung: Zahlen statt
 * Zahlentext (A7) und die vier Zellen des Risikos mit S '15', das jetzt
 * unbewertet ist (A9: S, RPN, Ziel-S, Ziel-RPN); Ziel-S dort leer wie in
 * der Tabelle (T-Fehler aus dem Review, die Altform schrieb 1).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { toRows } from '../../../js/modules/fmea/io/table.js';
import { State } from '../../../js/modules/fmea/domain/model.js';
import { toCsvText } from '../../../js/core/exporter.js';
import { LEGACY_STATE, LEGACY_CSV } from './legacy.js';

const UI = await (await fetch(new URL('../../../js/modules/fmea/resources/i18n/ui.de.json', import.meta.url))).json();
/** @param {string} k */
const T = (k) => UI[k];

/** Eine Zeile der Altdatei als Zellen. @param {string} line */
const cells = (line) => line.slice(1, -1).split('";"').map((c) => c.replace(/""/g, '"'));

suite('fmea Export: Zeilen', () => {
  test('Kopf und Zeilen gleich der Altdatei bis auf A9', () => {
    const rows = toRows(State.fromJSON(LEGACY_STATE), T);
    const legacy = LEGACY_CSV.slice(1).map(cells);
    assertEqual(rows.length, legacy.length);
    /** @type {string[]} */
    const diffs = [];
    rows.forEach((row, i) => row.forEach((c, j) => { if (String(c) !== legacy[i][j]) diffs.push(`${i}:${j}:${c}/${legacy[i][j]}`); }));
    assertDeepEqual(diffs, ['3:9:/15', '3:12:/90', '3:21:/15', '3:24:/45']);
  });
  test('Zahlen als Zahl, leere Zellen als leerer Text, Ja/Nein aus den Texten', () => {
    const rows = toRows(State.fromJSON(LEGACY_STATE), T);
    assertEqual(rows[1][0], 1);
    assertEqual(rows[1][12], 216);
    assertEqual(rows[1][17], 'Ja');
    assertEqual(rows[2][17], 'Nein');
    assertEqual(rows[2][0], '');
    assertEqual(rows[2][19], 1);
    assertEqual(toRows(State.fromJSON(LEGACY_STATE), (k) => ({ csvYes: 'Yes', csvNo: 'No' })[k] ?? k)[1][17], 'Yes');
  });
  test('ohne Risiken nur der Kopf', () => {
    assertDeepEqual(toRows(new State(), T), [cells(LEGACY_CSV[1])]);
  });
  test('Kern-CSV: sep=;, Zeilen in Anführungszeichen, Zahlen ohne Gruppierung', () => {
    const csv = toCsvText(toRows(State.fromJSON(LEGACY_STATE), T), 'de');
    const lines = csv.split('\n');
    assertEqual(lines[0], 'sep=;');
    assertEqual(lines[1], LEGACY_CSV[1]);
  });
});

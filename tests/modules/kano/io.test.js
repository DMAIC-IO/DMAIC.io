/**
 * Kano: Export als Tabelle (io/table.js) gegen die Byte-Fixture der Altform
 * (Task 0 der Umstellung, Beispiel Lieferservice,
 * de). Die Zeilen der Fixture stehen hier eingebettet; Zahlen statt Texte,
 * gerundet wie die Altform, Kernformat beim Schreiben (gebilligt).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { toRows } from '../../../js/modules/kano/io/table.js';
import { State } from '../../../js/modules/kano/domain/model.js';
import { setModelName } from '../../../js/core/model.js';

setModelName(State, 'kano');

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

/** Die Zeilen der Byte-Fixture (de), ohne BOM. */
const LEGACY_CSV = [
  'Item;M;O;A;I;R;Q;Kategorie;CS (Better);DS (Worse);Ø Wichtigkeit',
  'Nachvollziehbarer Lieferstatus;3;0;0;0;0;0;Basismerkmal;0.00;-1.00;6.7',
  'Transparente Versandkosten;1;1;0;1;0;0;Basismerkmal;0.33;-0.67;4.7',
  'Schnelle Lieferung;1;2;0;0;0;0;Leistungsmerkmal;0.67;-1.00;8.3',
  'Nachhaltige Verpackung;0;0;2;1;0;0;Begeisterungsmerkmal;0.67;0.00;5.0',
  'Persönlicher Ansprechpartner;0;0;3;0;0;0;Begeisterungsmerkmal;1.00;0.00;4.0',
  'Unkomplizierte Retoure;0;0;0;3;0;0;Indifferent;0.00;0.00;2.3',
];

/** Ein Feld der Alt-CSV als Zahl, wenn es eine ist. @param {string} s */
const cell = (s) => (/^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s);

suite('kano Export — Tabelle', () => {
  test('Kopf, Reihenfolge, Zählung und Rundung wie die Altform (Beispiel Lieferservice, de)', async () => {
    const ex = await fetchJson('../../../js/modules/kano/resources/examples/projects/kano-lieferservice.json');
    const ui = await fetchJson('../../../js/modules/kano/resources/i18n/ui.de.json');
    const m = State.fromJSON(ex.kano);
    const rows = toRows(m, (k) => ui[k]);
    assertDeepEqual(rows, LEGACY_CSV.map((line) => line.split(';').map(cell)));
  });
  test('ohne Wichtigkeit ohne letzte Spalte; fehlende Kennzahlen leer, ohne Kategorie —', () => {
    const m = State.fromJSON({
      options: { importance: false },
      items: [{ id: 'i1', label: 'A' }],
      respondents: [{ id: 'r1', name: 'R' }],
      answers: {},
    });
    const rows = toRows(m, (k) => k);
    assertEqual(rows[0].length, 10);
    assertDeepEqual(rows[1], ['A', 0, 0, 0, 0, 0, 0, '—', null, null]);
  });
  test('ohne Merkmale keine Datei', () => {
    assertEqual(toRows(new State(), (k) => k), null);
  });
});

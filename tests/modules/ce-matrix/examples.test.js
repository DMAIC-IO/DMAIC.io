/**
 * C&E-Matrix: Beispiel.
 *
 * Das Beispiel `ce-matrix-pizza-lieferzeit` liegt in der Modulablage, bleibt
 * in der Form ohne `_schema`, lädt streng und ohne Reparatur, und sein
 * `read()` gleicht dem der Altform nach Umrechnung der Positionen auf die
 * festen ids (`i1`…, `o1`…); das Gewicht steht in der Spalte.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';
import { State } from '../../../js/modules/ce-matrix/domain/model.js';

setModelName(State, 'ce-matrix');

const BASE = '../../../js/modules/ce-matrix/resources/examples/';
const FILE = 'projects/ce-matrix-pizza-lieferzeit.json';

/** Bewertungen je Zeile (Spalten o1…o4), wie in der Beispieldatei. */
const SCORES = [[9, 4, 7, 7], [8, 5, 2, 6], [7, 8, 1, 7], [6, 2, 8, 5], [8, 6, 3, 6], [2, 9, 1, 8], [5, 9, 0, 7]];

/** `read()` der Altform für das Beispiel, Positionen auf die festen ids umgerechnet. */
const LEGACY_READ = {
  inputs: [
    { id: 'i1', name: 'Routenplanung' },
    { id: 'i2', name: 'Anzahl Bestellungen pro Stunde' },
    { id: 'i3', name: 'Backofen-Auslastung' },
    { id: 'i4', name: 'Erfahrung des Fahrers' },
    { id: 'i5', name: 'Wetter / Verkehr' },
    { id: 'i6', name: 'Qualität der Thermo-Verpackung' },
    { id: 'i7', name: 'Zeit zwischen Backen und Abfahrt' },
  ],
  outputs: [
    { id: 'o1', name: 'Lieferzeit', weight: 10 },
    { id: 'o2', name: 'Pizza-Temperatur', weight: 9 },
    { id: 'o3', name: 'Adress-Trefferquote', weight: 7 },
    { id: 'o4', name: 'Reklamationsquote', weight: 8 },
  ],
  scores: Object.fromEntries(SCORES.flatMap((row, r) => row.map((v, c) => [`i${r + 1}:o${c + 1}`, v]))),
  scale: '0-10',
  allowedScores: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  rowSums: [231, 187, 205, 174, 203, 172, 187],
};

/** @param {string} relPath */
async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

const plain = (v) => JSON.parse(JSON.stringify(v));

/** Lesefläche wie im eingehängten Modul. @param {object} m */
const read = (m) => readSchemaModel(schemaAgentEntry(State), m, undefined, evaluateDerived(m, /** @type {any} */ (undefined)));

suite('ce-matrix: Beispiel', () => {
  test('das Beispiel steht in der Modulablage', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), ['ce-matrix-pizza-lieferzeit']);
    const [e] = own.examples;
    assertEqual(e.type, 'project');
    assertEqual(e.format, 'json');
    assertEqual(e.file, FILE);
    assertEqual(e.modules, undefined);
    assertTrue(!!e.title.de && !!e.title.en, 'Titel fehlt');
    assertTrue(!!e.description.de && !!e.description.en, 'Beschreibung fehlt');
  });

  test('pizza-lieferzeit: ohne _schema, lädt streng ohne Reparatur', async () => {
    const raw = await fetchJson(`${BASE}${FILE}`);
    assertEqual(raw._schema, undefined);
    assertDeepEqual(Object.keys(raw), ['inputs', 'outputs', 'weights', 'scores']);
    State.fromJSON(plain(raw));
    /** @type {string[]} */
    const repairs = [];
    const m = State.fromJSON(plain(raw), { repair: true, onRepair: (f) => repairs.push(f) });
    assertDeepEqual(repairs, []);
    assertTrue(m.hasContent(), 'hasContent');
  });

  test('read() gleicht dem der Altform (feste ids, Gewicht in der Spalte)', async () => {
    const m = State.fromJSON(plain(await fetchJson(`${BASE}${FILE}`)));
    assertEqual(JSON.stringify(plain(read(m))), JSON.stringify(LEGACY_READ));
    assertEqual(Object.keys(LEGACY_READ.scores).length, 28);
  });
});

/**
 * RACI-Matrix: Beispiel.
 *
 * Das Beispiel `raci-pizza-lieferprozess` liegt in der Modulablage, bleibt in
 * der Form ohne `_schema`, lädt streng und ohne Reparatur, und sein `read()`
 * gleicht dem der Altform nach Umrechnung der Positionen auf die festen ids
 * (`a1`…, `s1`…); dazu die abgeleiteten Warnungen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';
import { State } from '../../../js/modules/raci-matrix/domain/model.js';

setModelName(State, 'raci-matrix');

const BASE = '../../../js/modules/raci-matrix/resources/examples/';
const FILE = 'projects/raci-pizza-lieferprozess.json';

/** `read()` der Altform für das Beispiel, Positionen auf die festen ids umgerechnet. */
const LEGACY_READ = {
  activities: [
    { id: 'a1', name: 'Bestellung annehmen' },
    { id: 'a2', name: 'An Küche weiterleiten' },
    { id: 'a3', name: 'Pizza belegen + backen' },
    { id: 'a4', name: 'Verpacken' },
    { id: 'a5', name: 'Auslieferung' },
    { id: 'a6', name: 'Kundenservice / Reklamation' },
    { id: 'a7', name: 'Schichtplanung' },
    { id: 'a8', name: 'Lieferzeiten-Monitoring' },
  ],
  stakeholders: [
    { id: 's1', name: 'Geschäftsführer' },
    { id: 's2', name: 'Filialleiter' },
    { id: 's3', name: 'Bestellannahme' },
    { id: 's4', name: 'Pizzabäcker' },
    { id: 's5', name: 'Fahrer' },
    { id: 's6', name: 'Black Belt' },
  ],
  assignments: {
    'a1:s3': 'R', 'a1:s2': 'A', 'a1:s6': 'I',
    'a2:s3': 'R', 'a2:s4': 'I',
    'a3:s4': 'R', 'a3:s2': 'A',
    'a4:s4': 'R', 'a4:s2': 'A',
    'a5:s5': 'R', 'a5:s2': 'A', 'a5:s6': 'C',
    'a6:s2': 'R', 'a6:s3': 'C', 'a6:s1': 'I',
    'a7:s2': 'R', 'a7:s1': 'A',
    'a8:s6': 'R', 'a8:s2': 'C', 'a8:s1': 'A',
  },
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

suite('raci-matrix: Beispiel', () => {
  test('das Beispiel steht in der Modulablage', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), ['raci-pizza-lieferprozess']);
    const [e] = own.examples;
    assertEqual(e.type, 'project');
    assertEqual(e.format, 'json');
    assertEqual(e.file, FILE);
    assertEqual(e.modules, undefined);
    assertTrue(!!e.title.de && !!e.title.en, 'Titel fehlt');
    assertTrue(!!e.description.de && !!e.description.en, 'Beschreibung fehlt');
  });

  test('pizza-lieferprozess: ohne _schema, lädt streng ohne Reparatur', async () => {
    const raw = await fetchJson(`${BASE}${FILE}`);
    assertEqual(raw._schema, undefined);
    assertDeepEqual(Object.keys(raw), ['activities', 'stakeholders', 'assignments']);
    State.fromJSON(plain(raw));
    /** @type {string[]} */
    const repairs = [];
    const m = State.fromJSON(plain(raw), { repair: true, onRepair: (f) => repairs.push(f) });
    assertDeepEqual(repairs, []);
    assertTrue(m.hasContent(), 'hasContent');
  });

  test('read() gleicht dem der Altform (feste ids), dazu warnings', async () => {
    const m = State.fromJSON(plain(await fetchJson(`${BASE}${FILE}`)));
    const { warnings, ...rest } = plain(read(m));
    assertEqual(JSON.stringify(rest), JSON.stringify(LEGACY_READ));
    assertEqual(Object.keys(LEGACY_READ.assignments).length, 20);
    assertDeepEqual(warnings, [{ activityId: 'a2', issues: ['noA'] }, { activityId: 'a6', issues: ['noA'] }]);
  });
});

/**
 * Paarvergleich: Beispiele.
 *
 * Beide Beispiele liegen in der Modulablage, bleiben in der Form ohne
 * `_schema`, laden streng und ohne Reparatur, und ihr `read()` gleicht dem
 * der Altform wörtlich.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';
import { State } from '../../../js/modules/pairwise-comparison/domain/model.js';

setModelName(State, 'pairwise-comparison');

const BASE = '../../../js/modules/pairwise-comparison/resources/examples/';
const OPEN = 'projects/pairwise-projektauswahl.json';
const DONE = 'projects/pairwise-projektauswahl-abgeschlossen.json';

const CRITERIA = ['Lieferzeit', 'Pizzaqualität', 'Preis', 'Mitarbeiterzufriedenheit', 'Reklamationsquote'];

/** `read()` der Altform für das offene Beispiel. */
const LEGACY_READ_OPEN = { criteria: CRITERIA, matrix: [], pairs: [], currentPair: 0, result: null };

/** `read()` der Altform für das abgeschlossene Beispiel. */
const LEGACY_READ_DONE = {
  criteria: CRITERIA,
  matrix: [[0, 0, 1, 1, 1], [1, 0, 1, 1, 1], [0, 0, 0, 1, 0.5], [0, 0, 0, 0, 0], [0, 0, 0.5, 1, 0]],
  pairs: [[0, 1], [2, 3], [3, 4], [0, 4], [1, 4], [1, 3], [1, 2], [2, 4], [0, 2], [0, 3]],
  currentPair: 10,
  result: {
    scores: [3, 4, 1.5, 0, 1.5],
    maxScore: 4,
    ranking: [
      { name: 'Pizzaqualität', score: 4, idx: 1 },
      { name: 'Lieferzeit', score: 3, idx: 0 },
      { name: 'Preis', score: 1.5, idx: 2 },
      { name: 'Reklamationsquote', score: 1.5, idx: 4 },
      { name: 'Mitarbeiterzufriedenheit', score: 0, idx: 3 },
    ],
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

/** Lädt streng und mit Reparatur; liefert das Model und die reparierten Felder. @param {object} raw */
function load(raw) {
  State.fromJSON(plain(raw));
  /** @type {string[]} */
  const repairs = [];
  const m = State.fromJSON(plain(raw), { repair: true, onRepair: (f) => repairs.push(f) });
  return { m, repairs };
}

suite('pairwise-comparison: Beispiele', () => {
  test('beide Beispiele stehen in der Modulablage', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), ['pairwise-projektauswahl', 'pairwise-projektauswahl-abgeschlossen']);
    assertDeepEqual(own.examples.map((e) => e.file), [OPEN, DONE]);
    for (const e of own.examples) {
      assertEqual(e.type, 'project');
      assertEqual(e.format, 'json');
      assertEqual(e.modules, undefined);
      assertTrue(!!e.title.de && !!e.title.en, `Titel fehlt: ${e.id}`);
      assertTrue(!!e.description.de && !!e.description.en, `Beschreibung fehlt: ${e.id}`);
    }
  });

  test('pairwise-projektauswahl: ohne _schema, streng ohne Reparatur, read() wie die Altform', async () => {
    const raw = await fetchJson(`${BASE}${OPEN}`);
    assertEqual(raw._schema, undefined);
    const { m, repairs } = load(raw);
    assertDeepEqual(repairs, []);
    assertTrue(m.hasContent(), 'hasContent');
    assertEqual(m.viewPhase, 'input');
    assertEqual(JSON.stringify(plain(read(m))), JSON.stringify(LEGACY_READ_OPEN));
  });

  test('pairwise-projektauswahl-abgeschlossen: ohne _schema, streng ohne Reparatur, read() wie die Altform', async () => {
    const raw = await fetchJson(`${BASE}${DONE}`);
    assertEqual(raw._schema, undefined);
    const { m, repairs } = load(raw);
    assertDeepEqual(repairs, []);
    assertEqual(m.viewPhase, 'results');
    assertEqual(JSON.stringify(plain(read(m))), JSON.stringify(LEGACY_READ_DONE));
  });
});

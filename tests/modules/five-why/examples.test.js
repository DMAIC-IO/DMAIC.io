/**
 * 5-Why: Beispiele.
 *
 * Die Beispiele `five-why-lieferzeit` und `five-why-hubschrauber-flyer` liegen
 * in der Modulablage, bleiben in der Form ohne `_schema`, laden streng und
 * ohne Reparatur, und ihr `read()` gleicht dem der Altform (Baum ohne
 * `question`/`collapsed`, Ebene 5 ohne `children`); dazu die Ableitung
 * `stats`.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';
import { State } from '../../../js/modules/five-why/domain/model.js';

setModelName(State, 'five-why');

const BASE = '../../../js/modules/five-why/resources/examples/';

/**
 * Eine Kette mit den ids 1…5, je Ebene eine Antwort (Form der Altform-`read()`).
 * @param {string[]} answers
 */
function chain(answers) {
  /** @type {any} */
  let child = null;
  for (let level = answers.length; level >= 1; level--) {
    const node = { id: level, level, parentId: level === 1 ? null : level - 1, answer: answers[level - 1] };
    child = level === 5 ? node : { ...node, children: child ? [child] : [] };
  }
  return [child];
}

/** `read({ fields: ['nodes'] })` der Altform je Beispiel. */
const CASES = [
  {
    id: 'five-why-lieferzeit',
    file: 'projects/five-why-lieferzeit.json',
    problem: 'Pizza-Lieferzeit übersteigt 30 min',
    answers: [
      'Pizza kommt zu spät beim Kunden an',
      'Fahrt vom Ofen zum Kunden dauert länger als geplant',
      'Fahrer wählen suboptimale Routen oder geraten in Stau',
      'Kein integriertes Routenplanungs-Tool im Bestellsystem',
      'Bestellsystem wurde ursprünglich nur für Kassenbetrieb angeschafft; Logistikfunktion fehlt',
    ],
  },
  {
    id: 'five-why-hubschrauber-flyer',
    file: 'projects/five-why-hubschrauber-flyer.json',
    problem: 'Zeiten streuen zwischen 2,20 und 2,68 s bei identischer Konfiguration',
    answers: [
      'Wiederholte Läufe bei gleicher Rotorlänge und Klammernzahl liefern deutlich unterschiedliche Flugzeiten',
      'Der Hubschrauber verhält sich bei jedem Wurf leicht anders — Trudelbeginn und Sinkrate unterscheiden sich sichtbar',
      'Die Ausgangsbedingungen beim Loslassen (Höhe, Anfangsdrehimpuls, Ausrichtung) sind von Wurf zu Wurf nicht exakt reproduzierbar',
      'Es gibt keine feste Vorgabe, wie der Hubschrauber gehalten und aus welcher Position genau losgelassen wird',
      'Wurftechnik nicht standardisiert',
    ],
  },
];

/** @param {string} relPath */
async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

const plain = (v) => JSON.parse(JSON.stringify(v));

/**
 * Lesefläche wie im eingehängten Modul.
 * @param {object} m
 * @param {object} [options]
 */
const read = (m, options) => readSchemaModel(schemaAgentEntry(State), m, options, evaluateDerived(m, /** @type {any} */ (undefined)));

suite('five-why: Beispiele', () => {
  test('die Beispiele stehen in der Modulablage', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), CASES.map((c) => c.id));
    for (const [i, e] of own.examples.entries()) {
      assertEqual(e.type, 'project');
      assertEqual(e.format, 'json');
      assertEqual(e.file, CASES[i].file);
      assertEqual(e.modules, undefined);
      assertTrue(!!e.title.de && !!e.title.en, 'Titel fehlt');
      assertTrue(!!e.description.de && !!e.description.en, 'Beschreibung fehlt');
    }
  });

  for (const c of CASES) {
    test(`${c.id}: ohne _schema, lädt streng ohne Reparatur`, async () => {
      const raw = await fetchJson(`${BASE}${c.file}`);
      assertEqual(raw._schema, undefined);
      State.fromJSON(plain(raw));
      /** @type {string[]} */
      const repairs = [];
      const m = State.fromJSON(plain(raw), { repair: true, onRepair: (f) => repairs.push(f) });
      assertDeepEqual(repairs, []);
      assertTrue(m.hasContent(), 'hasContent');
    });

    test(`${c.id}: read() gleicht dem der Altform, dazu stats`, async () => {
      const m = State.fromJSON(plain(await fetchJson(`${BASE}${c.file}`)));
      assertEqual(JSON.stringify(plain(read(m))), JSON.stringify({
        problem: c.problem,
        nodes: { $bulk: true, kind: 'tree', nodeCount: 5, depth: 5 },
        stats: { totalNodes: 5, maxDepth: 5, branches: 0, answered: 5 },
      }));
      const { stats, ...full } = plain(read(m, { fields: ['nodes'] }));
      assertEqual(JSON.stringify(full), JSON.stringify({ problem: c.problem, nodes: chain(c.answers) }));
      assertDeepEqual(stats, { totalNodes: 5, maxDepth: 5, branches: 0, answered: 5 });
    });
  }
});

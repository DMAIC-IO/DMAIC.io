/**
 * FMEA: Beispiel.
 *
 * Das Beispiel `fmea-pizza-lieferprozess` liegt in der Modulablage, bleibt in
 * der Form ohne `_schema`, lädt streng und ohne Reparatur, und sein `read()`
 * gleicht dem der Altform: S/O/D und Senkungen als Zahlen, Maßnahmen mit den
 * festen ids `a1`…, `scales` `{}` statt `null`, dazu die drei Ableitungen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';
import { State } from '../../../js/modules/fmea/domain/model.js';

setModelName(State, 'fmea');

const BASE = '../../../js/modules/fmea/resources/examples/';
const FILE = 'projects/fmea-pizza-lieferprozess.json';

/**
 * `read({ fields: ['risks'] })` der Altform, knapp: id, S, O, D, Merkmal und
 * je Maßnahme id, Datum, erledigt, ΔS, ΔO, ΔD (Zahlentexte als Zahlen).
 */
const LEGACY_RISKS = [
  ['r1', 7, 4, 5, '', [['a1', '-90d', true, 0, 1, 0], ['a2', '+45d', false, 0, 2, 1]]],
  ['r2', 6, 6, 4, '', [['a1', '-60d', true, 0, 0, 1], ['a2', '+60d', false, 1, 3, 0]]],
  ['r3', 8, 5, 8, 'SC', [['a1', '-30d', true, 0, 1, 2], ['a2', '+80d', false, 0, 2, 3]]],
  ['r4', 5, 7, 6, '', [['a1', '-120d', true, 0, 1, 1], ['a2', '+100d', false, 0, 3, 2]]],
  ['r5', 9, 4, 6, 'CC', []],
];

/** @param {string} relPath */
async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

const plain = (v) => JSON.parse(JSON.stringify(v));

/** Lesefläche wie im eingehängten Modul. @param {object} m @param {object} [opts] */
const read = (m, opts) => readSchemaModel(schemaAgentEntry(State), m, opts, evaluateDerived(m, /** @type {any} */ (undefined)));

suite('fmea: Beispiel', () => {
  test('das Beispiel steht in der Modulablage', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), ['fmea-pizza-lieferprozess']);
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
    State.fromJSON(plain(raw));
    /** @type {string[]} */
    const repairs = [];
    const m = State.fromJSON(plain(raw), { repair: true, onRepair: (f) => repairs.push(f) });
    assertDeepEqual(repairs, []);
    assertTrue(m.hasContent(), 'hasContent');
  });

  test('read() ohne Option: Umfang der Risiken wie in der Altform, dazu die Ableitungen', async () => {
    const m = State.fromJSON(plain(await fetchJson(`${BASE}${FILE}`)));
    const r = plain(read(m));
    assertDeepEqual(Object.keys(r).sort(), ['burndown', 'fmeaType', 'method', 'riskRatings', 'risks', 'scales', 'stats']);
    assertDeepEqual(r.risks, { $bulk: true, kind: 'table', rowCount: 5, columns: [] });
    assertEqual(r.method, 'ap');
    assertEqual(r.fmeaType, 'process');
    assertDeepEqual(r.scales, {});
  });

  test('read({ fields: [risks] }) gleicht dem der Altform (Zahlen, Maßnahmen-ids)', async () => {
    const m = State.fromJSON(plain(await fetchJson(`${BASE}${FILE}`)));
    const { risks } = plain(read(m, { fields: ['risks'] }));
    assertEqual(JSON.stringify(risks.map((k) => [k.id, k.sev, k.occ, k.det, k.specialChar,
      k.actions.map((a) => [a.id, a.date, a.done, a.deltaS, a.deltaO, a.deltaD])])), JSON.stringify(LEGACY_RISKS));
    assertDeepEqual(Object.keys(risks[0]), ['id', 'step', 'failureMode', 'effect', 'cause', 'prevention', 'control',
      'specialChar', 'justification', 'sev', 'occ', 'det', 'actions']);
    assertTrue(risks.every((k) => !('collapsed' in k)), 'collapsed bleibt außerhalb von read()');
  });
});

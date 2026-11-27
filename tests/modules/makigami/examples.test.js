/**
 * Makigami: die beiden ausgelieferten Beispiele laden ohne Reparatur; Felder
 * und Kennzahlen gleichen dem `read()` bzw. `computeKPI()` der Altform
 * (legacy-read.json).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/makigami/domain/model.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';

setModelName(State, 'makigami');

const EXAMPLES = ['makigami-auftragsabwicklung', 'makigami-urlaubsantrag'];
const plain = (v) => JSON.parse(JSON.stringify(v));

/** @param {URL} url */
async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

const exampleUrl = (id) => new URL(`../../../examples/projects/${id}.json`, import.meta.url);

suite('makigami Beispiele', () => {
  for (const id of EXAMPLES) {
    test(`${id}: lädt ohne Reparatur, Felder und Kennzahlen wie die Altform`, async () => {
      const legacy = (await fetchJson(new URL('./legacy-read.json', import.meta.url)))[id];
      const fields = [];
      const m = State.fromJSON(plain(await fetchJson(exampleUrl(id))), { repair: true, onRepair: (f) => fields.push(f) });
      assertDeepEqual(fields, []);
      const { _schema, collapsed, settingsOpen, ...rest } = plain(m.toJSON());
      const { kpi, ...read } = legacy;
      const expected = { ...read, steps: read.steps.map(({ expanded: _expanded, ...s }) => s) };
      assertDeepEqual(rest, expected);
      assertDeepEqual(collapsed, read.steps.filter((s) => s.expanded === false).map((s) => s.id));
      assertEqual(settingsOpen, false);
      const d = /** @type {any} */ (evaluateDerived(m, /** @type {any} */ (undefined), ['kpi', 'invalidTimes']));
      assertDeepEqual(d.kpi, kpi);
      assertDeepEqual(d.invalidTimes, []);
    });
  }
});

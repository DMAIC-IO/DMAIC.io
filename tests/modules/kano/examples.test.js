/**
 * Kano: die ausgelieferten Beispiele laden ohne Reparatur, und die Auswertung
 * (`derived evaluation`) gleicht dem `read()` der Altform für dasselbe
 * Beispiel (`legacy-read.json`, Task 0, Sprache en).
 */
import { suite, test, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/kano/domain/model.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';

setModelName(State, 'kano');

const NO_TREE = { list: () => [], read() { throw new Error('x'); } };
const plain = (v) => JSON.parse(JSON.stringify(v));

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

suite('kano Beispiele', () => {
  for (const id of ['kano-lieferservice', 'kano-hubschrauber-flyer']) {
    test(`${id}: lädt ohne Reparatur, Auswertung wie die Altform`, async () => {
      const ex = await fetchJson(`../../../js/modules/kano/resources/examples/projects/${id}.json`);
      const old = (await fetchJson('./legacy-read.json'))[id];
      const repaired = [];
      const m = /** @type {any} */ (State.fromJSON(plain(ex.kano), { repair: true, onRepair: (f) => repaired.push(f) }));
      assertDeepEqual(repaired, []);
      assertDeepEqual(plain(m.items), old.items);
      assertDeepEqual(plain(m.respondents), old.respondents);
      assertDeepEqual(plain(m.answers), old.answers);
      assertDeepEqual(plain(m.options), old.options);
      assertDeepEqual(m.source.level, old.source.level);
      const d = plain(evaluateDerived(m, /** @type {any} */ (NO_TREE), ['evaluation'], (k) => k));
      assertDeepEqual(d.evaluation, old.evaluation);
    });
  }
});

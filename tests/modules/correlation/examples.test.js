/**
 * Korrelation: Beispiele laden ohne Reparatur; `derived` gleicht dem
 * `read()` der Altform für dasselbe Beispiel (`legacy-read.json`, Sprache en).
 */
import { suite, test, assertDeepEqual } from '../../test-utils.js';
import { rewriteColumnRefs, setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { State } from '../../../js/modules/correlation/domain/model.js';
import { storedSource } from '../../helpers/stored-source.js';
import { compareResults } from './migrations.test.js';

setModelName(State, 'correlation');

const BASE = '../../../examples/';
const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
const IDS = ['correlation-oven-hardness', 'correlation-pizza-delivery'];
const plain = (v) => JSON.parse(JSON.stringify(v));

/** @param {string} path @returns {Promise<any>} */
async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

suite('correlation: Beispiele', () => {
  for (const id of IDS) {
    test(`${id}: lädt ohne Reparatur, derived wie das read() der Altform`, async () => {
      const legacy = (await fetchJson('./legacy-read.json'))[id];
      const { sourceWorksheetFile, ...data } = await fetchJson(`${BASE}projects/${id}.json`);
      const repaired = [];
      const raw = rewriteColumnRefs(State, data, '__source__', 'ws1');
      const m = State.fromJSON(raw, { repair: true, onRepair: (f) => repaired.push(f), context: CTX });
      assertDeepEqual(repaired, [], id);
      const src = storedSource({ ws1: await fetchJson(`${BASE}${sourceWorksheetFile}`) });
      const d = plain(evaluateDerived(m, src, undefined, (k) => k));
      assertDeepEqual([d.mode, d.activeParams, d.error], [legacy.mode, legacy.activeParams, null], id);
      assertDeepEqual(plain(m.colRefs).map((r) => r.columnId), legacy.colRefs.map((r) => r.columnId), id);
      compareResults(id, d, legacy);
    });
  }
});

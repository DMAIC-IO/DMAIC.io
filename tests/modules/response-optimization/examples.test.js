/**
 * Zielgrößenoptimierung: die ausgelieferten Beispiele (resources/examples/)
 * laden ohne Reparatur; die Besitzer (Regressions-Instanzen aus
 * `exampleParts`) liefern ihr Modell, und die Ableitungen gleichen dem
 * `read()` der Altform (Task 0, `legacy-read.json`, `example:<id>`).
 */
import { suite, test, assertEqual, assertDeepEqual, assertAlmostEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/response-optimization/domain/model.js';
import { exampleParts } from '../../../js/modules/response-optimization/domain/example.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { ownersSource } from './owners.js';

setModelName(State, 'response-optimization');

const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
const T = (/** @type {string} */ k) => k;
const BASE = '../../../js/modules/response-optimization/resources/examples/';

/** @param {string} path @returns {Promise<any>} */
async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

/**
 * Zahlen bis auf Rundung gleich, sonst gleich.
 * @param {any} a @param {any} b @param {string} at
 */
function near(a, b, at) {
  if (typeof a === 'number' && typeof b === 'number') { assertAlmostEqual(a, b, 1e-9 * Math.max(1, Math.abs(b)), at); return; }
  if (Array.isArray(b)) { assertEqual(a?.length, b.length, `${at} Länge`); b.forEach((v, i) => near(a[i], v, `${at}[${i}]`)); return; }
  if (b && typeof b === 'object') {
    assertDeepEqual(Object.keys(a ?? {}).sort(), Object.keys(b).sort(), `${at} Schlüssel`);
    for (const k of Object.keys(b)) near(a[k], b[k], `${at}.${k}`);
    return;
  }
  assertEqual(a, b, at);
}

/**
 * Ein Beispiel wie `beforeLoadExample`: Besitzer und eigene Instanz in einer Phase.
 * @param {string} id
 */
async function loadExample(id) {
  const { examples } = await fetchJson(`${BASE}examples.json`);
  const entry = examples.find((/** @type {any} */ e) => e.id === id);
  const { owners, state } = exampleParts(await fetchJson(`${BASE}${entry.file}`));
  const doc = {
    phases: { improve: [{ instanceId: 'ro', moduleId: 'response-optimization' }, ...owners.map((o) => ({ instanceId: `own-${o.id}`, moduleId: 'regression' }))] },
    moduleStates: Object.fromEntries(owners.map((o) => [`own-${o.id}`, o.state])),
  };
  const m = State.fromJSON(JSON.parse(JSON.stringify(state)), { context: CTX });
  return { owners, m, d: evaluateDerived(m, ownersSource(doc), undefined, T) };
}

suite('response-optimization: Beispiele gegen das read() der Altform', () => {
  test('Katalog: genau die zwei Beispiele der Altform', async () => {
    const { examples } = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(examples.map((/** @type {any} */ e) => e.id).sort(),
      ['response-optimization-hubschrauber-flyer', 'response-optimization-pizza-lieferzeit']);
  });

  test('Pizza: ein Besitzer mit dem Modell, Vorgaben, Sperre und Optimum wie die Altform', async () => {
    const legacy = (await fetchJson('./legacy-read.json'))['example:response-optimization-pizza-lieferzeit'];
    const { owners, d } = await loadExample('response-optimization-pizza-lieferzeit');
    assertDeepEqual(owners.map((o) => [o.id, o.name, o.state.savedModelId]),
      [['model-pizza-lieferzeit', 'Lieferzeit — Modell', 'model-pizza-lieferzeit']]);
    assertEqual('createdFromInstanceId' in owners[0].state.modelRecord, false);
    assertDeepEqual(d.effectiveSpecs, legacy.specs);
    assertDeepEqual(d.selectableModels.map((/** @type {any} */ x) => ({ id: x.id, name: x.name })), legacy.selectableModels);
    assertDeepEqual([d.canOptimize, d.diagnosticReasons, d.missingModels, d.resultStale], [legacy.canOptimize, legacy.diagnosticReasons, [], false]);
    const { ciAtOpt: _c, paretoFront: _p, ...old } = legacy.result;
    near(d.result, old, 'result');
  });

  test('Hubschrauber: leer wie die Altform', async () => {
    const legacy = (await fetchJson('./legacy-read.json'))['example:response-optimization-hubschrauber-flyer'];
    const { owners, d } = await loadExample('response-optimization-hubschrauber-flyer');
    assertEqual(owners.length, 0);
    assertDeepEqual([d.effectiveSpecs, d.selectableModels, d.canOptimize, d.diagnosticReasons, d.result],
      [legacy.specs, legacy.selectableModels, legacy.canOptimize, legacy.diagnosticReasons, legacy.result]);
  });
});

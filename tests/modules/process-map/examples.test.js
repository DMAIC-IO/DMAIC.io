/**
 * Process Map Beispiele: beide laden ohne Reparatur, und der Zustand gleicht
 * dem `read()` der Altform (`legacy-read.json`, Task 0) ohne `expanded`, das
 * zum Ansichtsfeld wird.
 */
import { suite, test, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/process-map/domain/model.js';

const plain = (v) => JSON.parse(JSON.stringify(v));

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

/** Alt-`read()` in der gespeicherten Form der Zielform (siehe migrations.test.js). */
function asTarget(steps) {
  return steps.map((s) => ({
    id: s.id, title: s.title, description: s.description, valueType: s.valueType,
    inputs: s.inputs.map((io) => ({ id: io.id, name: io.name, inputType: io.inputType ?? null })),
    outputs: s.outputs.map((io) => ({ id: io.id, name: io.name })),
    substeps: s.substeps.map((x) => ({ id: x.id, title: x.title })),
    loop: s.loop && { targetStepId: s.loop.targetStepId, condition: s.loop.condition,
      steps: s.loop.steps.map((x) => ({ id: x.id, title: x.title })) },
  }));
}

suite('Process Map Beispiele', () => {
  for (const id of ['process-map-pizza-lieferung', 'process-map-hubschrauber-flyer']) {
    test(`${id}: lädt ohne Reparatur, Zustand wie das read() der Altform`, async () => {
      const ex = await fetchJson(`../../../examples/projects/${id}.json`);
      const old = (await fetchJson('./legacy-read.json'))[id];
      const repaired = [];
      const m = /** @type {any} */ (State.fromJSON(plain(ex), { onRepair: (f) => repaired.push(f) }));
      assertDeepEqual(repaired, []);
      assertDeepEqual(plain(m.steps), asTarget(old.steps));
      assertDeepEqual(plain(m.expanded), old.steps.filter((s) => s.expanded).map((s) => s.id));
    });
  }
});

/**
 * Process Map Migration '0→1.0': Altprojekt aus Task 0 (`legacy-project.json`)
 * gegen das `read()` der Altform (`legacy-read.json`), feste Ersatz-ids,
 * `inputType` an Outputs, Vorwärtsziel, unbekannte Schlüssel, Golden-Fixtures.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/process-map/domain/model.js';
import { from0 } from '../../../js/modules/process-map/domain/migrations.js';

const LEGACY_ID = '5c2e9a71-4b3d-4f80-9e16-7a0d3c8b2f41';
const plain = (v) => JSON.parse(JSON.stringify(v));

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

/**
 * Die Alt-`read()`-Form so, wie die Zielform sie speichert: ohne `expanded`
 * und unbekannte Schlüssel, `inputType` an jedem Input (fehlend → null), an
 * keinem Output, Schlüssel in Schemareihenfolge.
 * @param {any[]} steps
 */
function asTarget(steps) {
  return steps.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    valueType: s.valueType,
    inputs: s.inputs.map((io) => ({ id: io.id, name: io.name, inputType: io.inputType ?? null })),
    outputs: s.outputs.map((io) => ({ id: io.id, name: io.name })),
    substeps: s.substeps.map((x) => ({ id: x.id, title: x.title })),
    loop: s.loop && { targetStepId: s.loop.targetStepId, condition: s.loop.condition,
      steps: s.loop.steps.map((x) => ({ id: x.id, title: x.title })) },
  }));
}

suite('Process Map Migration 0→1.0', () => {
  test('Altprojekt: Werte wie das read() der Altform, feste Ersatz-ids, Vorwärtsziel null, expanded als Liste', async () => {
    const project = await fetchJson('./legacy-project.json');
    const old = (await fetchJson('./legacy-read.json')).legacyProject;
    const reports = [];
    const m = /** @type {any} */ (State.fromJSON(project.moduleStates[LEGACY_ID], { repair: true, onRepair: (f) => reports.push(f) }));
    assertDeepEqual(reports, ['steps']);
    const want = asTarget(old.steps);
    // Die Altform vergab fehlende ids per uid(); die Migration fest aus der Position.
    want[0].substeps[1].id = 'ss0m0_1';
    want[1].loop.steps[1].id = 'ls0m1_1';
    want[2].id = 's0m2';
    want[2].inputs[0].id = 'io0m2_0';
    // Vorwärtsziel (die Altform zeigte das Band offen) heilt die Reparatur.
    want[2].loop.targetStepId = null;
    assertDeepEqual(plain(m.steps), want);
    assertDeepEqual(plain(m.expanded), ['pm-s1']);
    // Zweimal migriert, dieselben ids (loadDetached migriert ungespeicherte Stände bei jedem Lesen neu).
    const again = /** @type {any} */ (State.fromJSON(project.moduleStates[LEGACY_ID], { repair: true }));
    assertDeepEqual(plain(again.steps).map((s) => s.id), plain(m.steps).map((s) => s.id));
  });

  test('from0: inputType am Output und unbekannte Schlüssel entfallen, Werte außerhalb der Liste werden null', () => {
    const out = from0({ steps: [{
      id: 'a', title: 1, valueType: 'value-add', extra: true, expanded: true,
      inputs: [{ id: 'i', name: 'n', inputType: 'x' }, { id: 'j', name: 'm', inputType: 'noise' }],
      outputs: [{ id: 'o', name: 'p', inputType: 'param' }],
    }] });
    assertDeepEqual(out, {
      steps: [{
        id: 'a', title: '', description: '', valueType: null,
        inputs: [{ id: 'i', name: 'n', inputType: null }, { id: 'j', name: 'm', inputType: 'noise' }],
        outputs: [{ id: 'o', name: 'p' }],
        substeps: [], loop: null,
      }],
      expanded: ['a'],
    });
  });

  test('from0: Nicht-Objekte entfallen; Ersatz-ids weichen vorhandenen aus', () => {
    const out = from0({ steps: [null, 'x', { title: 'A', inputs: [7, { name: 'i' }], outputs: [{ name: 'o' }] }, { id: 's0m0' }] });
    assertDeepEqual(out.steps.map((s) => s.id), ['s0m0_', 's0m0']);
    assertDeepEqual(out.steps[0].inputs.map((x) => x.id), ['io0m0_0']);
    assertDeepEqual(out.steps[0].outputs.map((x) => x.id), ['o0m0_0']);
  });

  test('from0: ein wahrer Nicht-Objekt-Loop wird wie in der Altform ein leerer Loop, ein falscher null', () => {
    const out = from0({ steps: [
      { id: 'a', loop: 'b' },
      { id: 'b', loop: false },
      { id: 'c', loop: { targetStepId: 'a', condition: 'k', steps: [{ title: 'r' }, 3] } },
      { id: 'd', loop: { targetStepId: '' } },
    ] });
    assertDeepEqual(out.steps.map((s) => s.loop), [
      { targetStepId: null, condition: '', steps: [] },
      null,
      { targetStepId: 'a', condition: 'k', steps: [{ id: 'ls0m2_0', title: 'r' }] },
      { targetStepId: null, condition: '', steps: [] },
    ]);
  });

  test('Golden-Fixtures v0.2.0/v0.3.0/v0.5.0 laden mit Reparatur zu höchstens Altwerten', async () => {
    const files = [
      ['v0.2.0_single_project.json', 'v2-pmap'],
      ['v0.3.0_single_project.json', 'inst-pmap'],
      ['v0.5.0_8d_project.json', 'inst-pmap'],
    ];
    for (const [file, id] of files) {
      const project = await fetchJson(`../../fixtures/exports/${file}`);
      const raw = project.moduleStates[id];
      const m = /** @type {any} */ (State.fromJSON(raw, { repair: true }));
      assertEqual(m.steps.length, raw.steps.length, file);
      assertDeepEqual(plain(m.steps).map((s) => s.id), raw.steps.map((s) => s.id), file);
      // `loop` als Text (Ziel-id der Frühform) wird wie in der Altform ein leerer Loop.
      raw.steps.forEach((s, i) => assertEqual(m.steps[i].loop === null, !s.loop, `${file} ${s.id}`));
      assertDeepEqual(plain(m.expanded), raw.steps.filter((s) => s.expanded === true).map((s) => s.id), file);
    }
  });

  test('fromJSON hebt den Altstand: _schema 1.0, keine Schlüssel außerhalb des Schemas', () => {
    const json = /** @type {any} */ (State.fromJSON({ steps: [{ id: 'a', expanded: true, legacyNote: 'x' }] })).toJSON();
    assertEqual(json._schema.version, '1.0');
    assertDeepEqual(Object.keys(json.steps[0]), ['id', 'title', 'description', 'valueType', 'inputs', 'outputs', 'substeps', 'loop']);
    assertDeepEqual(json.expanded, ['a']);
  });
});

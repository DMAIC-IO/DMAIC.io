/**
 * Zielgrößenoptimierung: Migration '0→1.0' (domain/migrations.js) — die Fälle
 * des alten `SpecEntry.fromJSON`, die Optimierung aus der Projektmigration und
 * die Altstände aus Task 0 (Modulfixture und Projektfixture des Pakets) gegen
 * das `read()` der Altform; dazu die Rechnung des Optimums gegen das
 * gespeicherte Altergebnis.
 */
import { suite, test, assertEqual, assertDeepEqual, assertAlmostEqual, assertTrue, assertThrows } from '../../test-utils.js';
import { from0, specFromLegacy, optimizationFromLegacy } from '../../../js/modules/response-optimization/domain/migrations.js';
import { State } from '../../../js/modules/response-optimization/domain/model.js';
import { readOwners } from '../../../js/modules/response-optimization/domain/models.js';
import { optimize } from '../../../js/modules/response-optimization/domain/optimize.js';
import { adoptProjectModels } from '../../../js/core/project-models.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { ownersSource } from './owners.js';

setModelName(State, 'response-optimization');

const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
const plain = (/** @type {any} */ v) => JSON.parse(JSON.stringify(v));
/** Übersetzer-Stub. */
const T = (/** @type {string} */ k) => k;

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

/** Das Altergebnis ohne die toten Schlüssel. @param {any} r */
const withoutDead = (r) => {
  if (!r) return r;
  const { ciAtOpt: _c, paretoFront: _p, ...rest } = r;
  return rest;
};

suite('response-optimization: Migration 0→1.0', () => {
  test('Vorgaben wie SpecEntry.fromJSON, als ganze Einträge', () => {
    assertDeepEqual(specFromLegacy(null), { selected: false, kind: 'max', lower: 0, upper: 1, target: 0.5, weight: 1 });
    assertDeepEqual(specFromLegacy({ selected: 'ja', kind: 'gross', lower: 2, upper: 6, weight: 0 }),
      { selected: false, kind: 'max', lower: 2, upper: 6, target: 4, weight: 1 });
    assertDeepEqual(specFromLegacy({ selected: true, kind: 'target', lower: '1', upper: null, target: 3, weight: 2.5 }),
      { selected: true, kind: 'target', lower: 0, upper: 1, target: 3, weight: 2.5 });
    const out = from0({ specs: { a: { kind: 'min' }, b: null }, optId: 'o' });
    assertDeepEqual(Object.keys(out).sort(), ['optimization', 'specs']);
    assertDeepEqual(out.specs.b, specFromLegacy(null));
    assertDeepEqual(from0({ specs: [1, 2] }).specs, {});
  });

  test('Optimierung: nur modelRefs und Ergebnis, ohne ciAtOpt/paretoFront', () => {
    const result = { xOpt: [1, 'a', {}], yPredictions: [2, null], dPerResponse: [1, 'x'], D: 0.5, ciAtOpt: null, paretoFront: null, factorNames: ['A', 3], modelNames: ['m'], iter: 4 };
    assertDeepEqual(optimizationFromLegacy({ modelRefs: ['m', 5], result, name: 'Optimierung' }), {
      modelRefs: ['m'],
      result: { xOpt: [1, 'a', null], yPredictions: [2, null], dPerResponse: [1, null], D: 0.5, factorNames: ['A', '3'], modelNames: ['m'], iter: 4 },
    });
    for (const bad of [null, {}, { result: { xOpt: [], D: 'x' } }, { result: { D: 1 } }]) assertEqual(optimizationFromLegacy(bad), null, JSON.stringify(bad));
    assertEqual(from0({ specs: {}, optId: 'o1' }).optimization, null);
  });

  test('der migrierte Stand lädt streng', () => {
    const m = State.fromJSON({ specs: { a: { selected: true, kind: 'min', lower: 1, upper: 2 } }, optId: 'o' }, { context: CTX });
    assertEqual(/** @type {any} */ (m.toJSON())._schema.version, '1.0');
    assertDeepEqual(plain(m.specs), { a: { selected: true, kind: 'min', lower: 1, upper: 2, target: 1.5, weight: 1 } });
  });
});

/**
 * Projekt eines Fixture-Exports durch die Projektmigration.
 * @param {string} file
 */
async function project(file) {
  const fx = await fetchJson(file);
  const p = fx.projects[0];
  const { doc } = adoptProjectModels(plain({ phases: p.phases, moduleStates: p.moduleStates, models: p.models, optimizations: p.optimizations }), { phaseFor: () => 'improve' });
  return doc;
}

suite('response-optimization: Altstände aus Task 0 gegen das read() der Altform', () => {
  const A = 'd1adb015-b51f-4d6c-8de4-d5fbb56d2aff';
  const B = 'r0a1b2c3-2222-4a2b-8c3d-0e1f2a3b4c5d';

  test('(a) lädt ohne Reparatur; Vorgaben, Modelle, Sperre und Ergebnis wie die Altform', async () => {
    const doc = await project('./legacy-project.json');
    const legacy = await fetchJson('./legacy-read.json');
    const m = State.fromJSON(plain(doc.moduleStates[A]), { context: CTX });
    const d = evaluateDerived(m, ownersSource(doc), undefined, T);
    const old = legacy[A];
    assertDeepEqual(d.effectiveSpecs, old.specs);
    assertDeepEqual(d.selectableModels.map((/** @type {any} */ x) => ({ id: x.id, name: x.name })), old.selectableModels);
    assertDeepEqual([d.canOptimize, d.diagnosticReasons, d.missingModels, d.resultStale], [old.canOptimize, old.diagnosticReasons, [], false]);
    near(d.result, withoutDead(old.result), 'result');
    assertEqual(d.selectableModels[0].instanceId, 'reg-model-pizza-lieferzeit');
  });

  test('(b) lower ≥ upper: die Reparatur verwirft die Obergrenze (Abweichung), Rest wie die Altform', async () => {
    const doc = await project('./legacy-project.json');
    const legacy = await fetchJson('./legacy-read.json');
    assertThrows(() => State.fromJSON(plain(doc.moduleStates[B]), { context: CTX }));
    const m = State.fromJSON(plain(doc.moduleStates[B]), { context: CTX, repair: true });
    const d = evaluateDerived(m, ownersSource(doc), undefined, T);
    const old = legacy[B].specs['model-pizza-lieferzeit'];
    const now = d.effectiveSpecs['model-pizza-lieferzeit'];
    assertDeepEqual([now.selected, now.kind, now.lower, now.target, now.weight], [old.selected, old.kind, old.lower, old.target, old.weight]);
    const ys = doc.moduleStates['reg-model-pizza-lieferzeit'].savedModel.dataSnapshot.y;
    assertEqual(now.upper, Math.max(...ys));
    assertDeepEqual([d.result, d.canOptimize], [null, legacy[B].canOptimize]);
  });

  test('Paketprojekt: drei Besitzer, Vorgaben und Ergebnis wie die Altform; Reihenfolge der Projektliste', async () => {
    const doc = await project('./paket-project.json');
    const legacy = await fetchJson('./paket-read.json');
    const RO = 'r0e5f6a7-0001-4b2c-8d3e-9f0a1b2c3d4e';
    const m = State.fromJSON(plain(doc.moduleStates[RO]), { context: CTX });
    const d = evaluateDerived(m, ownersSource(doc), undefined, T);
    const old = legacy[RO];
    assertDeepEqual(d.effectiveSpecs, old.specs);
    const byId = (/** @type {any[]} */ l) => [...l].map((x) => ({ id: x.id, name: x.name })).sort((a, b) => a.id.localeCompare(b.id));
    assertDeepEqual(byId(d.selectableModels), byId(old.selectableModels));
    assertDeepEqual(d.selectableModels.map((/** @type {any} */ x) => x.id), ['m-b', 'm-a', 'm-c']);
    assertDeepEqual([d.canOptimize, d.diagnosticReasons], [old.canOptimize, old.diagnosticReasons]);
    near(d.result, withoutDead(old.result), 'result');
    assertDeepEqual(plain(m.optimization.modelRefs), ['m-a', 'm-c']);
  });

  test('die Rechnung über die Momentaufnahmen ergibt das gespeicherte Altergebnis', async () => {
    for (const [file, id] of [['./legacy-project.json', A], ['./paket-project.json', 'r0e5f6a7-0001-4b2c-8d3e-9f0a1b2c3d4e']]) {
      const doc = await project(file);
      const m = State.fromJSON(plain(doc.moduleStates[id]), { context: CTX, repair: true });
      const src = ownersSource(doc);
      const d = evaluateDerived(m, src, ['effectiveSpecs'], T);
      const { records } = readOwners(src);
      const ids = plain(m.optimization.modelRefs);
      const models = ids.map((/** @type {string} */ x) => records.find((r) => r.id === x));
      assertTrue(models.every(Boolean), file);
      const out = optimize(models, d.effectiveSpecs);
      assertDeepEqual(out.modelRefs, ids);
      near(out.result, plain(m.optimization.result), `${file} result`);
    }
  });
});

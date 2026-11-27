/**
 * Tests for modules/model-data-generator/domain/migrations.js — '1.0→1.1'
 * liest jeden Stand wie das alte `State.fromJSON`; '0→1.0' reicht Stände
 * ohne `_schema` durch. Dazu das Altprojekt der E2E-Fixture (Task 0) und die
 * goldene Fixture v0.3.0.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { from0, from1_0 } from '../../../js/modules/model-data-generator/domain/migrations.js';
import { State } from '../../../js/modules/model-data-generator/domain/model.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { storedSource } from '../../helpers/stored-source.js';

setModelName(State, 'model-data-generator');

const plain = (v) => JSON.parse(JSON.stringify(v));
const FIXTURES = new URL('../../fixtures/exports/', import.meta.url);
const V10 = { _schema: { name: 'model-data-generator', version: '1.0' } };
const DEFAULT_FACTORS = [
  { name: 'Temperatur', min: 150, max: 250 }, { name: 'Druck', min: 1, max: 10 }, { name: 'Zeit', min: 5, max: 60 },
];

/** @param {URL} url */
async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${url}: HTTP ${res.status}`);
  return res.json();
}
/** @param {object} j */
function repaired(j) {
  const fields = [];
  const m = State.fromJSON(plain(j), { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}
const generated = (m) => evaluateDerived(m, storedSource({})).generated;

/** Das Altprojekt der E2E-Fixture (Task 0). */
const LEGACY = {
  a: {
    ...V10,
    factors: [
      { name: 'Temperatur', min: 150, max: 250 }, { name: 'Druck', min: 1, max: 10 },
      { name: 'Zeit', min: 5, max: 60 }, { name: 'Katalysator', min: 0.5, max: 2.5 },
    ],
    maxOrder: 3, intercept: 20, yName: 'Ausbeute', samplingMethod: 'lhs', sampleSize: 60, noiseStd: 0.5, seed: 7,
    betas: { 0: 1.5, 1: -0.8, 4: 0.25, 10: 0.05 },
  },
  b: {
    ...V10,
    factors: [{ name: 'A', min: 0, max: 10 }, { name: 'A', min: 5, max: 1 }, { name: '', min: 0, max: 1 }],
    maxOrder: 3, yName: 'Y', samplingMethod: 'random', sampleSize: 5, noiseStd: -1, seed: 3,
    betas: { 0: 2, 3: 1.5, 99: 5, x1: 1 },
  },
};

suite('model-data-generator Migration — wie das alte fromJSON', () => {
  test('0→1.0 reicht den Stand durch, nur eine Kopie', () => {
    const old = { factors: [], seed: 3 };
    const out = from0(old);
    assertDeepEqual(out, old);
    assertTrue(out !== old);
    assertDeepEqual(from0(null), {});
  });

  test('leerer Stand: Vorgaben, aber Achsenabschnitt 0 (nicht 50)', () => {
    assertDeepEqual(from1_0({}), {
      factors: DEFAULT_FACTORS, maxOrder: 3, betas: {}, intercept: 0, yName: 'Y',
      samplingMethod: 'random', sampleSize: 100, noiseStd: 2, seed: 42,
    });
  });

  test('Faktoren: Name kein Text → leer, Grenze nicht endlich → 0, fremde Schlüssel entfallen', () => {
    const out = from1_0({ factors: [{ name: 7, min: 'x', max: null, type: 'cat', levels: ['A'] }, null] });
    assertDeepEqual(out.factors, [{ name: '', min: 0, max: 0 }, { name: '', min: 0, max: 0 }]);
    assertDeepEqual(from1_0({ factors: 'A' }).factors, DEFAULT_FACTORS);
  });

  test('Zahlen und Texte: maxOrder, Name, Verfahren, Umfang, Rauschen, Seed', () => {
    const out = from1_0({ maxOrder: 2.7, yName: '', samplingMethod: 'sobol', sampleSize: 3, noiseStd: -1, seed: 7.9 });
    assertDeepEqual([out.maxOrder, out.yName, out.samplingMethod, out.sampleSize, out.noiseStd, out.seed],
      [2, 'Y', 'random', 10, 2, 7]);
    assertEqual(from1_0({ maxOrder: -2 }).maxOrder, 0);
    assertEqual(from1_0({ sampleSize: 250000 }).sampleSize, 100000);
    assertEqual(from1_0({ sampleSize: 10.2 }).sampleSize, 11);
    assertEqual(from1_0({ noiseStd: 'x', seed: 'x' }).noiseStd, 2);
    assertEqual(from1_0({ seed: Infinity }).seed, 42);
  });

  test('betas: Termindex per parseInt, nur < Termzahl, endlich und ≠ 0', () => {
    const out = from1_0({ betas: { 0: 1, '1abc': 2, 6: 3, 7: 4, x1: 5, 2: 0, 3: 'x', '-1': 6 } });
    assertDeepEqual(out.betas, { 0: 1, 1: 2, 6: 3 });
    assertDeepEqual(from1_0({ betas: [1, 2] }).betas, {});
  });
});

suite('model-data-generator Migration — Altprojekt und goldene Fixture', () => {
  test('(a) lädt ohne Reparatur, Werte wie die Altform', () => {
    const { m, fields } = repaired(LEGACY.a);
    assertDeepEqual(fields, []);
    assertDeepEqual(plain(m.betas), { 0: 1.5, 1: -0.8, 4: 0.25, 10: 0.05 });
    const g = generated(m);
    assertEqual(g.n, 60);
    assertTrue(Math.abs(g.mean - 20.455509291847058) < 1e-10);
    assertTrue(Math.abs(g.sd - 0.6687549398499159) < 1e-10);
    assertTrue(Math.abs(g.min - 18.898653820402934) < 1e-10);
    assertTrue(Math.abs(g.max - 21.909594706967802) < 1e-10);
  });

  test('(b) Handstand: Reparatur tauscht min/max, Umfang 10, σε 2, β ohne 99 und x1, β₀ 0', () => {
    const { m, fields } = repaired(LEGACY.b);
    assertDeepEqual(fields, ['factors']);
    assertDeepEqual(plain(m.factors), [{ name: 'A', min: 0, max: 10 }, { name: 'A', min: 1, max: 5 }, { name: '', min: 0, max: 1 }]);
    assertDeepEqual([m.sampleSize, m.noiseStd, m.intercept, m.seed], [10, 2, 0, 3]);
    assertDeepEqual(plain(m.betas), { 0: 2, 3: 1.5 });
    assertEqual(generated(m).n, 10);
  });

  test('v0.3.0_all_projects.json (i-mdg-1) lädt ohne Reparatur: β alle 0, maxOrder 2', async () => {
    const file = await fetchJSON(new URL('v0.3.0_all_projects.json', FIXTURES));
    const states = [];
    for (const p of file.projects) {
      for (const list of Object.values(p.phases ?? {})) {
        for (const e of list) if (e.moduleId === 'model-data-generator') states.push(p.moduleStates[e.instanceId]);
      }
    }
    assertEqual(states.length, 1);
    const { m, fields } = repaired(states[0]);
    assertDeepEqual(fields, []);
    assertDeepEqual(plain(m.factors), [{ name: 'x1', min: -1, max: 1 }, { name: 'x2', min: 0, max: 5 }, { name: 'kat', min: 0, max: 0 }]);
    assertDeepEqual(plain(m.betas), {});
    assertDeepEqual([m.maxOrder, m.intercept, m.yName, m.samplingMethod, m.sampleSize, m.noiseStd, m.seed],
      [2, 12.5, 'y', 'lhs', 60, 0.3, 7]);
    const g = generated(m);
    assertEqual(g.n, 60);
    assertTrue(Math.abs(g.mean - 12.459920911233759) < 1e-10);
    assertTrue(Math.abs(g.max - 13.05376292396741) < 1e-10);
  });
});

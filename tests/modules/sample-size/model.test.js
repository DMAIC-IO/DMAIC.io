/**
 * Stichprobenumfang: Model (domain/model.js) — Schema, Kontextvorgaben,
 * Grenzen, `activeParams`, `result`, `hasContent`.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../../test-utils.js';
import { State, ALPHA_RANGE, POWER_RANGE } from '../../../js/modules/sample-size/domain/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { setFields } from '../../../js/core/model.js';

const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
const plain = (v) => JSON.parse(JSON.stringify(v));
/** Übersetzer-Stub. */
const T = (k) => `«${k}»`;
const EMPTY = {
  varianceOne: { sigma0: null, sigmaAlt: null },
  varianceTwo: { ratio: null },
  mean: { delta: null, sigma: null },
};

suite('sample-size: Model — Schema und Vorgaben', () => {
  test('Vorgaben: Varianz, 1-Stichprobe, zweiseitig, α/Power aus dem Kontext, keine Effektangaben', () => {
    const m = new State(CTX);
    assertEqual(m.category, 'variance');
    assertEqual(m.testType, 'one');
    assertEqual(m.direction, 'two-sided');
    assertEqual(m.alpha, 0.05);
    assertEqual(m.power, 0.8);
    assertDeepEqual(plain(m.effect), EMPTY);
    assertDeepEqual(plain(m.powerCurveEdits), {});
  });

  test('Kontextvorgaben: Konfidenz 90 → α 0,1, Teststärke 90 → 0,9', () => {
    const m = new State({ ...CTX, confidenceLevel: 90, power: 90 });
    assertEqual(m.alpha, 0.1);
    assertEqual(m.power, 0.9);
  });

  test('Kontextvorgaben werden auf den Bereich geklemmt', () => {
    assertEqual(new State({ ...CTX, confidenceLevel: 40 }).alpha, 0.5);
    assertEqual(new State({ ...CTX, confidenceLevel: 99.999 }).alpha, 0.0001);
    assertEqual(new State({ ...CTX, power: 30 }).power, 0.5);
    assertEqual(new State({ ...CTX, power: 99.999 }).power, 0.9999);
  });

  test('Grenzen α und Power: Literal gleich ALPHA_RANGE/POWER_RANGE', () => {
    const f = State.schema.fields;
    assertEqual(f.alpha.min, ALPHA_RANGE.min);
    assertEqual(f.alpha.max, ALPHA_RANGE.max);
    assertEqual(f.power.min, POWER_RANGE.min);
    assertEqual(f.power.max, POWER_RANGE.max);
  });

  test('α und Power außerhalb des Bereichs werden abgelehnt', () => {
    const m = new State(CTX);
    for (const v of [0, 0.00001, 0.9]) assertThrows(() => setFields(m, { alpha: v }), /alpha/);
    for (const v of [0.3, 1, 1.5]) assertThrows(() => setFields(m, { power: v }), /power/);
    setFields(m, { alpha: 0.0001, power: 0.9999 });
    assertEqual(m.alpha, 0.0001);
    assertEqual(m.power, 0.9999);
  });

  test('Effektangaben: größer als 0 oder leer; 0 und Negatives abgelehnt', () => {
    const m = new State(CTX);
    for (const v of [0, -1]) {
      assertThrows(() => setFields(m, { effect: { ...EMPTY, mean: { delta: v, sigma: 1 } } }), /delta/);
    }
    setFields(m, { effect: { ...EMPTY, mean: { delta: 0.5, sigma: 1 } } });
    assertEqual(m.effect.mean.delta, 0.5);
    assertThrows(() => setFields(m, { effect: { mean: { delta: 1, sigma: 1 } } }), /varianceOne/);
  });
});

suite('sample-size: Model — Ableitungen', () => {
  test('activeParams je Variante', () => {
    const m = new State(CTX);
    const base = ['category', 'testType', 'direction', 'alpha', 'power'];
    assertDeepEqual(evaluateDerived(m, null, ['activeParams'], T).activeParams,
      [...base, 'effect.varianceOne.sigma0', 'effect.varianceOne.sigmaAlt']);
    setFields(m, { testType: 'two' });
    assertDeepEqual(evaluateDerived(m, null, ['activeParams'], T).activeParams, [...base, 'effect.varianceTwo.ratio']);
    setFields(m, { category: 'mean' });
    assertDeepEqual(evaluateDerived(m, null, ['activeParams'], T).activeParams,
      [...base, 'effect.mean.delta', 'effect.mean.sigma']);
  });

  test('result: Form der Altform, Name der Effektgröße übersetzt; null ohne Angaben', () => {
    const m = new State(CTX);
    assertEqual(evaluateDerived(m, null, ['result'], T).result, null);
    setFields(m, { category: 'mean', testType: 'two', effect: { ...EMPTY, mean: { delta: 0.5, sigma: 0.8 } } });
    assertDeepEqual(evaluateDerived(m, null, ['result'], T).result, {
      nRequired: 42, totalN: 84, alpha: 0.05, power: 0.8,
      effectLabel: '«cohensD»', effectValue: 0.625, algoId: 'two-sample-t-test',
    });
  });

  test('hasContent: nur Effektangaben zählen', () => {
    const m = new State(CTX);
    assertTrue(!m.hasContent());
    setFields(m, { category: 'mean', testType: 'two', direction: 'less', alpha: 0.1, power: 0.9 });
    assertTrue(!m.hasContent());
    for (const [g, k] of [['varianceOne', 'sigma0'], ['varianceOne', 'sigmaAlt'], ['varianceTwo', 'ratio'], ['mean', 'delta'], ['mean', 'sigma']]) {
      const n = new State(CTX);
      const effect = plain(EMPTY);
      effect[g][k] = 1;
      setFields(n, { effect });
      assertTrue(n.hasContent(), `${g}.${k}`);
    }
  });
});

/**
 * D.Mike — MSA Typ 5 Engine Tests (msa-typ5-engine.test.js)
 * Unit tests for kappa-based attribute MSA engine.
 * See docs/superpowers/specs/2026-07-15-msa-typ5-design.md for the module spec.
 */

import { suite, test, assert, assertClose } from '../test-utils.js';
import { validate, ERR, WARN, cohenKappa } from '../../js/engines/msa-typ5-engine.js';

// Fixture-Loader — löst relativ zur eigenen JS-URL auf, damit
// runner.html-Pfad (../fixtures/...) das richtige Verzeichnis erreicht.
async function loadFixture(name) {
  const resp = await fetch(new URL(`../fixtures/msa/${name}.fixtures.json`, import.meta.url));
  return resp.json();
}

// ─── validate() ────────────────────────────────────────────────
const base = { type: 'binary', levels: ['ok','nok'], ratings: [
  { part: 1, appraiser: 'A', rep: 1, value: 'ok' },
  { part: 1, appraiser: 'A', rep: 2, value: 'ok' },
  { part: 1, appraiser: 'B', rep: 1, value: 'ok' },
  { part: 1, appraiser: 'B', rep: 2, value: 'ok' },
  { part: 2, appraiser: 'A', rep: 1, value: 'nok' },
  { part: 2, appraiser: 'A', rep: 2, value: 'nok' },
  { part: 2, appraiser: 'B', rep: 1, value: 'nok' },
  { part: 2, appraiser: 'B', rep: 2, value: 'nok' },
], references: null };

suite('msa-typ5-engine — validate', () => {
  test('leere ratings → E_NO_RATINGS', () => {
    const r = validate({ ...base, ratings: [] });
    assert(!r.valid);
    assert(r.errors.some(e => e.code === ERR.NO_RATINGS));
  });

  test('nur 1 Teil → E_TOO_FEW_PARTS', () => {
    const r = validate({ ...base, ratings: base.ratings.filter(x => x.part === 1) });
    assert(!r.valid);
    assert(r.errors.some(e => e.code === ERR.TOO_FEW_PARTS));
  });

  test('nur 1 Pruefer → E_TOO_FEW_APPRAISERS', () => {
    const r = validate({ ...base, ratings: base.ratings.filter(x => x.appraiser === 'A') });
    assert(!r.valid);
    assert(r.errors.some(e => e.code === ERR.TOO_FEW_APPRAISERS));
  });

  test('nur 1 Level in Bewertungen → E_TOO_FEW_LEVELS', () => {
    const rs = base.ratings.map(r => ({ ...r, value: 'ok' }));
    const r = validate({ ...base, ratings: rs });
    assert(!r.valid);
    assert(r.errors.some(e => e.code === ERR.TOO_FEW_LEVELS));
  });

  test('Referenzwert ausserhalb levels → E_UNKNOWN_REFERENCE_LEVEL', () => {
    const r = validate({ ...base, references: { 1: 'xxx', 2: 'nok' } });
    assert(!r.valid);
    assert(r.errors.some(e => e.code === ERR.UNKNOWN_REFERENCE_LEVEL));
  });

  test('unbekannter type → E_INVALID_TYPE', () => {
    const r = validate({ ...base, type: 'fuzzy' });
    assert(!r.valid);
    assert(r.errors.some(e => e.code === ERR.INVALID_TYPE));
  });

  test('valider Input → valid, keine Errors', () => {
    const r = validate(base);
    assert(r.valid, `Expected valid, got errors: ${JSON.stringify(r.errors)}`);
    assert(r.errors.length === 0);
  });

  test('unbalancierte Wiederholungen → W_UNBALANCED_REPS', () => {
    const rs = [...base.ratings, { part: 2, appraiser: 'A', rep: 3, value: 'nok' }];
    const r = validate({ ...base, ratings: rs });
    assert(r.valid);
    assert(r.warnings.some(w => w.code === WARN.UNBALANCED_REPS));
  });
});

// ─── cohenKappa (unweighted) ─────────────────────────────────

suite('msa-typ5-engine — cohenKappa (unweighted)', () => {
  test('binary-2rater matcht sklearn-Referenz', async () => {
    const fx = await loadFixture('cohen-kappa');
    const c = fx.test_cases.find(x => x.id === 'binary-2rater');
    // Fixture-Generator sortiert Levels alphabetisch; um Konfusionsmatrix
    // 1:1 zu treffen, denselben Level-Order übergeben.
    const r = cohenKappa(c.inputs.raterA, c.inputs.raterB,
      { levels: ['nok', 'ok'], weights: null, alpha: 0.05 });
    assertClose(r.kappa,     c.expected.kappa,      1e-9);
    assertClose(r.se,        c.expected.se,         1e-9);
    assertClose(r.ci95[0],   c.expected.ci95[0],    1e-9);
    assertClose(r.ci95[1],   c.expected.ci95[1],    1e-9);
    assert(r.method === 'cohen');
    // Konfusions-Matrix elementweise
    for (let i = 0; i < r.confusion.length; i++)
      for (let j = 0; j < r.confusion[i].length; j++)
        assert(r.confusion[i][j] === c.expected.confusion[i][j],
          `confusion[${i}][${j}] = ${r.confusion[i][j]}, expected ${c.expected.confusion[i][j]}`);
  });

  test('nominal-3class-2rater matcht sklearn-Referenz', async () => {
    const fx = await loadFixture('cohen-kappa');
    const c = fx.test_cases.find(x => x.id === 'nominal-3class-2rater');
    const r = cohenKappa(c.inputs.raterA, c.inputs.raterB,
      { levels: ['A', 'B', 'C'], weights: null, alpha: 0.05 });
    assertClose(r.kappa, c.expected.kappa, 1e-9);
    assertClose(r.se,    c.expected.se,    1e-9);
    assert(r.method === 'cohen');
  });
});

// ─── cohenKappa (weighted) ───────────────────────────────────

suite('msa-typ5-engine — cohenKappa (weighted)', () => {
  test('weighted-linear matcht sklearn', async () => {
    const fx = await loadFixture('weighted-kappa');
    const c = fx.test_cases.find(x => x.id === 'ordinal-linear');
    const r = cohenKappa(c.inputs.raterA, c.inputs.raterB,
      { levels: [1, 2, 3, 4, 5], weights: 'linear', alpha: 0.05 });
    assertClose(r.kappa, c.expected.kappa, 1e-9);
    assert(r.method === 'weighted-linear');
  });

  test('weighted-quadratic matcht sklearn', async () => {
    const fx = await loadFixture('weighted-kappa');
    const c = fx.test_cases.find(x => x.id === 'ordinal-quadratic');
    const r = cohenKappa(c.inputs.raterA, c.inputs.raterB,
      { levels: [1, 2, 3, 4, 5], weights: 'quadratic', alpha: 0.05 });
    assertClose(r.kappa, c.expected.kappa, 1e-9);
    assert(r.method === 'weighted-quadratic');
  });
});
